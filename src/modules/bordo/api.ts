import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import { aplicarNoCaminho } from "@/modules/fichas/utils/adendoCampos";
import { aditivosVigentes, idsAdendosConcluidos } from "@/modules/fichas/utils/adendosPendentes";
import { propagarLeituraNosSeguintes } from "@/modules/fichas/utils/propagacaoCorrecao";
import { ajustesDeCargaDoa, ajustesQueSeAplicam, motivosBloqueioAdendoDoa, recalcularDoaNoRegistro } from "@/modules/fichas/utils/doaCorrecao";
import { horaEfetiva } from "@/modules/fichas/utils/horaMonitoramento";
import { diffCorrecoes, MOTIVO_CORRECAO_MIN_CARACTERES, podeCorrigirMonitoramento, type ResultadoPodeCorrigir } from "@/modules/fichas/utils/correcaoInspetor";
import { turnoParaHeranca } from "@/modules/fichas/utils/turnoUtils";
import { supabase } from "@/lib/supabase";
import type { StatusRnc } from "@/modules/rnc/api";
import type { RegistroVazao } from "./avesNaVazao";
import type { CampoTemplate } from "@/shared/schema-campos";

export type TipoPausa = "CURTA_20M" | "ALMOCO_72M" | "JANTAR_72M";

// America/Manaus é UTC-4 fixo (sem horário de verão) — usado tanto pra decidir 1º/2º turno
// quanto pro corte "hoje" dos KPIs, igual ao resto do painel de qualidade.
export function horaEmManaus(referencia: Date): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", hour12: false }).format(referencia)
  );
}

export function turnoDoDia(referencia: Date): "1º Turno" | "2º Turno" {
  const hora = horaEmManaus(referencia);
  return hora >= 4 && hora < 17 ? "1º Turno" : "2º Turno";
}

export function inicioDoDiaManaus(referencia: Date): Date {
  const dataLocal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referencia);
  return new Date(`${dataLocal}T04:00:00.000Z`);
}

/** Data (AAAA-MM-DD) em America/Manaus — a mesma de fichas_encerradas_dia.dia. */
export function diaManaus(referencia: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(referencia);
}

export interface TurnoHoje {
  id: string;
  inicio: string;
  fim: string | null;
}

/** turnos_inspetores não tem coluna de data — "hoje" é o último turno cujo início caiu dentro
 * do dia corrente (America/Manaus), ou um turno ainda ABERTO iniciado antes da meia-noite (o 2º
 * turno, que começa às 17h, atravessa a virada e só é encerrado às 04h). Sem correspondente na v1 pedida (que lia isso de
 * localStorage, escrito por um fluxo que nunca existiu neste repo) — o Painel de Bordo é quem
 * agora cria/fecha a linha, então o banco é a fonte de verdade, não o navegador. */
export function useTurnoHoje(userId: string | undefined) {
  return useQuery({
    queryKey: ["turnos_inspetores", "hoje", userId],
    meta: { offline: true },
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("turnos_inspetores")
        .select("id, inicio, fim")
        .eq("user_id", userId as string)
        .gte("inicio", new Date(inicioDoDiaManaus(new Date()).getTime() - 24 * 60 * 60 * 1000).toISOString())
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle()
        .overrideTypes<TurnoHoje | null, { merge: false }>();
      if (error) throw error;
      if (data && data.fim !== null && new Date(data.inicio) < inicioDoDiaManaus(new Date())) return null;
      return data;
    },
  });
}

export function useIniciarTurno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; setor: string | null }) => {
      const { error } = await supabase
        .from("turnos_inspetores")
        .insert({ user_id: input.userId, setor: input.setor, inicio: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["turnos_inspetores"] }),
  });
}

export function useFinalizarTurno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (turnoId: string) => {
      const { error } = await supabase.from("turnos_inspetores").update({ fim: new Date().toISOString() }).eq("id", turnoId);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["turnos_inspetores"] }),
  });
}

export interface PausaAtiva {
  id: string;
  tipo_pausa: TipoPausa;
  hora_inicio: string;
}

export function usePausaAtiva(userId: string | undefined) {
  return useQuery({
    queryKey: ["pausas_inspetores", "ativa", userId],
    meta: { offline: true },
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pausas_inspetores")
        .select("id, tipo_pausa, hora_inicio")
        .eq("user_id", userId as string)
        .eq("status", "EM_ANDAMENTO")
        .order("hora_inicio", { ascending: false })
        .limit(1)
        .maybeSingle()
        .overrideTypes<PausaAtiva | null, { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useRegistrarPausa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; tipo: TipoPausa }) => {
      const { error } = await supabase.from("pausas_inspetores").insert({ user_id: input.userId, tipo_pausa: input.tipo });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pausas_inspetores"] }),
  });
}

export function useEncerrarPausa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pausaId: string) => {
      const { error } = await supabase
        .from("pausas_inspetores")
        .update({ status: "CONCLUIDA", hora_fim: new Date().toISOString() })
        .eq("id", pausaId);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["pausas_inspetores"] }),
  });
}

export function useRegistrarParada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      inspetorId: string;
      setor: string;
      equipamento: string | null;
      motivo: string;
      detalhes: string | null;
      horaInicio: string;
      horaFim: string | null;
    }) => {
      const { error } = await supabase.from("paradas_processo").insert({
        inspetor_id: input.inspetorId,
        setor: input.setor,
        equipamento: input.equipamento,
        motivo: input.motivo,
        detalhes: input.detalhes,
        hora_inicio: input.horaInicio,
        hora_fim: input.horaFim,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["paradas_processo"] }),
  });
}

export interface FichaAtivaResumo {
  id: string;
  codigo: string;
  nome: string;
  tipo_apontamento: "Recorrente" | "Demanda";
  tempo_entre_apontamentos_min: number | null;
  locais_aplicacao: string[];
  /** Ficha que depende de haver abate (tem o campo de espera das aves): pode ser "encerrada" no fim
   * do abate para não gerar atraso. Derivado de schema_campos ao carregar os KPIs. */
  encerravel?: boolean;
  /** Ficha marcada no Construtor como "só com o processo em andamento": em atraso, aceita a justificativa "processo parado". */
  exige_processo_em_andamento?: boolean;
  /** Ficha de monitoramento de pragas (tem o campo de ocorrência de pragas): obrigatória pelo menos uma vez por dia — o turno
   * não pode ser finalizado sem ela e o sistema lembra de 2 em 2 horas. Derivado de schema_campos ao carregar os KPIs. */
  exigeDiaria?: boolean;
  /** Ficha de vazão do SPR Carcaças (tem o campo de renovação da água do chiller): é ela que conta as aves de cada carga. */
  vazaoSpr?: boolean;
}

type MonitoramentoComHora = MonitoramentoHoje & { hora_monitoramento: string | null };

export interface MonitoramentoHoje {
  id: string;
  ficha_template_id: string;
  criado_em: string;
  setor?: string;
  /** Quem fez (só na lista do setor, usada nas prévias do Painel de Bordo). */
  user_id?: string;
}

export const PAUSAS_CONFIG: Record<TipoPausa, { label: string; desc: string; limiteMin: number }> = {
  CURTA_20M: { label: "Pausa (20 min)", desc: "Café / Descanso curto", limiteMin: 20 },
  ALMOCO_72M: { label: "Almoço (1h12)", desc: "Pausa principal 1", limiteMin: 72 },
  JANTAR_72M: { label: "Jantar (1h12)", desc: "Pausa principal 2", limiteMin: 72 },
};

export interface FichaAtrasada {
  ficha: FichaAtivaResumo;
  motivo: string;
  /** Minutos além da hora de fazer o monitoramento (já descontada a tolerância) — só quando há um
   * apontamento anterior que define a hora devida. */
  atrasoMin?: number;
  /** Hora (ISO) em que o monitoramento deveria ter sido feito. */
  devidoEm?: string;
}

