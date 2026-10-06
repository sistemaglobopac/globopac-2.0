import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import { aplicarNoCaminho } from "@/modules/fichas/utils/adendoCampos";
import { idsAdendosConcluidos } from "@/modules/fichas/utils/adendosPendentes";
import { supabase } from "@/lib/supabase";
import type { StatusRnc } from "@/modules/rnc/api";

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
}

export interface MonitoramentoHoje {
  id: string;
  ficha_template_id: string;
  criado_em: string;
  setor?: string;
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

/** Link que abre a ficha direto no setor certo (NovaFichaPage lê ?ficha=&setor=). */
export function urlNovaFicha(ficha: Pick<FichaAtivaResumo, "id" | "locais_aplicacao">, userSetores: string[]): string {
  const setor = ficha.locais_aplicacao?.find((s) => userSetores.includes(s)) ?? userSetores[0] ?? "";
  return `/fichas/nova?ficha=${ficha.id}&setor=${encodeURIComponent(setor)}`;
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
  /** Códigos das fichas encerradas hoje ("Encerrar abate"): nunca geram aviso de atraso. */
  codigosEncerrados: ReadonlySet<string> = new Set()
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
    const ultimo = ultimoPorFicha.get(ficha.id);
    // Sem monitoramento realizado ainda: não há hora devida, logo não há aviso de atraso.
    if (!ultimo) continue;
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
  /** Códigos das fichas encerradas hoje com "Encerrar abate". */
  fichasEncerradasHoje: string[];
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
      const [
        { data: monitoramentosHoje, error: erroHoje },
        { data: monitoramentosDoSetor, error: erroSetor },
        { data: recentes, error: erroRecentes },
        { data: fichasAtivasBrutas, error: erroFichas },
        { data: encerradas },
      ] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em, setor")
          .eq("user_id", userId as string)
          .in("setor", userSetores)
          .gte("criado_em", inicioDoDiaManaus(new Date()).toISOString())
          .overrideTypes<MonitoramentoHoje[], { merge: false }>(),
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em, setor")
          .in("setor", userSetores)
          .gte("criado_em", inicioDoDiaManaus(new Date()).toISOString())
          .overrideTypes<MonitoramentoHoje[], { merge: false }>(),
        supabase
          .from("monitoramentos")
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
          .select("id, codigo, nome, tipo_apontamento, tempo_entre_apontamentos_min, locais_aplicacao, schema_campos")
          .eq("ativo", true)
          .overrideTypes<(FichaAtivaResumo & { schema_campos: { tipo?: string }[] | null })[], { merge: false }>(),
        // Erro aqui (ex.: migração ainda não aplicada) só significa "nenhuma ficha encerrada".
        supabase
          .from("fichas_encerradas_dia")
          .select("codigo")
          .eq("dia", diaManaus(new Date()))
          .overrideTypes<{ codigo: string }[], { merge: false }>(),
      ]);
      const fichasAtivas: FichaAtivaResumo[] = (fichasAtivasBrutas ?? []).map(({ schema_campos, ...ficha }) => ({
        ...ficha,
        encerravel: Array.isArray(schema_campos) && schema_campos.some((c) => c?.tipo === "espera_aves"),
      }));

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

      const adendosPendentes: AdendoPendente[] = [];
      const adendosConcluidos = idsAdendosConcluidos(recentes ?? []);
      for (const m of recentes ?? []) {
        const adendos = (m.dados_dinamicos as { adendos?: AdendoBruto[] } | null)?.adendos;
        if (!Array.isArray(adendos)) continue;
        for (const adendo of adendos) {
          if (adendo.status === "pending_monitor" && adendo.monitorId === userId && !adendosConcluidos.has(adendo.id)) {
            adendosPendentes.push({
              id: adendo.id,
              monitoramentoId: m.id,
              verificadorName: adendo.verificadorName ?? "Verificador",
              notes: adendo.notes ?? "",
              corrections: adendo.corrections ?? {},
            });
          }
        }
      }

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
      const normalizar = (lista: MonitoramentoHoje[] | null) =>
        (lista ?? []).map((m) => (versaoAtivaPorTemplate.has(m.ficha_template_id) ? { ...m, ficha_template_id: versaoAtivaPorTemplate.get(m.ficha_template_id)! } : m));

      return { monitoramentosHoje: normalizar(monitoramentosHoje), monitoramentosDoSetorHoje: normalizar(monitoramentosDoSetor), fichasAtivas, fichasEncerradasHoje: (encerradas ?? []).map((e) => e.codigo), desviosAtivos, adendosPendentes, nomesFicha };
    },
  });
}

/** "Encerrar abate": silencia, até o fim do dia, o aviso de atraso de uma ficha que depende de
 * haver abate (ex.: bem-estar nos boxes de espera). Reabrir desfaz. Vale por código da ficha. */
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

/** Assinatura de adendo (Painel de Bordo, seção 16) — NUNCA faz UPDATE em dados_dinamicos: o
 * trigger trg_bloqueia_edicao_liberado bloqueia qualquer UPDATE em monitoramento já liberado
 * ao SIF, que é justamente o caso comum aqui. Em vez disso insere um novo registro com
 * aditivo_de apontando pro original — o mesmo mecanismo já documentado na tabela
 * monitoramentos, só que agora com uma tela que efetivamente o aciona. */
export function useAssinarAdendo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { monitoramentoId: string; adendoId: string; corrections: Record<string, { old: unknown; new: unknown; rotulo?: string }> }) => {
      const { data: original, error: erroOriginal } = await supabase
        .from("monitoramentos")
        .select("ficha_template_id, versao_template, user_id, setor, dados_dinamicos")
        .eq("id", input.monitoramentoId)
        .single()
        .overrideTypes<
          { ficha_template_id: string; versao_template: number; user_id: string; setor: string; dados_dinamicos: Record<string, unknown> },
          { merge: false }
        >();
      if (erroOriginal) throw erroOriginal;

      const dadosOriginais = original.dados_dinamicos as { adendos?: AdendoBruto[] } & Record<string, unknown>;
      const agora = new Date().toISOString();
      const novosAdendos = (dadosOriginais.adendos ?? []).map((a) =>
        a.id === input.adendoId ? { ...a, status: "completed", monitorSignature: "signed_by_session", monitorSignedAt: agora } : a
      );

      const novosDados: Record<string, unknown> = { ...dadosOriginais, adendos: novosAdendos };
      let dadosCorrigidos: Record<string, unknown> = novosDados;
      for (const [caminho, correcao] of Object.entries(input.corrections)) {
        dadosCorrigidos = aplicarNoCaminho(dadosCorrigidos, caminho, correcao.new);
      }

      const { error: erroInsert } = await supabase.from("monitoramentos").insert({
        ficha_template_id: original.ficha_template_id,
        versao_template: original.versao_template,
        user_id: original.user_id,
        setor: original.setor,
        dados_dinamicos: dadosCorrigidos,
        aditivo_de: input.monitoramentoId,
      });
      if (erroInsert) throw erroInsert;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] }),
  });
}
