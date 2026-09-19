import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  return hora >= 3 && hora <= 16 ? "1º Turno" : "2º Turno";
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

export interface TurnoHoje {
  id: string;
  inicio: string;
  fim: string | null;
}

/** turnos_inspetores não tem coluna de data — "hoje" é o último turno cujo início caiu dentro
 * do dia corrente (America/Manaus). Sem correspondente na v1 pedida (que lia isso de
 * localStorage, escrito por um fluxo que nunca existiu neste repo) — o Painel de Bordo é quem
 * agora cria/fecha a linha, então o banco é a fonte de verdade, não o navegador. */
export function useTurnoHoje(userId: string | undefined) {
  return useQuery({
    queryKey: ["turnos_inspetores", "hoje", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("turnos_inspetores")
        .select("id, inicio, fim")
        .eq("user_id", userId as string)
        .gte("inicio", inicioDoDiaManaus(new Date()).toISOString())
        .order("inicio", { ascending: false })
        .limit(1)
        .maybeSingle()
        .overrideTypes<TurnoHoje | null, { merge: false }>();
      if (error) throw error;
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
}

export interface MonitoramentoHoje {
  id: string;
  ficha_template_id: string;
  criado_em: string;
}

export const PAUSAS_CONFIG: Record<TipoPausa, { label: string; desc: string; limiteMin: number }> = {
  CURTA_20M: { label: "Pausa (20 min)", desc: "Café / Descanso curto", limiteMin: 20 },
  ALMOCO_72M: { label: "Almoço (1h12)", desc: "Pausa principal 1", limiteMin: 72 },
  JANTAR_72M: { label: "Jantar (1h12)", desc: "Pausa principal 2", limiteMin: 72 },
};

export interface FichaAtrasada {
  ficha: FichaAtivaResumo;
  motivo: string;
}

export function fichasAplicaveisAoInspetor(fichasAtivas: FichaAtivaResumo[], userSetores: string[]): FichaAtivaResumo[] {
  return fichasAtivas.filter((f) => f.locais_aplicacao?.some((s) => userSetores.includes(s)));
}

/** Ficha "atrasada": recorrente, aplicável ao inspetor, e sem apontamento neste turno depois de
 * 2h de turno iniciado, OU cujo último apontamento do dia já passou de
 * tempo_entre_apontamentos_min + 5 minutos (Painel de Bordo, seção 8). Compartilhada entre o
 * próprio Painel de Bordo (KPI) e o GlobalInspectorAlerts (alerta cross-página) — uma única
 * implementação, nunca duas fórmulas de atraso divergentes. */
export function calcularFichasAtrasadas(
  fichasAplicaveis: FichaAtivaResumo[],
  monitoramentosHoje: { ficha_template_id: string; criado_em: string }[],
  turnoInicio: Date,
  agora: Date
): FichaAtrasada[] {
  const ultimoPorFicha = new Map<string, Date>();
  for (const m of monitoramentosHoje) {
    const criado = new Date(m.criado_em);
    const atual = ultimoPorFicha.get(m.ficha_template_id);
    if (!atual || criado > atual) ultimoPorFicha.set(m.ficha_template_id, criado);
  }

  const duasHorasMs = 2 * 60 * 60 * 1000;
  const atrasadas: FichaAtrasada[] = [];

  for (const ficha of fichasAplicaveis) {
    if (ficha.tipo_apontamento !== "Recorrente") continue;
    const ultimo = ultimoPorFicha.get(ficha.id);
    if (!ultimo) {
      if (agora.getTime() - turnoInicio.getTime() > duasHorasMs) {
        atrasadas.push({ ficha, motivo: "Sem nenhum apontamento neste turno" });
      }
      continue;
    }
    if (ficha.tempo_entre_apontamentos_min != null) {
      const limiteMs = (ficha.tempo_entre_apontamentos_min + 5) * 60 * 1000;
      if (agora.getTime() - ultimo.getTime() > limiteMs) {
        atrasadas.push({ ficha, motivo: "Último apontamento atrasado" });
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
  corrections?: Record<string, { old: unknown; new: unknown }>;
}

export interface AdendoPendente {
  id: string;
  monitoramentoId: string;
  verificadorName: string;
  notes: string;
  corrections: Record<string, { old: unknown; new: unknown }>;
}

export interface KpisTurno {
  monitoramentosHoje: MonitoramentoHoje[];
  fichasAtivas: FichaAtivaResumo[];
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
    enabled: !!userId && userSetores.length > 0,
    refetchInterval: 15_000,
    queryFn: async (): Promise<KpisTurno> => {
      const [
        { data: monitoramentosHoje, error: erroHoje },
        { data: recentes, error: erroRecentes },
        { data: fichasAtivas, error: erroFichas },
      ] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em")
          .eq("user_id", userId as string)
          .in("setor", userSetores)
          .gte("criado_em", inicioDoDiaManaus(new Date()).toISOString())
          .overrideTypes<MonitoramentoHoje[], { merge: false }>(),
        supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, criado_em, conformidade, dados_dinamicos")
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
            }[],
            { merge: false }
          >(),
        supabase
          .from("fichas_templates")
          .select("id, codigo, nome, tipo_apontamento, tempo_entre_apontamentos_min, locais_aplicacao")
          .eq("ativo", true)
          .overrideTypes<FichaAtivaResumo[], { merge: false }>(),
      ]);

      if (erroHoje) throw erroHoje;
      if (erroRecentes) throw erroRecentes;
      if (erroFichas) throw erroFichas;

      const desviosCandidatos = (recentes ?? []).filter((m) => m.conformidade === false);
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
        .filter((d) => d.rnc === null || d.rnc.status !== "FECHADA");

      const adendosPendentes: AdendoPendente[] = [];
      for (const m of recentes ?? []) {
        const adendos = (m.dados_dinamicos as { adendos?: AdendoBruto[] } | null)?.adendos;
        if (!Array.isArray(adendos)) continue;
        for (const adendo of adendos) {
          if (adendo.status === "pending_monitor" && adendo.monitorId === userId) {
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
      for (const f of fichasAtivas ?? []) nomesFicha.set(f.id, { codigo: f.codigo, nome: f.nome });
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

      return { monitoramentosHoje: monitoramentosHoje ?? [], fichasAtivas: fichasAtivas ?? [], desviosAtivos, adendosPendentes, nomesFicha };
    },
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
    mutationFn: async (input: { monitoramentoId: string; adendoId: string; corrections: Record<string, { old: unknown; new: unknown }> }) => {
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
      for (const [campo, correcao] of Object.entries(input.corrections)) {
        novosDados[campo] = correcao.new;
      }

      const { error: erroInsert } = await supabase.from("monitoramentos").insert({
        ficha_template_id: original.ficha_template_id,
        versao_template: original.versao_template,
        user_id: original.user_id,
        setor: original.setor,
        dados_dinamicos: novosDados,
        aditivo_de: input.monitoramentoId,
      });
      if (erroInsert) throw erroInsert;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] }),
  });
}