/** Tolerância após a hora de fazer o monitoramento: só depois de 10 minutos o alerta sonoro toca e o
 * card pulsante aparece. */
export const TOLERANCIA_ATRASO_MIN = 10;

/** Setor em que o inspetor faz esta ficha: o primeiro dos setores dela que o inspetor atende. */
export function setorDaFicha(ficha: Pick<FichaAtivaResumo, "locais_aplicacao">, userSetores: string[]): string {
  return ficha.locais_aplicacao?.find((s) => userSetores.includes(s)) ?? userSetores[0] ?? "";
}

/** Link que abre a ficha direto no setor certo (NovaFichaPage lê ?ficha=&setor=). */
export function urlNovaFicha(ficha: Pick<FichaAtivaResumo, "id" | "locais_aplicacao">, userSetores: string[]): string {
  return `/fichas/nova?ficha=${ficha.id}&setor=${encodeURIComponent(setorDaFicha(ficha, userSetores))}`;
}

/** Motivos oferecidos quando não há catálogo de desvios cadastrado (parada de processo e processo parado). */
export const MOTIVOS_PARADA_FALLBACK = ["Higiene Operacional", "Manutenção Quebra", "Contaminação", "Falta de Matéria-Prima", "Intervenção SIF"];

/** "Processo parado": justificativa do inspetor para o monitoramento que não foi feito porque o processo
 * estava parado. Dispensa o período em atraso; a cobrança volta no período seguinte. */
export interface ProcessoParado {
  ficha_codigo: string;
  /** Início do período em atraso dispensado (ISO). */
  referencia_em: string;
  motivo?: string;
  registrado_em?: string;
}

/** Período em atraso que a justificativa dispensa: o último horário devido (devidoEm + k × intervalo) que já
 * passou até `agora`. O próximo é cobrado um intervalo depois dele. */
export function referenciaDoProcessoParado(devidoEm: Date, intervaloMin: number, agora: Date): Date {
  const passo = intervaloMin * 60_000;
  const periodos = Math.max(0, Math.floor((agora.getTime() - devidoEm.getTime()) / passo));
  return new Date(devidoEm.getTime() + periodos * passo);
}

/** Quando o sistema volta a cobrar a ficha depois do processo parado. */
export function proximaCobrancaAposParada(referenciaEm: string | Date, intervaloMin: number): Date {
  return new Date(new Date(referenciaEm).getTime() + intervaloMin * 60_000);
}

/** Fichas com o processo parado ainda sem cobrança: a justificativa vigente, até chegar o próximo horário devido. */
export function paradasVigentes(
  fichasAplicaveis: FichaAtivaResumo[],
  paradas: readonly ProcessoParado[],
  agora: Date
): { ficha: FichaAtivaResumo; parada: ProcessoParado; voltaEm: Date }[] {
  const resultado: { ficha: FichaAtivaResumo; parada: ProcessoParado; voltaEm: Date }[] = [];
  for (const ficha of fichasAplicaveis) {
    const intervalo = ficha.tempo_entre_apontamentos_min;
    if (!intervalo || intervalo <= 0) continue;
    const doCodigo = paradas.filter((p) => p.ficha_codigo === ficha.codigo);
    if (doCodigo.length === 0) continue;
    const parada = doCodigo.reduce((a, b) => (new Date(b.referencia_em) > new Date(a.referencia_em) ? b : a));
    const voltaEm = proximaCobrancaAposParada(parada.referencia_em, intervalo);
    if (agora < voltaEm) resultado.push({ ficha, parada, voltaEm });
  }
  return resultado;
}

export interface ResumoFichasSetor {
  setor: string;
  /** Fichas de monitoramento existentes (ativas) para o setor. */
  total: number;
  /** Dessas, quantas já foram iniciadas (ao menos 1 monitoramento) neste turno. */
  iniciadas: number;
  /** ids das fichas já iniciadas neste turno. */
  idsIniciadas: string[];
}

/** Card "Fichas Ativas": por setor do inspetor, quantas fichas existem e quantas já foram iniciadas
 * NESTE turno (monitoramento criado a partir do início do turno — inclui os em andamento). */
export function resumoFichasPorSetor(
  fichasAplicaveis: FichaAtivaResumo[],
  monitoramentosHoje: { ficha_template_id: string; criado_em: string; setor?: string }[],
  userSetores: string[],
  turnoInicio: Date
): ResumoFichasSetor[] {
  const doTurno = monitoramentosHoje.filter((m) => new Date(m.criado_em).getTime() >= turnoInicio.getTime());
  return userSetores
    .map((setor) => {
      const fichas = fichasAplicaveis.filter((f) => f.locais_aplicacao?.includes(setor));
      // Sem `setor` no monitoramento (dado antigo em cache), vale qualquer setor do inspetor.
      const idsIniciadas = fichas
        .filter((f) => doTurno.some((m) => m.ficha_template_id === f.id && (m.setor === undefined || m.setor === setor)))
        .map((f) => f.id);
      return { setor, total: fichas.length, iniciadas: idsIniciadas.length, idsIniciadas };
    })
    .filter((r) => r.total > 0);
}

export function fichasAplicaveisAoInspetor(fichasAtivas: FichaAtivaResumo[], userSetores: string[]): FichaAtivaResumo[] {
  return fichasAtivas.filter((f) => f.locais_aplicacao?.some((s) => userSetores.includes(s)));
}

/** Ficha "atrasada": recorrente, aplicável ao inspetor, cujo último apontamento do dia já passou de
 * tempo_entre_apontamentos_min + 10 minutos de tolerância (Painel de Bordo, seção 8). O aviso só
 * existe a partir do PRIMEIRO monitoramento realizado (sem apontamento não há hora devida) e fichas
 * com intervalo 0 (ou sem intervalo) nunca geram aviso de atraso. Compartilhada entre o
 * próprio Painel de Bordo (KPI) e o GlobalInspectorAlerts (alerta cross-página) — uma única
 * implementação, nunca duas fórmulas de atraso divergentes. */
export function calcularFichasAtrasadas(
  fichasAplicaveis: FichaAtivaResumo[],
  monitoramentosHoje: { ficha_template_id: string; criado_em: string }[],
  agora: Date,
  /** Códigos das fichas encerradas hoje (informado "sem veículos com cargas vivas nos boxes"): nunca geram aviso de atraso. */
  codigosEncerrados: ReadonlySet<string> = new Set(),
  /** Processo parado justificado: o período dispensado conta como se tivesse sido feito, então a próxima
   * cobrança vem um intervalo depois dele. */
  paradas: readonly ProcessoParado[] = []
): FichaAtrasada[] {
  const ultimoPorFicha = new Map<string, Date>();
  for (const m of monitoramentosHoje) {
    const criado = new Date(m.criado_em);
    const atual = ultimoPorFicha.get(m.ficha_template_id);
    if (!atual || criado > atual) ultimoPorFicha.set(m.ficha_template_id, criado);
  }

  const atrasadas: FichaAtrasada[] = [];

  for (const ficha of fichasAplicaveis) {
    if (ficha.tipo_apontamento !== "Recorrente") continue;
    if (codigosEncerrados.has(ficha.codigo)) continue;
    let ultimo = ultimoPorFicha.get(ficha.id);
    // Sem monitoramento realizado ainda: não há hora devida, logo não há aviso de atraso.
    if (!ultimo) continue;
    for (const p of paradas) {
      if (p.ficha_codigo !== ficha.codigo) continue;
      const referencia = new Date(p.referencia_em);
      if (referencia > ultimo) ultimo = referencia;
    }
    // Intervalo 0 (ou ausente): sem aviso de atraso.
    if (ficha.tempo_entre_apontamentos_min != null && ficha.tempo_entre_apontamentos_min > 0) {
      const devidoMs = ultimo.getTime() + ficha.tempo_entre_apontamentos_min * 60 * 1000;
      const limiteMs = devidoMs + TOLERANCIA_ATRASO_MIN * 60 * 1000;
      if (agora.getTime() > limiteMs) {
        const atrasoMin = Math.floor((agora.getTime() - devidoMs) / 60000);
        atrasadas.push({
          ficha,
          motivo: `Monitoramento atrasado há ${atrasoMin} min`,
          atrasoMin,
          devidoEm: new Date(devidoMs).toISOString(),
        });
      }
    }
  }

  return atrasadas;
}

