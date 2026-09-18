import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** app_config.setores_cadastrados — única fonte de verdade dos setores de inspeção (nunca
 * centros_custo, ver comentário da migração da tabela). Consumida também fora deste módulo
 * (ex.: Construtor de Fichas), mas gerida (criar/renomear/excluir) só aqui. */
export function useSetoresCadastrados() {
  return useQuery({
    queryKey: ["app_config", "setores_cadastrados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "setores_cadastrados")
        .single()
        .overrideTypes<{ valor: string[] }, { merge: false }>();
      if (error) throw error;
      return data.valor;
    },
  });
}

/** Grava a lista inteira de setores de uma vez (criar/renomear/excluir são só variações do
 * mesmo array antes de chamar isto) — não há linha por setor, só um único registro jsonb em
 * app_config. Renomear é uma troca de string simples: NÃO propaga para
 * perfis_usuarios.setores_permitidos, monitoramentos.setor, rnc.setor, os.setor nem
 * fichas_templates.locais_aplicacao, que continuam com o nome antigo (aviso mostrado na UI). */
export function useSalvarSetores() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (setores: string[]) => {
      const { error } = await supabase.from("app_config").upsert({ chave: "setores_cadastrados", valor: setores }, { onConflict: "chave" });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["app_config", "setores_cadastrados"] });
    },
  });
}
