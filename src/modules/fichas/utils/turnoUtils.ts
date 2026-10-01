import { supabase } from "@/lib/supabase";

/** Corte de dia em UTC puro (sem ajuste de fuso) — é assim que turnos_inspetores.inicio é
 * comparado ao dia do monitoramento no Painel de Bordo. Não usar o dia ajustado para
 * América/Manaus aqui, ou a comparação diverge para registros criados entre 20h e 23h59
 * (horário de Manaus). */
export function diaTurno(createdAt: string): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

interface TurnoBasico {
  user_id: string;
  fim: string | null;
}

async function turnosAbertosPorDia(porDia: Map<string, Set<string>>): Promise<Set<string>> {
  const abertos = new Set<string>(); // chave "userId|dia"
  for (const [dia, userIds] of porDia) {
    const { data, error } = await supabase
      .from("turnos_inspetores")
      .select("user_id, fim")
      .in("user_id", [...userIds])
      .gte("inicio", `${dia}T00:00:00.000Z`)
      .lte("inicio", `${dia}T23:59:59.999Z`)
      .overrideTypes<TurnoBasico[], { merge: false }>();
    if (error) throw error;
    for (const turno of data ?? []) {
      if (turno.fim === null) abertos.add(`${turno.user_id}|${dia}`);
    }
  }
  return abertos;
}

/** Versão em lote: retorna o Set de IDs de REGISTRO (não de inspetor) cujo autor ainda não
 * fechou o turno do dia daquele registro específico. Nunca trava o fluxo por falha de rede —
 * em caso de erro, libera tudo (Set vazio) e loga um aviso. */
export async function turnosBloqueadosMap(records: { id: string; user_id: string; criado_em: string }[]): Promise<Set<string>> {
  if (records.length === 0) return new Set();
  try {
    const porDia = new Map<string, Set<string>>();
    for (const registro of records) {
      const dia = diaTurno(registro.criado_em);
      if (!porDia.has(dia)) porDia.set(dia, new Set());
      porDia.get(dia)!.add(registro.user_id);
    }

    const abertos = await turnosAbertosPorDia(porDia);

    const bloqueados = new Set<string>();
    for (const registro of records) {
      if (abertos.has(`${registro.user_id}|${diaTurno(registro.criado_em)}`)) bloqueados.add(registro.id);
    }
    return bloqueados;
  } catch (erro) {
    console.warn("turnosBloqueadosMap: falha ao consultar turnos_inspetores, liberando por segurança", erro);
    return new Set();
  }
}

/** Dado um array de monitoramentos, retorna os user_id ÚNICOS cujo turno (do dia de cada
 * registro) ainda não tem `fim` preenchido — usado antes de abrir o modal de assinatura em
 * lote, para bloquear preventivamente se algum inspetor envolvido ainda não finalizou o turno. */
export async function turnosPendentes(records: { user_id: string; criado_em: string }[]): Promise<string[]> {
  const comId = records.map((registro, indice) => ({ ...registro, id: String(indice) }));
  const bloqueados = await turnosBloqueadosMap(comId);
  const userIds = new Set(comId.filter((registro) => bloqueados.has(registro.id)).map((registro) => registro.user_id));
  return [...userIds];
}

/** Ação exclusiva do ADMIN_MASTER para destravar manualmente um inspetor que esqueceu de
 * finalizar o turno. Fecha toda linha aberta daquele inspetor no dia; se não existir nenhuma
 * linha para o dia (o inspetor nunca abriu turno formalmente mas gerou monitoramentos mesmo
 * assim), insere uma já fechada só para destravar a verificação. */
export async function encerrarTurnoAdmin(inspetorId: string, dataTurno: string): Promise<void> {
  const agora = new Date().toISOString();

  const { data: linhas, error: erroBusca } = await supabase
    .from("turnos_inspetores")
    .select("id, fim")
    .eq("user_id", inspetorId)
    .gte("inicio", `${dataTurno}T00:00:00.000Z`)
    .lte("inicio", `${dataTurno}T23:59:59.999Z`)
    .overrideTypes<{ id: string; fim: string | null }[], { merge: false }>();
  if (erroBusca) throw erroBusca;

  const abertas = (linhas ?? []).filter((linha) => linha.fim === null);
  if (abertas.length > 0) {
    const { error } = await supabase
      .from("turnos_inspetores")
      .update({ fim: agora })
      .in(
        "id",
        abertas.map((linha) => linha.id)
      );
    if (error) throw error;
    return;
  }

  if ((linhas ?? []).length === 0) {
    const { error } = await supabase.from("turnos_inspetores").insert({ user_id: inspetorId, inicio: agora, fim: agora });
    if (error) throw error;
  }
}