/** O schema da ficha tem o campo de ocorrência de pragas? (= ficha de monitoramento de pragas.) */
export function temCampoDePragas(schemaCampos: { tipo?: string }[] | null | undefined): boolean {
  return Array.isArray(schemaCampos) && schemaCampos.some((c) => c?.tipo === "ocorrencia_pragas");
}

export interface PragaRealizada {
  codigo: string;
  /** Hora do monitoramento (ISO). */
  instante: string;
}

/** Lembrete do monitoramento de pragas pendente: de 2 em 2 horas, contadas do início do turno. */
export const INTERVALO_LEMBRETE_PRAGAS_MIN = 120;

/** "Hoje" do monitoramento de pragas: o dia corrente ou, se o turno começou antes da meia-noite (2º turno, 17h às 04h), o turno todo. */
export function inicioJanelaPragas(inicioTurno: Date | null, agora: Date): Date {
  const inicioDia = inicioDoDiaManaus(agora);
  return inicioTurno && inicioTurno < inicioDia ? inicioTurno : inicioDia;
}

/** Fichas de pragas aplicáveis ao inspetor que ainda NÃO foram monitoradas hoje (por ele, por quem cobriu o setor ou em
 * rascunho). O turno só pode ser finalizado com esta lista vazia. */
export function pragasPendentes(
  fichasAplicaveis: FichaAtivaResumo[],
  realizadas: readonly PragaRealizada[],
  rascunhos: readonly { ficha_template_id: string; criado_em: string }[],
  inicioTurno: Date | null,
  agora: Date
): FichaAtivaResumo[] {
  const desdeMs = inicioJanelaPragas(inicioTurno, agora).getTime();
  return fichasAplicaveis.filter(
    (f) =>
      f.exigeDiaria === true &&
      !realizadas.some((r) => r.codigo === f.codigo && new Date(r.instante).getTime() >= desdeMs) &&
      !rascunhos.some((r) => r.ficha_template_id === f.id && new Date(r.criado_em).getTime() >= desdeMs)
  );
}

/** Nº do lembrete vigente (1 = 2 h após o início do turno, 2 = 4 h…); 0 = ainda não é hora do primeiro. Cada número é um
 * lembrete novo: dispensar ("Ciente") vale só até o próximo. */
export function numeroDoLembretePragas(inicioTurno: Date, agora: Date): number {
  return Math.max(0, Math.floor((agora.getTime() - inicioTurno.getTime()) / (INTERVALO_LEMBRETE_PRAGAS_MIN * 60_000)));
}

export interface DesvioAtivo {
  monitoramentoId: string;
  fichaTemplateId: string;
  criadoEm: string;
  rnc: { id: string; status: StatusRnc } | null;
}

interface AdendoBruto {
  id: string;
  status: string;
  monitorId: string;
  verificadorName?: string;
  notes?: string;
  corrections?: Record<string, { old: unknown; new: unknown; rotulo?: string }>;
}

/** Adendos que aguardam a assinatura do inspetor `userId` nos registros dados (e que o aditivo vigente não concluiu).
 * O mesmo adendo pode estar no original e no aditivo: aparece uma vez só. */
export function coletarAdendosPendentes(
  registros: { id: string; dados_dinamicos: Record<string, unknown> | null }[],
  concluidos: Set<string>,
  userId: string
): AdendoPendente[] {
  const pendentes: AdendoPendente[] = [];
  const vistos = new Set<string>();
  for (const m of registros) {
    const adendos = (m.dados_dinamicos as { adendos?: AdendoBruto[] } | null)?.adendos;
    if (!Array.isArray(adendos)) continue;
    for (const adendo of adendos) {
      if (adendo.status === "pending_monitor" && adendo.monitorId === userId && !concluidos.has(adendo.id) && !vistos.has(adendo.id)) {
        vistos.add(adendo.id);
        pendentes.push({
          id: adendo.id,
          monitoramentoId: m.id,
          verificadorName: adendo.verificadorName ?? "Verificador",
          notes: adendo.notes ?? "",
          corrections: adendo.corrections ?? {},
        });
      }
    }
  }
  return pendentes;
}

export interface AdendoPendente {
  id: string;
  monitoramentoId: string;
  verificadorName: string;
  notes: string;
  corrections: Record<string, { old: unknown; new: unknown; rotulo?: string }>;
}

export interface KpisTurno {
  monitoramentosHoje: MonitoramentoHoje[];
  /** Monitoramentos de hoje nos setores do inspetor, de QUALQUER inspetor: quem cobre o almoço de outro continua a
   * sequência dele, então atraso e "fichas iniciadas" olham o setor, não só o que este inspetor fez. */
  monitoramentosDoSetorHoje: MonitoramentoHoje[];
  fichasAtivas: FichaAtivaResumo[];
  /** Códigos das fichas com o informe "sem veículos com cargas vivas nos boxes". */
  fichasEncerradasHoje: string[];
  /** Justificativas de "processo parado" registradas hoje (de qualquer inspetor). */
  processosParadosHoje: ProcessoParado[];
  /** Monitoramentos de pragas (qualquer versão da ficha, qualquer inspetor) feitos nos setores do inspetor nas últimas 36 h. */
  pragasRealizadas: PragaRealizada[];
  desviosAtivos: DesvioAtivo[];
  adendosPendentes: AdendoPendente[];
  nomesFicha: Map<string, { codigo: string; nome: string }>;
}

/** Agregação de KPIs do turno (Painel de Bordo, seção 8) — um "desvio ativo" aqui é qualquer
 * monitoramento próprio com conformidade=false (não importa se isso veio de reprovação do
 * Verificador ou de um limiar de tolerância configurado no Construtor de Fichas — o painel só
 * reage ao dado, não decide como ele nasceu) que ainda não tem RNC vinculada FECHADA. Roda a
 * cada 15s (refetchInterval) e é invalidada por realtime em monitoramentos (ver PainelBordo). */
