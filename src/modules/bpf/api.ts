import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { hojeManaus, inicioDoDiaManausIso } from "./regras";
import type {
  CentroCustoRef,
  ItemImportacao,
  Ordem,
  Programacao,
  Relatorio,
  ResultadoBpf,
  Solicitacao,
  StatusSolicitacao,
  Verificacao,
} from "./tipos";
import { SETOR_BPF } from "./tipos";

const COLUNAS_PROGRAMACAO =
  "sequencia, prazo, acao_corretiva, responsavel, justificativa, importada, programado_por_nome, hash_assinatura, criado_em";
const COLUNAS_VERIFICACAO =
  "id, ordem_id, data_verificacao, hora_verificacao, resultado, prazo_vigente, observacao, inspetor_nome";

type OrdemBruta = Omit<Ordem, "centro" | "programacoes" | "verificacoes"> & {
  centros_custo: CentroCustoRef | null;
  bpf_programacoes: Programacao[] | null;
  bpf_verificacoes: Verificacao[] | null;
};

function normalizarOrdem(o: OrdemBruta): Ordem {
  const { centros_custo, bpf_programacoes, bpf_verificacoes, ...resto } = o;
  return {
    ...resto,
    centro: centros_custo,
    programacoes: [...(bpf_programacoes ?? [])].sort((a, b) => a.sequencia - b.sequencia),
    verificacoes: bpf_verificacoes ?? [],
  };
}

type SolicitacaoBruta = Omit<Solicitacao, "centro"> & { centros_custo: CentroCustoRef | null };

function normalizarSolicitacao(s: SolicitacaoBruta): Solicitacao {
  const { centros_custo, ...resto } = s;
  return { ...resto, centro: centros_custo };
}

/** As escritas do módulo são funções do banco (regras e assinatura no servidor). O erro do
 * PostgREST não é uma instância de Error — converte para que os diálogos mostrem a mensagem. */
async function chamar<T>(funcao: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(funcao, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function useInvalidarBpf() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ["bpf"] });
}

// ------------------------------------------------------------------------------------------
// Leitura
// ------------------------------------------------------------------------------------------

export function useSolicitacoes(opcoes?: { status?: StatusSolicitacao[]; limite?: number; habilitado?: boolean }) {
  const status = opcoes?.status;
  return useQuery({
    queryKey: ["bpf", "solicitacoes", status ?? "todas", opcoes?.limite ?? null],
    enabled: opcoes?.habilitado ?? true,
    queryFn: async () => {
      let consulta = supabase
        .from("bpf_solicitacoes")
        .select("*, centros_custo(id, codigo, nome)")
        .order("criado_em", { ascending: false });
      if (status) consulta = consulta.in("status", status);
      if (opcoes?.limite) consulta = consulta.limit(opcoes.limite);
      const { data, error } = await consulta.overrideTypes<SolicitacaoBruta[], { merge: false }>();
      if (error) throw error;
      return data.map(normalizarSolicitacao);
    },
    refetchInterval: 30_000,
  });
}

/** OS que o inspetor monitora hoje: as programadas e as que foram dadas como conformes hoje
 * (para ainda poder desfazer um clique errado). `verificacoes` traz só as de hoje. */
export function useOrdensParaVerificar() {
  const hoje = hojeManaus();
  return useQuery({
    queryKey: ["bpf", "ordens", "verificar", hoje],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bpf_ordens")
        .select(
          `*, centros_custo(id, codigo, nome), bpf_programacoes(${COLUNAS_PROGRAMACAO}), bpf_verificacoes(${COLUNAS_VERIFICACAO})`
        )
        .or(`status.eq.PROGRAMADA,concluida_em.gte.${inicioDoDiaManausIso(hoje)}`)
        .eq("bpf_verificacoes.data_verificacao", hoje)
        .order("prazo_atual", { ascending: true })
        .overrideTypes<OrdemBruta[], { merge: false }>();
      if (error) throw error;
      return data.map(normalizarOrdem);
    },
    refetchInterval: 30_000,
  });
}

/** Todas as OS programadas (visão do PCM), com o histórico de prazos. `verificacoes` traz só a
 * mais recente de cada OS — é ela que diz se a OS foi devolvida ao PCM como não conforme. */
