import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type StatusOs = "ABERTURA" | "AUTORIZACAO" | "PROGRAMACAO" | "EXECUCAO" | "VALIDACAO" | "CONCLUIDA";
export type TipoEtapaOs = "ABERTURA" | "AUTORIZACAO" | "PROGRAMACAO" | "EXECUCAO" | "VALIDACAO";

export interface Os {
  id: string;
  descricao: string;
  setor: string;
  ativo_referencia: string | null;
  status: StatusOs;
  aberto_por: string;
  autorizado_por: string | null;
  programado_por: string | null;
  executado_por: string | null;
  validado_por: string | null;
  sla_esperado_horas: number | null;
  concluido_em: string | null;
  liberado_sif: boolean;
  liberado_em: string | null;
  criado_em: string;
}

/** Etapa que assinar-se em seguida move o status ATUAL para o próximo — espelha
 * TRANSICOES_OS de supabase/functions/_shared/assinar-os.ts (ADR 0012). Mantido como tabela
 * de dados, não if/else, pelo mesmo motivo do backend. */
export const PROXIMA_ETAPA: Partial<Record<StatusOs, { tipo: TipoEtapaOs; rotulo: string }>> = {
  ABERTURA: { tipo: "AUTORIZACAO", rotulo: "Autorizar" },
  AUTORIZACAO: { tipo: "PROGRAMACAO", rotulo: "Programar" },
  PROGRAMACAO: { tipo: "EXECUCAO", rotulo: "Registrar execução" },
  EXECUCAO: { tipo: "VALIDACAO", rotulo: "Validar e concluir" },
};

export function useOsDoSetor() {
  return useQuery({
    queryKey: ["manutencao_os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencao_os")
        .select("*")
        .order("criado_em", { ascending: false })
        .overrideTypes<Os[], { merge: false }>();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useCriarOs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      descricao: string;
      setor: string;
      ativoReferencia?: string;
      slaEsperadoHoras?: number;
      userId: string;
    }) => {
      const { data: os, error } = await supabase
        .from("manutencao_os")
        .insert({
          descricao: input.descricao,
          setor: input.setor,
          ativo_referencia: input.ativoReferencia || null,
          sla_esperado_horas: input.slaEsperadoHoras ?? null,
          aberto_por: input.userId,
        })
        .select("id")
        .single()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (error) throw error;

      // Assina a abertura imediatamente (seção 7.4/7.5) — mesmo padrão de useCriarMonitoramento:
      // a Edge Function recalcula o hash a partir do que acabou de ser persistido.
      const { error: assinarError } = await supabase.functions.invoke("avancar-etapa-os", {
        body: { os_id: os.id, tipo: "ABERTURA" },
      });
      if (assinarError) throw assinarError;

      return os;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["manutencao_os"] }),
  });
}

export function useAvancarEtapaOs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { osId: string; tipo: TipoEtapaOs }) => {
      const { data, error } = await supabase.functions.invoke("avancar-etapa-os", {
        body: { os_id: input.osId, tipo: input.tipo },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["manutencao_os"] }),
  });
}

/** Auditoria (INSPECAO_FEDERAL/ADMIN_MASTER) — RLS já restringe a liberado_sif=true para
 * INSPECAO_FEDERAL (ver migration 20260920000001_fase5_manutencao_os.sql). */
export function useOsLiberadas() {
  return useQuery({
    queryKey: ["manutencao_os", "liberadas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencao_os")
        .select("*")
        .eq("liberado_sif", true)
        .order("liberado_em", { ascending: false })
        .overrideTypes<Os[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useLiberarRelatorioOsSif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dataReferencia: string) => {
      const { data, error } = await supabase.functions.invoke("liberar-relatorio-os-sif", {
        body: { data_referencia: dataReferencia },
      });
      if (error) throw error;
      return data as { relatorio_id: string; quantidade_liberada: number; hash_agregador: string };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["manutencao_os"] }),
  });
}