export function useKpisTurno(userId: string | undefined, userSetores: string[]) {
  return useQuery({
    queryKey: ["painel-bordo", "kpis", userId, userSetores],
    meta: { offline: true },
    enabled: !!userId && userSetores.length > 0,
    refetchInterval: 15_000,
    queryFn: async (): Promise<KpisTurno> => {
      // "Hoje" e atraso pela hora em que o monitoramento foi REALIZADO (informada pelo inspetor),
      // não pela da assinatura (registros antigos, sem hora informada, usam criado_em).
      const desdeHoje = inicioDoDiaManaus(new Date()).toISOString();
      const filtroHoje = `hora_monitoramento.gte.${desdeHoje},and(hora_monitoramento.is.null,criado_em.gte.${desdeHoje})`;
      const [
        { data: monitoramentosHoje, error: erroHoje },
        { data: monitoramentosDoSetor, error: erroSetor },
        { data: recentes, error: erroRecentes },
        { data: fichasAtivasBrutas, error: erroFichas },
        { data: encerradas },
        { data: processosParados },
      ] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em, hora_monitoramento, setor")
          .is("aditivo_de", null) // a correção por adendo não é um monitoramento novo: não conta nem zera o atraso
          .eq("user_id", userId as string)
          .in("setor", userSetores)
          .or(filtroHoje)
          .overrideTypes<MonitoramentoComHora[], { merge: false }>(),
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em, hora_monitoramento, setor, user_id")
          .is("aditivo_de", null)
          .in("setor", userSetores)
          .or(filtroHoje)
          .overrideTypes<MonitoramentoComHora[], { merge: false }>(),
        supabase
          .from("monitoramentos_vigentes")
          .select("id, ficha_template_id, criado_em, conformidade, dados_dinamicos, aditivo_de")
          .eq("user_id", userId as string)
          .order("criado_em", { ascending: false })
          .limit(50)
          .overrideTypes<
            {
              id: string;
              ficha_template_id: string;
              criado_em: string;
              conformidade: boolean | null;
              dados_dinamicos: Record<string, unknown>;
              aditivo_de: string | null;
            }[],
            { merge: false }
          >(),
        supabase
          .from("fichas_templates")
          .select("id, codigo, nome, tipo_apontamento, tempo_entre_apontamentos_min, exige_processo_em_andamento, locais_aplicacao, schema_campos")
          .eq("ativo", true)
          .overrideTypes<(FichaAtivaResumo & { schema_campos: { tipo?: string }[] | null })[], { merge: false }>(),
        // Erro aqui (ex.: migração ainda não aplicada) só significa "nenhuma ficha encerrada".
        supabase
          .from("fichas_encerradas_dia")
          .select("codigo")
          .eq("dia", diaManaus(new Date()))
          .overrideTypes<{ codigo: string }[], { merge: false }>(),
        // Idem: sem a migração, ninguém tem processo parado registrado.
        supabase
          .from("monitoramentos_processo_parado")
          .select("ficha_codigo, referencia_em, motivo, registrado_em")
          .gte("registrado_em", desdeHoje)
          .overrideTypes<ProcessoParado[], { merge: false }>(),
      ]);
      const fichasAtivas: FichaAtivaResumo[] = (fichasAtivasBrutas ?? []).map(({ schema_campos, ...ficha }) => ({
        ...ficha,
        encerravel: Array.isArray(schema_campos) && schema_campos.some((c) => c?.tipo === "espera_aves"),
        exigeDiaria: temCampoDePragas(schema_campos),
        vazaoSpr: Array.isArray(schema_campos) && schema_campos.some((c) => c?.tipo === "chiller_carcacas"),
      }));

      // Monitoramento de pragas (obrigatório 1x/dia): o turno pode atravessar a meia-noite, então busca as últimas 36 h e
      // quem decide o que vale é pragasPendentes (janela do turno). Reeditar a ficha cria outro template com o mesmo código.
      const pragasRealizadas: PragaRealizada[] = [];
      const codigosPragas = fichasAtivas.filter((f) => f.exigeDiaria).map((f) => f.codigo);
      if (codigosPragas.length > 0) {
        const { data: versoes } = await supabase.from("fichas_templates").select("id, codigo").in("codigo", codigosPragas);
        const codigoPorId = new Map((versoes ?? []).map((v) => [v.id as string, v.codigo as string]));
        const desde = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
        const { data: feitos } = await supabase
          .from("monitoramentos")
          .select("ficha_template_id, criado_em, hora_monitoramento")
          .in("ficha_template_id", [...codigoPorId.keys()])
          .in("setor", userSetores)
          .or(`hora_monitoramento.gte.${desde},and(hora_monitoramento.is.null,criado_em.gte.${desde})`)
          .overrideTypes<{ ficha_template_id: string; criado_em: string; hora_monitoramento: string | null }[], { merge: false }>();
        for (const m of feitos ?? []) {
          const codigo = codigoPorId.get(m.ficha_template_id);
          if (codigo) pragasRealizadas.push({ codigo, instante: m.hora_monitoramento ?? m.criado_em });
        }
      }

      if (erroHoje) throw erroHoje;
      if (erroSetor) throw erroSetor;
      if (erroRecentes) throw erroRecentes;
      if (erroFichas) throw erroFichas;

      // NC decidida pelo Verificador (conformidade=false) OU já apontada no preenchimento assinado
      // (conformidade ainda null) — o inspetor deve emitir a RNC assim que assina, sem esperar.
      const desviosCandidatos = (recentes ?? []).filter(
        (m) => m.conformidade === false || (m.conformidade === null && temNaoConformidade(m.dados_dinamicos))
      );
      const idsDesvios = desviosCandidatos.map((m) => m.id);

      const { data: rncsVinculadas, error: erroRnc } =
        idsDesvios.length > 0
          ? await supabase
              .from("rnc")
              .select("id, monitoramento_id, status")
              .in("monitoramento_id", idsDesvios)
              .overrideTypes<{ id: string; monitoramento_id: string | null; status: StatusRnc }[], { merge: false }>()
          : { data: [] as { id: string; monitoramento_id: string | null; status: StatusRnc }[], error: null };
      if (erroRnc) throw erroRnc;

      const rncPorMonitoramento = new Map((rncsVinculadas ?? []).map((r) => [r.monitoramento_id, r]));

      // Autocorreção imediata (alternativa à RNC): restabelece a conformidade, então o desvio sai da lista de
      // pendentes. Erro aqui (ex.: migração ainda não aplicada) só significa "nenhuma autocorreção".
      const { data: autocorrecoes } =
        idsDesvios.length > 0
          ? await supabase
              .from("autocorrecoes_imediatas")
              .select("monitoramento_id")
              .in("monitoramento_id", idsDesvios)
              .overrideTypes<{ monitoramento_id: string }[], { merge: false }>()
          : { data: [] as { monitoramento_id: string }[] };
      const autocorrigidos = new Set((autocorrecoes ?? []).map((a) => a.monitoramento_id));

      const desviosAtivos: DesvioAtivo[] = desviosCandidatos
        .map((m) => {
          const rnc = rncPorMonitoramento.get(m.id);
          return {
            monitoramentoId: m.id,
            fichaTemplateId: m.ficha_template_id,
            criadoEm: m.criado_em,
            rnc: rnc ? { id: rnc.id, status: rnc.status } : null,
          };
        })
        .filter((d) => (d.rnc === null ? !autocorrigidos.has(d.monitoramentoId) : d.rnc.status !== "FECHADA"));

      // Adendos pedidos pelo Verificador: o registro pedido pode ser de QUALQUER dia (inspetores com dezenas de monitoramentos por
      // dia têm o registro bem além dos 50 mais recentes). Por isso buscam-se, no servidor, os registros do inspetor com adendo
      // pendente e os aditivos que os concluem — não só a janela dos 50 mais recentes. Falha nesta busca cai só na janela.
      type RegistroAdendo = { id: string; dados_dinamicos: Record<string, unknown>; aditivo_de: string | null; criado_em: string };
      const { data: comAdendo } = await supabase
        .from("monitoramentos")
        .select("id, dados_dinamicos, aditivo_de, criado_em")
        .eq("user_id", userId as string)
        .contains("dados_dinamicos", { adendos: [{ status: "pending_monitor", monitorId: userId }] })
        .order("criado_em", { ascending: false })
        .limit(500)
        .overrideTypes<RegistroAdendo[], { merge: false }>();
      // Cadeias com pendência: o original e TODOS os aditivos dele — o pedido pode estar no original ou num aditivo (adendo aberto
      // depois), e só o aditivo vigente (o mais recente) diz o que já foi assinado.
      const raizes = [...new Set((comAdendo ?? []).map((m) => m.aditivo_de ?? m.id))];
      const { data: aditivos } =
        raizes.length > 0
          ? await supabase.from("monitoramentos").select("id, dados_dinamicos, aditivo_de, criado_em").in("aditivo_de", raizes).overrideTypes<RegistroAdendo[], { merge: false }>()
          : { data: [] as RegistroAdendo[] };
      const vigentesDasCadeias = new Set(aditivosVigentes(aditivos ?? []).map((a) => a.id));
      const antigos = new Set((aditivos ?? []).filter((a) => !vigentesDasCadeias.has(a.id)).map((a) => a.id));
      const registrosComAdendo = [...new Map([...(recentes ?? []), ...(comAdendo ?? []), ...(aditivos ?? [])].map((m) => [m.id, m])).values()].filter(
        (m) => !antigos.has(m.id) // aditivo antigo: o vigente já traz tudo o que ele tinha, com o que foi assinado depois
      );
      const adendosConcluidos = idsAdendosConcluidos(aditivos ?? []);
      const adendosPendentes = coletarAdendosPendentes(registrosComAdendo, adendosConcluidos, userId as string);

      const nomesFicha = new Map<string, { codigo: string; nome: string }>();
      for (const f of fichasAtivas) nomesFicha.set(f.id, { codigo: f.codigo, nome: f.nome });
      const idsFaltantes = Array.from(
        new Set([...(monitoramentosHoje ?? []).map((m) => m.ficha_template_id), ...desviosAtivos.map((d) => d.fichaTemplateId)])
      ).filter((id) => !nomesFicha.has(id));
      if (idsFaltantes.length > 0) {
        const { data: fichasFaltantes, error: erroFaltantes } = await supabase
          .from("fichas_templates")
          .select("id, codigo, nome")
          .in("id", idsFaltantes)
          .overrideTypes<{ id: string; codigo: string; nome: string }[], { merge: false }>();
        if (erroFaltantes) throw erroFaltantes;
        for (const f of fichasFaltantes ?? []) nomesFicha.set(f.id, { codigo: f.codigo, nome: f.nome });
      }

      // Ficha reeditada ganha um template novo com o MESMO código: o monitoramento antigo aponta para a
      // versão inativa. Para contagem de iniciadas/atrasos, ele vale para a versão ativa do mesmo código.
      const idsNaoAtivos = Array.from(
        new Set([...(monitoramentosHoje ?? []), ...(monitoramentosDoSetor ?? [])].map((m) => m.ficha_template_id))
      ).filter((id) => !fichasAtivas.some((f) => f.id === id));
      const versaoAtivaPorTemplate = new Map<string, string>();
      if (idsNaoAtivos.length > 0) {
        // Função do banco: o inspetor não lê templates inativos (RLS), justamente os antigos.
        const { data: antigos } = await supabase.rpc("codigos_de_templates", { p_ids: idsNaoAtivos });
        for (const antigo of (antigos as unknown as { id: string; codigo: string }[] | null) ?? []) {
          const ativa = fichasAtivas.find((f) => f.codigo === antigo.codigo);
          if (ativa) versaoAtivaPorTemplate.set(antigo.id, ativa.id);
        }
      }
      const normalizar = (lista: MonitoramentoComHora[] | null): MonitoramentoHoje[] =>
        (lista ?? []).map(({ hora_monitoramento, ...m }) => {
          const efetivo = { ...m, criado_em: hora_monitoramento ?? m.criado_em };
          return versaoAtivaPorTemplate.has(m.ficha_template_id) ? { ...efetivo, ficha_template_id: versaoAtivaPorTemplate.get(m.ficha_template_id)! } : efetivo;
        });

      return { monitoramentosHoje: normalizar(monitoramentosHoje), monitoramentosDoSetorHoje: normalizar(monitoramentosDoSetor), fichasAtivas, fichasEncerradasHoje: (encerradas ?? []).map((e) => e.codigo), processosParadosHoje: processosParados ?? [], pragasRealizadas, desviosAtivos, adendosPendentes, nomesFicha };
    },
  });
}

