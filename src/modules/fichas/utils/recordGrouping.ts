import { turnoDoDia } from "@/modules/bordo/api";
import { ensureLocalTime } from "./tempo";

export type StatusVerificacao = "aguardando" | "adendo_pendente" | "verificado";

export interface MonitoramentoVerificacao {
  id: string;
  ficha_template_id: string;
  user_id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  conformidade: boolean | null;
  verificado_por: string | null;
  verificado_em: string | null;
  criado_em: string;
}

export interface AppointmentDisplay {
  id: string;
  status: StatusVerificacao;
  appt: MonitoramentoVerificacao;
  ordemDia: number;
}

export interface DossieVerificacao {
  chave: string;
  userId: string;
  turno: string;
  dia: string;
  pac: string;
  codigo: string;
  setor: string;
  inspetorNome: string;
  ids: string[];
  items: AppointmentDisplay[];
  bloqueado: boolean;
}

/** Numera cada ficha (`ficha_template_id`) dentro do mesmo dia local em ordem cronológica
 * crescente (1º, 2º, 3º monitoramento daquela ficha naquele dia) — usado para rotular os
 * cards ("Monitoramento nº X"). */
export function calcularOrdemDia(items: MonitoramentoVerificacao[]): Map<string, number> {
  const porChave = new Map<string, MonitoramentoVerificacao[]>();
  for (const item of items) {
    const dia = ensureLocalTime(item.criado_em).isoLocal;
    const chave = `${dia}-${item.ficha_template_id}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(item);
  }

  const ordem = new Map<string, number>();
  for (const grupo of porChave.values()) {
    grupo.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
    grupo.forEach((item, indice) => ordem.set(item.id, indice + 1));
  }
  return ordem;
}

/** Fichas simples (status "aguardando", sem não conformidade registrada) do mesmo
 * user_id + dia local + turno + PAC + setor são agrupadas num único "dossiê" visual em vez de
 * aparecerem como N cards separados. Grupos com um único item não compensam virar dossiê e
 * voltam para a lista de avulsos. */
export function groupFichaCards(
  items: AppointmentDisplay[],
  blockedIds: Set<string>,
  usersMap: Map<string, string>,
  pacPorTemplateId: Map<string, string>,
  codigoPorTemplateId: Map<string, string>
): { dossies: DossieVerificacao[]; avulsos: AppointmentDisplay[] } {
  const agrupaveis: AppointmentDisplay[] = [];
  const avulsos: AppointmentDisplay[] = [];

  for (const item of items) {
    if (item.status === "aguardando" && item.appt.conformidade !== false) {
      agrupaveis.push(item);
    } else {
      avulsos.push(item);
    }
  }

  const grupos = new Map<string, DossieVerificacao>();
  for (const item of agrupaveis) {
    const { appt } = item;
    const dia = ensureLocalTime(appt.criado_em).isoLocal;
    const turno = turnoDoDia(new Date(appt.criado_em));
    const pac = pacPorTemplateId.get(appt.ficha_template_id) ?? "—";
    const chave = `${appt.user_id}|${dia}|${turno}|${pac}|${appt.setor}`;

    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        userId: appt.user_id,
        turno,
        dia,
        pac,
        codigo: codigoPorTemplateId.get(appt.ficha_template_id) ?? "",
        setor: appt.setor,
        inspetorNome: usersMap.get(appt.user_id) ?? "Inspetor",
        ids: [],
        items: [],
        bloqueado: false,
      };
      grupos.set(chave, grupo);
    }
    grupo.ids.push(item.id);
    grupo.items.push(item);
  }

  const dossies: DossieVerificacao[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.items.length < 2) {
      avulsos.push(...grupo.items);
      continue;
    }
    grupo.items.sort((a, b) => new Date(a.appt.criado_em).getTime() - new Date(b.appt.criado_em).getTime());
    grupo.bloqueado = grupo.ids.some((id) => blockedIds.has(id));
    dossies.push(grupo);
  }

  avulsos.sort((a, b) => new Date(b.appt.criado_em).getTime() - new Date(a.appt.criado_em).getTime());
  return { dossies, avulsos };
}
