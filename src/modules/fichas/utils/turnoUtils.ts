import { supabase } from "@/lib/supabase";
import { horaEmManaus } from "@/modules/bordo/api";
import { instanteDoRegistro } from "./horaMonitoramento";

/** Corte de dia em UTC puro (sem ajuste de fuso) — é assim que turnos_inspetores.inicio é
 * comparado ao dia do monitoramento no Painel de Bordo. Não usar o dia ajustado para
 * América/Manaus aqui, ou a comparação diverge para registros criados entre 20h e 23h59
 * (horário de Manaus). */
export function diaTurno(createdAt: string): string {
  return new Date(createdAt).toISOString().slice(0, 10);
}

export interface TurnoAberto {
  user_id: string;
  inicio: string;
}

/** Turnos ainda ABERTOS (sem fim) dos usuários. Lê pela função do banco `turnos_para_resolucao`: o Verificador e a Inspeção
 * Federal não leem `turnos_inspetores` (RLS: só o ADMIN_MASTER e o próprio dono), e lendo a tabela direto eles não enxergavam
 * nenhum turno aberto — o painel mostrava "Turno Finalizado" para tudo e deixava verificar com o turno ainda aberto. Sem a
 * função (banco sem a migração), cai na leitura direta da tabela. */
async function turnosAbertosDosUsuarios(userIds: string[]): Promise<TurnoAberto[]> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: viaRpc, error: erroRpc } = await (supabase.rpc as any)("turnos_para_resolucao", { p_desde: desde });
  if (!erroRpc) {
    return ((viaRpc ?? []) as { user_id: string; inicio: string; fim: string | null }[])
      .filter((t) => t.fim === null && userIds.includes(t.user_id))
      .map((t) => ({ user_id: t.user_id, inicio: t.inicio }));
  }
  const { data, error } = await supabase
    .from("turnos_inspetores")
    .select("user_id, inicio")
    .in("user_id", userIds)
    .is("fim", null)
    .overrideTypes<TurnoAberto[], { merge: false }>();
  if (error) throw error;
  return data ?? [];
}

/** O monitoramento (feito em `instante`) está com o turno do autor ainda aberto? Vale um turno aberto que começou no MESMO dia
 * (UTC, como turnos_inspetores.inicio) do monitoramento, ou que já estava aberto quando ele foi feito — este cobre o 2º turno
 * (começa 17h de Manaus = 21h UTC) nos monitoramentos depois das 20h, que já caem no dia UTC seguinte. */
export function turnoAbertoParaRegistro(instante: string, userId: string, abertos: TurnoAberto[]): boolean {
  const dia = diaTurno(instante);
  const t = new Date(instante).getTime();
  return abertos.some((a) => a.user_id === userId && (diaTurno(a.inicio) === dia || new Date(a.inicio).getTime() <= t));
}

export interface TurnoInspetorResolucao {
  user_id: string;
  setor: string;
  inicio: string;
  fim: string | null;
}

/** Turno ("1º Turno"/"2º Turno") ao qual um monitoramento pertence: o do turno em que ele foi feito,
 * não o do relógio. Se o monitoramento foi criado com um turno aberto (inicio <= criação <= fim, ou
 * ainda sem fim) — do próprio usuário, ou, na falta, de outro inspetor do mesmo setor (caso de quem
 * continua os monitoramentos do colega, ex.: o admin) — vale o turno em que esse turno foi INICIADO.
 * Sem nenhum turno cobrindo o registro, cai na regra do relógio (`turnoDoDia`). */
export function turnoDoRegistro(
  registro: { user_id: string; setor?: string; criado_em: string; hora_monitoramento?: string | null; dados_dinamicos?: Record<string, unknown> | null },
  turnos: TurnoInspetorResolucao[]
): TurnoHeranca {
  // Pelo instante em que o monitoramento foi REALIZADO (uma continuação de ontem é do turno de ontem).
  const instanteIso = instanteDoRegistro(registro);
  const instante = new Date(instanteIso).getTime();
  const cobrindo = turnos.filter(
    (t) => new Date(t.inicio).getTime() <= instante && (t.fim === null || new Date(t.fim).getTime() >= instante)
  );
  const proprio = cobrindo.filter((t) => t.user_id === registro.user_id);
  const doSetor = cobrindo.filter((t) => t.setor === registro.setor);
  const candidatos = proprio.length > 0 ? proprio : doSetor;
  const escolhido = candidatos.sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0];
  return turnoParaHeranca(new Date(escolhido ? escolhido.inicio : instanteIso));
}

/** Versão em lote: retorna o Set de IDs de REGISTRO (não de inspetor) cujo autor ainda não
 * fechou o turno do dia daquele registro específico. Nunca trava o fluxo por falha de rede —
 * em caso de erro, libera tudo (Set vazio) e loga um aviso. */
export async function turnosBloqueadosMap(records: { id: string; user_id: string; criado_em: string }[]): Promise<Set<string>> {
  if (records.length === 0) return new Set();
  try {
    const abertos = await turnosAbertosDosUsuarios([...new Set(records.map((r) => r.user_id))]);
    const bloqueados = new Set<string>();
    for (const registro of records) {
      if (turnoAbertoParaRegistro(registro.criado_em, registro.user_id, abertos)) bloqueados.add(registro.id);
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

// ---------------------------------------------------------------------------------------
// Turno usado para HERDAR a leitura anterior dos hidrômetros (widgets SPR/Chuveiro): o
// "monitoramento anterior" é o mais recente de hoje, do mesmo tipo de ficha, no mesmo setor E
// NO MESMO TURNO. Regra de dedução por horário de Manaus: 04h–17h = 1º Turno; caso contrário
// 2º Turno (mesma faixa de turnoDoDia() em bordo/api.ts).
// ---------------------------------------------------------------------------------------
export type TurnoHeranca = "1º Turno" | "2º Turno";

export function turnoParaHeranca(referencia: Date): TurnoHeranca {
  const hora = horaEmManaus(referencia);
  return hora >= 4 && hora < 17 ? "1º Turno" : "2º Turno";
}

/** Turno fixo do usuário ("Turno 1"/"Turno 2") vale como está; "Ambos" (ou ausente) deduz pelo
 * horário atual de Manaus. */
export function turnoAlvoHeranca(turnoFixo: "Turno 1" | "Turno 2" | "Ambos" | undefined, agora: Date): TurnoHeranca {
  if (turnoFixo === "Turno 1") return "1º Turno";
  if (turnoFixo === "Turno 2") return "2º Turno";
  return turnoParaHeranca(agora);
}