/** "Sem veículos com cargas vivas nos boxes": silencia, até o fim do dia, o aviso de atraso de uma ficha que depende de
 * haver abate (ex.: bem-estar nos boxes de espera). Reabrir desfaz. Vale por código da ficha. */
/** Monitoramentos de vazão (SPR Carcaças) do dia de abate, de QUALQUER inspetor dos setores informados — a base da
 * conferência "aves programadas × aves contadas" (ver avesNaVazao.ts). Vale o valor corrigido: o original que ganhou um
 * aditivo (adendo do Verificador) sai da lista e entra o aditivo. `dia` = AAAA-MM-DD (America/Manaus). */
export function useRegistrosVazaoDoDia(dia: string | undefined, userSetores: string[], habilitado: boolean) {
  return useQuery({
    queryKey: ["painel-bordo", "vazao-do-dia", dia, userSetores],
    meta: { offline: true },
    enabled: habilitado && !!dia && userSetores.length > 0,
    refetchInterval: 30_000,
    queryFn: async (): Promise<RegistroVazao[]> => {
      // Reeditar a ficha cria outro template: vale qualquer versão que tenha o campo de vazão.
      const { data: templates, error: erroTemplates } = await supabase
        .from("fichas_templates")
        .select("id, schema_campos")
        .contains("schema_campos", JSON.stringify([{ tipo: "chiller_carcacas" }]))
        .overrideTypes<{ id: string; schema_campos: { tipo?: string; chave?: string }[] }[], { merge: false }>();
      if (erroTemplates) throw erroTemplates;
      const chavePorTemplate = new Map(
        (templates ?? []).map((t) => [t.id, t.schema_campos.find((c) => c?.tipo === "chiller_carcacas")?.chave] as const)
      );
      if (chavePorTemplate.size === 0) return [];

      const desde = `${dia}T04:00:00.000Z`;
      // Visão de versões vigentes: o original corrigido por adendo sai e entra a correção (sem contar a mesma carga duas vezes).
      const { data, error } = await supabase
        .from("monitoramentos_vigentes")
        .select("id, ficha_template_id, dados_dinamicos")
        .in("ficha_template_id", [...chavePorTemplate.keys()])
        .in("setor", userSetores)
        .or(`hora_monitoramento.gte.${desde},and(hora_monitoramento.is.null,criado_em.gte.${desde})`)
        .overrideTypes<{ id: string; ficha_template_id: string; dados_dinamicos: Record<string, unknown> | null }[], { merge: false }>();
      if (error) throw error;
      return (data ?? []).map((m) => {
        const chave = chavePorTemplate.get(m.ficha_template_id);
        return { carcacas: chave ? (m.dados_dinamicos?.[chave] as RegistroVazao["carcacas"]) : undefined };
      });
    },
  });
}

export interface PreviaMonitoramento {
  id: string;
  user_id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  criado_em: string;
  hora_monitoramento: string | null;
  finalizado_em: string | null;
  conformidade: boolean | null;
  situacao_conformidade: "CONFORME" | "NAO_CONFORME" | "TRATADO" | null;
  verificado_por: string | null;
  /** Este é o registro corrigido por adendo (o original continua guardado, só não aparece). */
  corrigidoPorAdendo: boolean;
  ficha: { codigo: string; nome: string; schema_campos: CampoTemplate[] } | null;
}

/** Prévia SOMENTE LEITURA de um monitoramento do turno: os dados coletados, quem fez e a situação. O inspetor lê os
 * monitoramentos de qualquer inspetor que divida o setor com ele (monitoramentos_select já permite; nada novo no banco). */
