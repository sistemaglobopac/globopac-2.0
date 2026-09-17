import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MonitoramentoVerificado {
  id: string;
  setor: string;
  conformidade: boolean | null;
  verificado_em: string | null;
  liberado_sif: boolean;
  criado_em: string;
}

/** Verificados (aprovados ou reprovados) ainda não liberados — candidatos à liberação
 * individual ao SIF (versão mínima da Fase 2; liberação em lote é Fase 3). */
export function useMonitoramentosParaLiberar() {
  return useQuery({
    queryKey: ["monitoramentos", "para-liberar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, conformidade, verificado_em, liberado_sif, criado_em")
        .not("verificado_por", "is", null)
        .eq("liberado_sif", false)
        .order("verificado_em", { ascending: true })
        .overrideTypes<MonitoramentoVerificado[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useLiberarSif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (monitoramentoId: string) => {
      const { data, error } = await supabase.functions.invoke("liberar-sif", {
        body: { monitoramento_id: monitoramentoId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

/** Portal de auditoria — mostra só liberado_sif=true. Para INSPECAO_FEDERAL, a RLS
 * (monitoramentos_select) já restringe a isso; para ADMIN_MASTER, a RLS permite ver tudo
 * (para outras telas, como /sif/liberar), então o filtro explícito aqui é quem garante que
 * esta tela específica de auditoria mostra a mesma coisa para os dois perfis. */
export function useMonitoramentosLiberados() {
  return useQuery({
    queryKey: ["monitoramentos", "liberados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, conformidade, verificado_em, liberado_sif, criado_em")
        .eq("liberado_sif", true)
        .order("liberado_em", { ascending: false })
        .overrideTypes<MonitoramentoVerificado[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}
