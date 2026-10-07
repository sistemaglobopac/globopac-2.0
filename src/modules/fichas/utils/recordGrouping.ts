import { turnoDoDia } from "@/modules/bordo/api";
import { ensureLocalTime } from "./tempo";
import { instanteDoRegistro } from "./horaMonitoramento";

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
  /** Hora em que o monitoramento foi realizado (informada pelo inspetor); nula em registros antigos. */
  hora_monitoramento?: string | null;
  capturado_em: string | null;
  /** Evidência da confirmação com senha feita no aparelho sem internet (ADR 0016). */
  confirmacao_offline?: { matricula?: string | null; confirmado_em?: string; dispositivo_id?: string; senha_conferida_em?: string | null } | null;
  /** Aceito além das 72 h pela contingência de queda de rede (decidido pelo servidor). */
  fora_do_prazo_offline?: boolean;
  /** Registro original que este aditivo corrige (adendo assinado pelo inspetor). */
  aditivo_de?: string | null;
}

export interface AppointmentDisplay {
  id: string;
  status: StatusVerificacao;
  appt: MonitoramentoVerificacao;
  ordemDia: number;
}

export interface DossieVerificacao {
  chave: string;
  /** Primeiro inspetor do dossiê (compatibilidade). Com cobertura de almoço o dossiê tem vários: ver `userIds`. */
  userId: string;
  /** Todos os inspetores que fizeram monitoramentos deste dossiê (o que cobre o almoço continua a sequência do outro). */
  userIds: string[];
  turno: string;
  dia: string;
  pac: string;
  codigo: string;
  setor: string;
  inspetorNome: string;
  ids: string[];
  /** Só os pendentes "aguardando" de um dossiê com turno fechado entram na assinatura em lote. */
  idsSelecionaveis: string[];
  items: AppointmentDisplay[];
  bloqueado: boolean;
  /** Todos os monitoramentos do dossiê já verificados. */
  verificado: boolean;
}

/** Numera cada ficha (`ficha_template_id`) dentro do mesmo dia local em ordem cronológica
 * crescente (1º, 2º, 3º monitoramento daquela ficha naquele dia) — usado para rotular os
 * cards ("Monitoramento nº X"). */
