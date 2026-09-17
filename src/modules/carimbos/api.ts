import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ItemFilaCarimbo {
  id: string;
  tipo_assinatura: string;
  status: "pendente" | "processando" | "concluido" | "falhou_definitivo";
  tentativas: number;
  ultimo_erro: string | null;
  criado_em: string;
  proxima_tentativa_em: string | null;
}

export function useFilaCarimbo() {
  return useQuery({
    queryKey: ["fila_carimbo_tempo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fila_carimbo_tempo")
        .select("id, tipo_assinatura, status, tentativas, ultimo_erro, criado_em, proxima_tentativa_em")
        .order("criado_em", { ascending: false })
        .limit(200)
        .overrideTypes<ItemFilaCarimbo[], { merge: false }>();
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });
}

export function useAlertaCarimboHoras() {
  return useQuery({
    queryKey: ["app_config", "carimbo_alerta_horas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "carimbo_alerta_horas")
        .single()
        .overrideTypes<{ valor: number }, { merge: false }>();
      if (error) throw error;
      return data.valor;
    },
  });
}

export function useProcessarFilaAgora() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("processar-fila-carimbo", { body: {} });
      if (error) throw error;
      return data as { processados: number; concluidos: number; falharam: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fila_carimbo_tempo"] });
    },
  });
}