export function usePreviaMonitoramento(monitoramentoId: string | null) {
  return useQuery({
    queryKey: ["painel-bordo", "previa", monitoramentoId],
    enabled: !!monitoramentoId,
    queryFn: async (): Promise<PreviaMonitoramento | null> => {
      const colunas = "id, ficha_template_id, user_id, setor, dados_dinamicos, criado_em, hora_monitoramento, finalizado_em, conformidade, situacao_conformidade, verificado_por";
      type Linha = Omit<PreviaMonitoramento, "ficha" | "corrigidoPorAdendo"> & { ficha_template_id: string };
      const { data: original, error } = await supabase.from("monitoramentos").select(colunas).eq("id", monitoramentoId as string).maybeSingle().overrideTypes<Linha | null, { merge: false }>();
      if (error) throw error;
      if (!original) return null;
      // O monitoramento corrigido por adendo mostra a versão VIGENTE (a correção mais recente); o original fica no histórico.
      let data: Linha = original;
      let corrigidoPorAdendo = false;
      for (let nivel = 0; nivel < 8; nivel++) {
        const { data: corrigido } = await supabase
          .from("monitoramentos")
          .select(colunas)
          .eq("aditivo_de", data.id)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle()
          .overrideTypes<Linha | null, { merge: false }>();
        if (!corrigido) break;
        data = corrigido;
        corrigidoPorAdendo = true;
      }
      const { ficha_template_id, ...resto } = data;
      const { data: ficha } = await supabase
        .from("fichas_templates")
        .select("codigo, nome, schema_campos")
        .eq("id", ficha_template_id)
        .maybeSingle()
        .overrideTypes<PreviaMonitoramento["ficha"], { merge: false }>();
      return { ...resto, corrigidoPorAdendo, ficha: ficha ?? null };
    },
  });
}

/** O monitoramento corrigido por adendo tem uma versão mais recente (aditivo): o relatório mostra a VIGENTE, não o original. Devolve o
 * id da correção mais recente, ou o próprio id se não houve correção. */
export function useIdVigenteDoMonitoramento(monitoramentoId: string | null) {
  return useQuery({
    queryKey: ["painel-bordo", "id-vigente", monitoramentoId],
    enabled: !!monitoramentoId,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id")
        .eq("aditivo_de", monitoramentoId as string)
        .order("criado_em", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .overrideTypes<{ id: string }[], { merge: false }>();
      if (error) throw error;
      return data?.[0]?.id ?? (monitoramentoId as string);
    },
  });
}

export function useEncerrarFichaDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from("fichas_encerradas_dia").insert({ codigo, dia: diaManaus(new Date()) });
      // 23505: já encerrada por outro inspetor — o resultado é o mesmo.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] }),
  });
}

export function useReabrirFichaDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (codigo: string) => {
      const { error } = await supabase.from("fichas_encerradas_dia").delete().eq("codigo", codigo).eq("dia", diaManaus(new Date()));
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] }),
  });
}

/** "Processo parado": o inspetor justifica por que o monitoramento em atraso não foi feito. A cobrança só volta
 * no período seguinte (ver referenciaDoProcessoParado). Registro de auditoria — só insere. */
export function useRegistrarProcessoParado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fichaCodigo: string; setor: string | null; referenciaEm: Date; motivo: string; detalhes: string | null }) => {
      const { error } = await supabase.from("monitoramentos_processo_parado").insert({
        ficha_codigo: input.fichaCodigo,
        setor: input.setor,
        referencia_em: input.referenciaEm.toISOString(),
        motivo: input.motivo,
        detalhes: input.detalhes,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] }),
  });
}

/** Assinatura de adendo (Painel de Bordo, seção 16) — NUNCA faz UPDATE em dados_dinamicos: o
 * trigger trg_bloqueia_edicao_liberado bloqueia qualquer UPDATE em monitoramento já liberado
 * ao SIF, que é justamente o caso comum aqui. Em vez disso insere um novo registro com
 * aditivo_de apontando pro original — o mesmo mecanismo já documentado na tabela
 * monitoramentos, só que agora com uma tela que efetivamente o aciona. */
