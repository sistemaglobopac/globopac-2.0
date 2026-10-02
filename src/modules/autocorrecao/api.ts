import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Autocorreção imediata (medida de autocontrole): alternativa à RNC para um monitoramento com não
 * conformidade. A ação imediata do inspetor restabelece a conformidade do monitoramento. É um registro
 * à parte (o monitoramento assinado não muda), de uma por monitoramento e sem edição. */
export interface AutocorrecaoImediata {
  id: string;
  monitoramento_id: string;
  user_id: string;
  descricao: string;
  executada_em: string;
  criado_em: string;
}

export const AUTOCORRECAO_MIN_CARACTERES = 10;

export function descricaoAutocorrecaoValida(texto: string): boolean {
  return texto.trim().length >= AUTOCORRECAO_MIN_CARACTERES;
}

export const CAMPOS_AUTOCORRECAO = "id, monitoramento_id, user_id, descricao, executada_em, criado_em";

export function useRegistrarAutocorrecao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { monitoramentoId: string; userId: string; descricao: string }) => {
      const { error } = await supabase.from("autocorrecoes_imediatas").insert({
        monitoramento_id: input.monitoramentoId,
        user_id: input.userId,
        descricao: input.descricao.trim(),
      });
      if (error) {
        if (error.code === "23505") throw new Error("Este monitoramento já tem uma autocorreção registrada.");
        if (error.code === "42501") {
          throw new Error("Não foi possível registrar: só vale para monitoramento com não conformidade, do seu setor, ainda não verificado e sem RNC.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["painel-bordo"] });
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
      void queryClient.invalidateQueries({ queryKey: ["autocorrecoes"] });
    },
  });
}

/** Ids (entre `ids`) dos monitoramentos que já têm autocorreção — para sinalizar "Autocorrigido" nas filas. */
export function useAutocorrigidos(ids: string[]) {
  const chave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["autocorrecoes", "ids", chave],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("autocorrecoes_imediatas")
        .select("monitoramento_id")
        .in("monitoramento_id", ids)
        .overrideTypes<{ monitoramento_id: string }[], { merge: false }>();
      // Sem a tabela (migração ainda não aplicada) ou sem acesso: só não sinaliza "Autocorrigido".
      if (error) return new Set<string>();
      return new Set((data ?? []).map((a) => a.monitoramento_id));
    },
  });
}