export function calcularOrdemDia(items: MonitoramentoVerificacao[]): Map<string, number> {
  const porChave = new Map<string, MonitoramentoVerificacao[]>();
  for (const item of items) {
    const dia = ensureLocalTime(instanteDoRegistro(item)).isoLocal;
    const chave = `${dia}-${item.ficha_template_id}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(item);
  }

  const ordem = new Map<string, number>();
  for (const grupo of porChave.values()) {
    grupo.sort((a, b) => new Date(instanteDoRegistro(a)).getTime() - new Date(instanteDoRegistro(b)).getTime());
    grupo.forEach((item, indice) => ordem.set(item.id, indice + 1));
  }
  return ordem;
}

type ComInstante = {
  user_id: string;
  criado_em: string;
  hora_monitoramento?: string | null;
  dados_dinamicos?: Record<string, unknown> | null;
  ficha_template_id: string;
  setor?: string;
};

/** Chave do relatório consolidado: dia local + turno + TIPO de ficha (código sem a versão; setores
 * diferentes entram juntos). NÃO separa por inspetor: quando um inspetor cobre o almoço do outro, ele
 * dá sequência aos monitoramentos dele (se B fez a 2ª apuração, A faz a 3ª) e tudo sai num único
 * relatório consolidado, em ordem de horário. */
export function chaveDossie<T extends ComInstante>(
  m: T,
  tipoDaFicha: (templateId: string) => string = (id) => id,
  turnoDe: (m: T) => string = (r) => turnoDoDia(new Date(instanteDoRegistro(r)))
): string {
  const dia = ensureLocalTime(instanteDoRegistro(m)).isoLocal;
  return `${dia}|${turnoDe(m)}|${tipoDaFicha(m.ficha_template_id)}`;
}

/** Tipo de ficha independente de versão: "RAC-001/006 V2" e "RAC-001/006" são o mesmo tipo (a
 * versão nova do template tem outro id, mas é o mesmo monitoramento). Sem código, cai no id. */
export function tipoPorTemplate(codigoPorTemplateId: Map<string, string>): (templateId: string) => string {
  return (id) => (codigoPorTemplateId.get(id) ?? "").replace(/\s*V\d+\s*$/i, "").trim() || id;
}

/** Setores distintos de um grupo, na ordem em que aparecem ("A / B"). */
export function setoresDoGrupo(items: { setor: string }[]): string {
  return [...new Set(items.map((i) => i.setor))].join(" / ");
}

/** Agrupa por `chaveDossie`, cada grupo em ordem cronológica. Serve às telas que só têm os
 * campos básicos do monitoramento (Painel de Arquivo, Auditoria Federal). */
export function agruparPorDossie<T extends ComInstante>(
  items: T[],
  tipoDaFicha?: (templateId: string) => string,
  turnoDe?: (m: T) => string
): { chave: string; items: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const item of items) {
    const chave = chaveDossie(item, tipoDaFicha, turnoDe);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(item);
  }
  return [...grupos.entries()].map(([chave, lista]) => ({
    chave,
    items: lista.sort((a, b) => new Date(instanteDoRegistro(a)).getTime() - new Date(instanteDoRegistro(b)).getTime()),
  }));
}

/** Monitoramentos do mesmo dia local + turno + tipo de ficha (de qualquer inspetor) são agrupados
 * num único "dossiê" (um card, um relatório consolidado) — inclusive os não conformes e com
 * adendo; a decisão continua item a item na tela de verificação. Grupos com um único item não
 * compensam virar dossiê e voltam para a lista de avulsos. */
export function groupFichaCards(
  items: AppointmentDisplay[],
  blockedIds: Set<string>,
  usersMap: Map<string, string>,
  pacPorTemplateId: Map<string, string>,
  codigoPorTemplateId: Map<string, string>,
  turnoDe: (m: MonitoramentoVerificacao) => string = (m) => turnoDoDia(new Date(instanteDoRegistro(m))),
  /** `porSetor`: setores diferentes NUNCA entram no mesmo dossiê (painel de verificação). Sem isso, a mesma ficha de setores
   * diferentes se junta num único card ("A / B"), como nas telas de arquivo e auditoria. */
  opcoes: { porSetor?: boolean } = {}
): { dossies: DossieVerificacao[]; avulsos: AppointmentDisplay[] } {
  const grupos = new Map<string, DossieVerificacao>();
  for (const item of items) {
    const { appt } = item;
    const chave = chaveDossie(appt, tipoPorTemplate(codigoPorTemplateId), turnoDe) + (opcoes.porSetor ? `|${appt.setor}` : "");

    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        userId: appt.user_id,
        userIds: [],
        turno: turnoDe(appt),
        dia: ensureLocalTime(instanteDoRegistro(appt)).isoLocal,
        pac: pacPorTemplateId.get(appt.ficha_template_id) ?? "—",
        codigo: codigoPorTemplateId.get(appt.ficha_template_id) ?? "",
        setor: appt.setor,
        inspetorNome: usersMap.get(appt.user_id) ?? "Inspetor",
        ids: [],
        idsSelecionaveis: [],
        items: [],
        bloqueado: false,
        verificado: false,
      };
      grupos.set(chave, grupo);
    }
    grupo.ids.push(item.id);
    grupo.items.push(item);
    if (!grupo.userIds.includes(appt.user_id)) grupo.userIds.push(appt.user_id);
  }

  const dossies: DossieVerificacao[] = [];
  const avulsos: AppointmentDisplay[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.items.length < 2) {
      avulsos.push(...grupo.items);
      continue;
    }
    grupo.items.sort((a, b) => new Date(instanteDoRegistro(a.appt)).getTime() - new Date(instanteDoRegistro(b.appt)).getTime());
    grupo.setor = setoresDoGrupo(grupo.items.map((i) => i.appt));
    // Inspetores na ordem em que trabalharam (quem cobre o almoço aparece depois de quem saiu).
    grupo.userIds = [...new Set(grupo.items.map((i) => i.appt.user_id))];
    grupo.inspetorNome = grupo.userIds.map((id) => usersMap.get(id) ?? "Inspetor").join(" / ");
    grupo.ids = grupo.items.map((i) => i.id);
    grupo.bloqueado = grupo.ids.some((id) => blockedIds.has(id));
    grupo.verificado = grupo.items.every((i) => i.status === "verificado");
    grupo.idsSelecionaveis = grupo.bloqueado ? [] : grupo.items.filter((i) => i.status === "aguardando").map((i) => i.id);
    dossies.push(grupo);
  }

  avulsos.sort((a, b) => new Date(instanteDoRegistro(b.appt)).getTime() - new Date(instanteDoRegistro(a.appt)).getTime());
  return { dossies, avulsos };
}

export interface SecaoDeSetor<D extends { setor: string }, A extends { appt: { setor: string } }> {
  setor: string;
  dossies: D[];
  avulsos: A[];
}

/** Separa os cards por setor (uma seção por setor, em ordem alfabética), mantendo dentro de cada seção a ordem recebida:
 * primeiro os dossiês, depois os avulsos. Pressupõe dossiês de um único setor (`groupFichaCards` com `porSetor`). */
export function agruparPorSetor<D extends { setor: string }, A extends { appt: { setor: string } }>(dossies: D[], avulsos: A[]): SecaoDeSetor<D, A>[] {
  const secoes = new Map<string, SecaoDeSetor<D, A>>();
  const secao = (setor: string) => {
    let s = secoes.get(setor);
    if (!s) {
      s = { setor, dossies: [], avulsos: [] };
      secoes.set(setor, s);
    }
    return s;
  };
  for (const d of dossies) secao(d.setor).dossies.push(d);
  for (const a of avulsos) secao(a.appt.setor).avulsos.push(a);
  return [...secoes.values()].sort((a, b) => a.setor.localeCompare(b.setor, "pt-BR"));
}