export function useOrdensProgramadas() {
  return useQuery({
    queryKey: ["bpf", "ordens", "programadas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bpf_ordens")
        .select(
          `*, centros_custo(id, codigo, nome), bpf_programacoes(${COLUNAS_PROGRAMACAO}), bpf_verificacoes(${COLUNAS_VERIFICACAO})`
        )
        .eq("status", "PROGRAMADA")
        .order("prazo_atual", { ascending: true })
        .order("data_verificacao", { ascending: false, referencedTable: "bpf_verificacoes" })
        .limit(1, { referencedTable: "bpf_verificacoes" })
        .overrideTypes<OrdemBruta[], { merge: false }>();
      if (error) throw error;
      return data.map(normalizarOrdem);
    },
    refetchInterval: 30_000,
  });
}

export function useRelatorios({ habilitado = true }: { habilitado?: boolean } = {}) {
  return useQuery({
    queryKey: ["bpf", "relatorios"],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bpf_relatorios")
        .select("*")
        .order("data_referencia", { ascending: false })
        .limit(90)
        .overrideTypes<Relatorio[], { merge: false }>();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

// ------------------------------------------------------------------------------------------
// Escrita (funções do banco)
// ------------------------------------------------------------------------------------------

export function useAbrirSolicitacao() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (input: {
      centroCustoId: string;
      categoria: string;
      descricao: string;
      localDetalhe?: string;
      constatadoEm?: string;
      setor?: string;
    }) =>
      chamar<Solicitacao>("bpf_abrir_solicitacao", {
        p_centro_custo_id: input.centroCustoId,
        p_categoria: input.categoria,
        p_descricao: input.descricao,
        p_local_detalhe: input.localDetalhe || null,
        p_constatado_em: input.constatadoEm || null,
        p_setor: input.setor ?? SETOR_BPF,
      }),
    onSuccess: invalidar,
  });
}

export function useAprovarSolicitacao() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (id: string) => chamar<Solicitacao>("bpf_aprovar_solicitacao", { p_id: id }),
    onSuccess: invalidar,
  });
}

export function useReprovarSolicitacao() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (input: { id: string; motivo: string }) =>
      chamar<Solicitacao>("bpf_reprovar_solicitacao", { p_id: input.id, p_motivo: input.motivo }),
    onSuccess: invalidar,
  });
}

export function useProgramarSolicitacao() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (input: { solicitacaoId: string; numeroOs: string; acaoCorretiva: string; responsavel: string; prazo: string }) =>
      chamar<Ordem>("bpf_programar_solicitacao", {
        p_solicitacao_id: input.solicitacaoId,
        p_numero_os: input.numeroOs,
        p_acao_corretiva: input.acaoCorretiva,
        p_responsavel: input.responsavel,
        p_prazo: input.prazo,
      }),
    onSuccess: invalidar,
  });
}

export function useReprogramarOrdem() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (input: { ordemId: string; novoPrazo: string; justificativa: string; acaoCorretiva?: string; responsavel?: string }) =>
      chamar<Ordem>("bpf_reprogramar_ordem", {
        p_ordem_id: input.ordemId,
        p_novo_prazo: input.novoPrazo,
        p_justificativa: input.justificativa,
        p_acao_corretiva: input.acaoCorretiva || null,
        p_responsavel: input.responsavel || null,
      }),
    onSuccess: invalidar,
  });
}

export function useRegistrarVerificacao() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (input: { ordemId: string; resultado: ResultadoBpf; observacao?: string }) =>
      chamar<Verificacao>("bpf_registrar_verificacao", {
        p_ordem_id: input.ordemId,
        p_resultado: input.resultado,
        p_observacao: input.observacao || null,
      }),
    onSuccess: invalidar,
  });
}

export function useEmitirRelatorio() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (setor?: string) => chamar<Relatorio>("bpf_emitir_relatorio", { p_setor: setor ?? SETOR_BPF }),
    onSuccess: invalidar,
  });
}

export function useVerificarRelatorio() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (id: string) => chamar<Relatorio>("bpf_verificar_relatorio", { p_id: id }),
    onSuccess: invalidar,
  });
}

export function useLiberarRelatorio() {
  const invalidar = useInvalidarBpf();
  return useMutation({
    mutationFn: (id: string) => chamar<Relatorio>("bpf_liberar_relatorio", { p_id: id }),
    onSuccess: invalidar,
  });
}

export interface ResultadoImportacao {
  importadas: number;
  ignoradas: string[];
  centros_criados: string[];
}

export function useImportarOrdens() {
  const invalidar = useInvalidarBpf();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itens: ItemImportacao[]) => chamar<ResultadoImportacao>("bpf_importar_ordens", { p_itens: itens, p_setor: SETOR_BPF }),
    onSuccess: () => {
      invalidar();
      void queryClient.invalidateQueries({ queryKey: ["centros_custo"] });
    },
  });
}