export function useAssinarAdendo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { monitoramentoId: string; adendoId: string; corrections: Record<string, { old: unknown; new: unknown; rotulo?: string }> }) => {
      type Versao = { id: string; ficha_template_id: string; versao_template: number; user_id: string; setor: string; dados_dinamicos: Record<string, unknown>; aditivo_de: string | null; hora_monitoramento: string | null; criado_em: string };
      const colunas = "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento, criado_em";
      const { data: alvo, error: erroAlvo } = await supabase.from("monitoramentos").select(colunas).eq("id", input.monitoramentoId).single().overrideTypes<Versao, { merge: false }>();
      if (erroAlvo) throw erroAlvo;

      // O aditivo parte da versão MAIS RECENTE da cadeia (e aponta para o original), não do original: com 2 adendos no mesmo
      // registro, partir do original gerava dois aditivos irmãos, cada um com só um adendo assinado e só uma correção aplicada.
      const raizId = alvo.aditivo_de ?? alvo.id;
      const { data: ultimos, error: erroUltimo } = await supabase
        .from("monitoramentos")
        .select(colunas)
        .eq("aditivo_de", raizId)
        .order("criado_em", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .overrideTypes<Versao[], { merge: false }>();
      if (erroUltimo) throw erroUltimo;
      let original = ultimos?.[0] ?? alvo;
      if (!ultimos?.[0] && alvo.aditivo_de) {
        const { data: raiz, error: erroRaiz } = await supabase.from("monitoramentos").select(colunas).eq("id", raizId).single().overrideTypes<Versao, { merge: false }>();
        if (erroRaiz) throw erroRaiz;
        original = raiz;
      }

      const dadosOriginais = original.dados_dinamicos as { adendos?: AdendoBruto[] } & Record<string, unknown>;
      // Já assinado na versão vigente (toque repetido, outro aparelho): não gera outro aditivo.
      if ((dadosOriginais.adendos ?? []).some((a) => a.id === input.adendoId && a.status === "completed")) return { propagados: 0, naoPropagados: 0 };
      const agora = new Date().toISOString();
      const novosAdendos = (dadosOriginais.adendos ?? []).map((a) =>
        a.id === input.adendoId ? { ...a, status: "completed", monitorSignature: "signed_by_session", monitorSignedAt: agora } : a
      );

      const novosDados: Record<string, unknown> = { ...dadosOriginais, adendos: novosAdendos };
      let dadosCorrigidos: Record<string, unknown> = novosDados;
      for (const [caminho, correcao] of Object.entries(input.corrections)) {
        dadosCorrigidos = aplicarNoCaminho(dadosCorrigidos, caminho, correcao.new);
      }
      // DOA: o adendo troca o valor digitado; a % de DOA, o saldo e a SOMA do dia são refeitos a partir dele.
      dadosCorrigidos = recalcularDoaNoRegistro(dadosCorrigidos);
      const motivosDoa = motivosBloqueioAdendoDoa(dadosCorrigidos, input.corrections);
      if (motivosDoa.length > 0) throw new Error(motivosDoa.join(" "));

      const { error: erroInsert } = await supabase.from("monitoramentos").insert({
        ficha_template_id: original.ficha_template_id,
        versao_template: original.versao_template,
        user_id: original.user_id,
        setor: original.setor,
        dados_dinamicos: dadosCorrigidos,
        aditivo_de: raizId,
      });
      if (erroInsert) throw erroInsert;

      // A correção segue para os monitoramentos seguintes que já foram feitos com a leitura antiga. Falha aqui não desfaz a
      // assinatura do adendo (já gravada): vira aviso para o inspetor.
      try {
        const leituras = await propagarCorrecaoNosSeguintes({ origem: original, adendoId: input.adendoId, dadosCorrigidos, corrections: input.corrections, agora });
        const cargas = await propagarCorrecaoDoaNosSeguintes({ origem: original, adendoId: input.adendoId, dadosCorrigidos, corrections: input.corrections });
        return { propagados: leituras.propagados + cargas.propagados, naoPropagados: 0 };
      } catch (erro) {
        return { propagados: 0, naoPropagados: 0, erro: erro instanceof Error ? erro.message : "Falha ao propagar a correção." };
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

type VersaoCadeia = {
  id: string;
  ficha_template_id: string;
  versao_template: number;
  user_id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  aditivo_de: string | null;
  hora_monitoramento: string | null;
  criado_em: string;
  verificado_por: string | null;
  status_ficha: string | null;
};

const COLUNAS_CADEIA = "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento, criado_em, verificado_por, status_ficha";

/** Todas as versões de um monitoramento (o original e seus aditivos), da mais antiga para a mais recente. */
async function buscarCadeiaDoMonitoramento(monitoramentoId: string): Promise<VersaoCadeia[]> {
  const { data: alvo, error: erroAlvo } = await supabase.from("monitoramentos").select("id, aditivo_de").eq("id", monitoramentoId).maybeSingle().overrideTypes<{ id: string; aditivo_de: string | null } | null, { merge: false }>();
  if (erroAlvo) throw erroAlvo;
  if (!alvo) return [];
  const raizId = alvo.aditivo_de ?? alvo.id;
  const { data, error } = await supabase
    .from("monitoramentos")
    .select(COLUNAS_CADEIA)
    .or(`id.eq.${raizId},aditivo_de.eq.${raizId}`)
    .order("criado_em", { ascending: true })
    .order("id", { ascending: true })
    .overrideTypes<VersaoCadeia[], { merge: false }>();
  if (error) throw error;
  return data ?? [];
}

/** O monitoramento pode ser corrigido por quem está logado? (dono, nada verificado, finalizado — ver podeCorrigirMonitoramento.) */
export function usePodeCorrigirMonitoramento(monitoramentoId: string | null, quem: { id: string; nivelAcesso: string } | null) {
  return useQuery({
    queryKey: ["painel-bordo", "pode-corrigir", monitoramentoId, quem?.id],
    enabled: !!monitoramentoId && !!quem,
    queryFn: async (): Promise<ResultadoPodeCorrigir> => podeCorrigirMonitoramento(await buscarCadeiaDoMonitoramento(monitoramentoId as string), quem as { id: string; nivelAcesso: string }),
  });
}

/** Correção feita pelo PRÓPRIO inspetor, antes de o Verificador verificar: ele refaz os valores errados na ficha (os cálculos são
 * refeitos pelos mesmos campos do preenchimento) e o sistema grava uma nova versão — aditivo, igual ao adendo assinado — com a
 * justificativa e o que mudou (antigo → novo). O original fica guardado no histórico e a versão corrigida volta para a verificação. */
export function useCorrigirMonitoramento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      monitoramentoId: string;
      campos: CampoTemplate[];
      /** Valores dos campos da ficha depois da correção (já recalculados pelos campos). */
      dadosNovos: Record<string, unknown>;
      /** Valores logo antes de o inspetor mexer: o que difere do gravado é preenchimento automático dos campos (dado herdado), não correção dele. */
      dadosAntesDaEdicao: Record<string, unknown>;
      justificativa: string;
      quem: { id: string; nivelAcesso: string; nome: string };
    }) => {
      const cadeia = await buscarCadeiaDoMonitoramento(input.monitoramentoId);
      const permissao = podeCorrigirMonitoramento(cadeia, input.quem);
      if (!permissao.pode) throw new Error(permissao.motivo);
      const justificativa = input.justificativa.trim();
      if (justificativa.length < MOTIVO_CORRECAO_MIN_CARACTERES) throw new Error(`Informe o motivo da correção (mínimo ${MOTIVO_CORRECAO_MIN_CARACTERES} caracteres).`);

      const raiz = cadeia[0]!;
      const vigente = cadeia[cadeia.length - 1]!;
      // `correcoes` = tudo o que mudou em relação ao gravado (trilha completa no adendo); `correcoesDoInspetor` = só o que ele mexeu —
      // é isso que segue para os monitoramentos seguintes.
      const correcoes = diffCorrecoes(input.campos, vigente.dados_dinamicos, input.dadosNovos);
      const correcoesDoInspetor = diffCorrecoes(input.campos, input.dadosAntesDaEdicao, input.dadosNovos);
      if (Object.keys(correcoesDoInspetor).length === 0) throw new Error("Nenhum valor foi alterado.");

      const agora = new Date().toISOString();
      const dadosOriginais = vigente.dados_dinamicos as { adendos?: AdendoBruto[] } & Record<string, unknown>;
      const adendo = {
        id: crypto.randomUUID(),
        status: "completed",
        origem: "inspetor",
        monitorId: input.quem.id,
        verificadorName: `${input.quem.nome} (${input.quem.nivelAcesso === "ADMIN_MASTER" ? "correção do administrador" : "correção do próprio inspetor"})`,
        notes: justificativa,
        corrections: correcoes,
        criadoEm: agora,
        monitorSignature: "signed_by_password",
        monitorSignedAt: agora,
      };
      // Só os campos da ficha vêm do formulário; hora, continuação e demais marcas do registro ficam como estavam.
      const mesclado: Record<string, unknown> = { ...dadosOriginais };
      for (const campo of input.campos) if (campo.chave in input.dadosNovos) mesclado[campo.chave] = input.dadosNovos[campo.chave];
      mesclado.adendos = [...(dadosOriginais.adendos ?? []), adendo];
      // DOA: a % por carga, o saldo e a SOMA do dia são refeitos a partir do valor corrigido (rede de segurança sobre o campo).
      const dadosCorrigidos = recalcularDoaNoRegistro(mesclado);

      const { error: erroInsert } = await supabase.from("monitoramentos").insert({
        ficha_template_id: vigente.ficha_template_id,
        versao_template: vigente.versao_template,
        user_id: vigente.user_id,
        setor: vigente.setor,
        dados_dinamicos: dadosCorrigidos,
        aditivo_de: raiz.id,
      });
      if (erroInsert) throw erroInsert;

      // A correção segue para os monitoramentos seguintes que herdaram a leitura antiga (hidrômetro) ou a carga (DOA); falha aqui
      // não desfaz a correção já gravada: vira aviso.
      try {
        const leituras = await propagarCorrecaoNosSeguintes({ origem: vigente, adendoId: adendo.id, dadosCorrigidos, corrections: correcoesDoInspetor, agora });
        const cargas = await propagarCorrecaoDoaNosSeguintes({ origem: vigente, adendoId: adendo.id, dadosCorrigidos, corrections: correcoesDoInspetor });
        return { propagados: leituras.propagados + cargas.propagados, erro: undefined as string | undefined, alteradas: Object.keys(correcoes).length };
      } catch (erro) {
        return { propagados: 0, erro: erro instanceof Error ? erro.message : "Falha ao propagar a correção.", alteradas: Object.keys(correcoes).length };
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["painel-bordo"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

/** Correção de dado de CARGA no DOA segue para as apurações seguintes do mesmo dia de abate (cada apuração guarda a própria cópia da
 * carga e a soma do dia): cada uma ganha um aditivo com a carga corrigida e a soma refeita (função do banco
 * propagar_correcao_carga_doa, que revalida tudo) e volta para a verificação. */
async function propagarCorrecaoDoaNosSeguintes(args: {
  origem: { id: string; aditivo_de: string | null; ficha_template_id: string; setor: string; hora_monitoramento: string | null; criado_em: string };
  adendoId: string;
  dadosCorrigidos: Record<string, unknown>;
  corrections: Record<string, { old: unknown; new: unknown }>;
}): Promise<{ propagados: number }> {
  const { origem, adendoId, dadosCorrigidos, corrections } = args;
  const ajustes = ajustesDeCargaDoa(dadosCorrigidos, corrections);
  if (ajustes.length === 0) return { propagados: 0 };

  const raizOrigem = origem.aditivo_de ?? origem.id;
  const horaOrigem = new Date(horaEfetiva(origem)).toISOString();
  // Um dia de abate pode atravessar a meia-noite: olha as 48 h seguintes e confere o dia de abate dentro do registro.
  const limite = new Date(new Date(horaOrigem).getTime() + 48 * 3_600_000).toISOString();

  const { data: cods, error: erroCod } = await supabase.rpc("codigos_de_templates", { p_ids: [origem.ficha_template_id] });
  if (erroCod) throw erroCod;
  const codigo = (cods as unknown as { id: string; codigo: string }[] | null)?.[0]?.codigo;
  if (!codigo) return { propagados: 0 };
  const { data: versoes, error: erroVersoes } = await supabase.rpc("ids_versoes_ficha", { p_codigo: codigo });
  if (erroVersoes) throw erroVersoes;

  type Linha = { id: string; aditivo_de: string | null; dados_dinamicos: Record<string, unknown>; hora_monitoramento: string | null; criado_em: string };
  const { data: linhas, error } = await supabase
    .from("monitoramentos_vigentes")
    .select("id, aditivo_de, dados_dinamicos, hora_monitoramento, criado_em")
    .in("ficha_template_id", (versoes as unknown as string[] | null) ?? [])
    .eq("setor", origem.setor)
    .or(`and(hora_monitoramento.gt.${horaOrigem},hora_monitoramento.lt.${limite}),and(hora_monitoramento.is.null,criado_em.gt.${horaOrigem},criado_em.lt.${limite})`)
    .limit(500)
    .overrideTypes<Linha[], { merge: false }>();
  if (error) throw error;

  // Uma versão por monitoramento (liberado ao SIF aparece o original e a correção): vale a gravada por último.
  const porRaiz = new Map<string, Linha>();
  for (const l of linhas ?? []) {
    const raiz = l.aditivo_de ?? l.id;
    if (raiz === raizOrigem) continue;
    const atual = porRaiz.get(raiz);
    if (!atual || l.criado_em > atual.criado_em) porRaiz.set(raiz, l);
  }

  let propagados = 0;
  for (const alvo of [...porRaiz.values()].sort((a, b) => (horaEfetiva(a) < horaEfetiva(b) ? -1 : 1))) {
    const aplicaveis = ajustesQueSeAplicam(ajustes, alvo.dados_dinamicos);
    if (aplicaveis.length === 0) continue;
    const { error: erroRpc } = await supabase.rpc("propagar_correcao_carga_doa", {
      p_origem: raizOrigem,
      p_adendo: adendoId,
      p_alvo: alvo.id,
      p_ajustes: aplicaveis.map((a) => ({ campo: a.campo, cargaId: a.cargaId, prop: a.prop })),
    });
    if (erroRpc) throw erroRpc;
    propagados += 1;
  }
  return { propagados };
}

/** Leituras de hidrômetro corrigidas por adendo seguem para os monitoramentos seguintes (mesma ficha, setor, dia e turno) que
 * herdaram a leitura antiga: cada um ganha um aditivo com a leitura anterior acertada e volta para a verificação. Vale também
 * para os de outros inspetores (função do banco propagar_leitura_adendo). */
async function propagarCorrecaoNosSeguintes(args: {
  origem: { id: string; aditivo_de: string | null; ficha_template_id: string; setor: string; user_id: string; hora_monitoramento: string | null; criado_em: string };
  adendoId: string;
  dadosCorrigidos: Record<string, unknown>;
  corrections: Record<string, { old: unknown; new: unknown }>;
  agora: string;
}): Promise<{ propagados: number; naoPropagados: number }> {
  const { origem, adendoId, dadosCorrigidos, corrections, agora } = args;
  if (!Object.keys(corrections).some((c) => c.endsWith(".cur"))) return { propagados: 0, naoPropagados: 0 };

  const raizOrigem = origem.aditivo_de ?? origem.id;
  const horaOrigem = horaEfetiva(origem);
  const turnoOrigem = turnoParaHeranca(new Date(horaOrigem));
  const dia = diaManaus(new Date(horaOrigem));
  const iniDia = new Date(`${dia}T00:00:00-04:00`);
  const fimDia = new Date(iniDia.getTime() + 24 * 3_600_000);

  const { data: cods, error: erroCod } = await supabase.rpc("codigos_de_templates", { p_ids: [origem.ficha_template_id] });
  if (erroCod) throw erroCod;
  const codigo = (cods as unknown as { id: string; codigo: string }[] | null)?.[0]?.codigo;
  if (!codigo) return { propagados: 0, naoPropagados: 0 };
  const { data: versoes, error: erroVersoes } = await supabase.rpc("ids_versoes_ficha", { p_codigo: codigo });
  if (erroVersoes) throw erroVersoes;

  type Linha = { id: string; ficha_template_id: string; versao_template: number; user_id: string; setor: string; dados_dinamicos: Record<string, unknown>; aditivo_de: string | null; hora_monitoramento: string | null; criado_em: string };
  const { data: linhas, error } = await supabase
    .from("monitoramentos_vigentes")
    .select("id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, aditivo_de, hora_monitoramento, criado_em")
    .in("ficha_template_id", (versoes as unknown as string[] | null) ?? [])
    .eq("setor", origem.setor)
    .or(
      `and(hora_monitoramento.gt.${new Date(horaOrigem).toISOString()},hora_monitoramento.lt.${fimDia.toISOString()}),` +
        `and(hora_monitoramento.is.null,criado_em.gt.${new Date(horaOrigem).toISOString()},criado_em.lt.${fimDia.toISOString()})`
    )
    .limit(500)
    .overrideTypes<Linha[], { merge: false }>();
  if (error) throw error;

  // Uma versão por monitoramento (liberado ao SIF aparece o original e a correção): vale a gravada por último.
  const porRaiz = new Map<string, Linha>();
  for (const l of linhas ?? []) {
    const raiz = l.aditivo_de ?? l.id;
    if (raiz === raizOrigem) continue;
    const atual = porRaiz.get(raiz);
    if (!atual || l.criado_em > atual.criado_em) porRaiz.set(raiz, l);
  }
  const seguintes = [...porRaiz.values()]
    .filter((l) => turnoParaHeranca(new Date(horaEfetiva(l))) === turnoOrigem)
    .sort((a, b) => (horaEfetiva(a) < horaEfetiva(b) ? -1 : 1));

  const atualizados = propagarLeituraNosSeguintes({
    origemId: raizOrigem,
    adendoId,
    dadosCorrigidos,
    correcoes: corrections,
    seguintes: seguintes.map((l) => ({ id: l.id, dados: l.dados_dinamicos })),
    agora,
  });

  let propagados = 0;
  for (const a of atualizados) {
    // Função do banco: grava o aditivo no nome do dono do seguinte (a RLS não deixa o inspetor gravar o de outro) e revalida tudo
    // no servidor — só a leitura anterior herdada é alterada.
    const { error: erroRpc } = await supabase.rpc("propagar_leitura_adendo", {
      p_origem: raizOrigem,
      p_adendo: adendoId,
      p_alvo: a.id,
      p_ajustes: a.correcoes.map((c) => ({ caminho: c.caminho })),
    });
    if (erroRpc) throw erroRpc;
    propagados += 1;
  }
  return { propagados, naoPropagados: 0 };
}
