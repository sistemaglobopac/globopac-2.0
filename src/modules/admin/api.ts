import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Sentinela gravado em perfis_usuarios.setores_permitidos pelo checkbox "Acesso Geral" do
 * cadastro de colaboradores (FormUsuarioModal). Nunca é um nome de setor real — precisa ser
 * expandido (resolverSetoresEfetivos) antes de comparar/filtrar contra monitoramentos.setor,
 * rnc.setor etc., senão a comparação nunca bate e o usuário "Acesso Geral" não vê nada. */
export const SETOR_LIVRE = "Todos";

/** Resolve os setores efetivos de um perfil para uso em filtros client-side (dropdowns,
 * queries .in("setor", ...)): expande o sentinela SETOR_LIVRE para a lista completa de
 * setores cadastrados. O equivalente no banco é a função public.meus_setores(), usada pela
 * RLS — mantenha os dois em sincronia. */
export function resolverSetoresEfetivos(setoresPermitidos: string[], setoresCadastrados: string[] | undefined): string[] {
  if (setoresPermitidos.length === 0 || setoresPermitidos.includes(SETOR_LIVRE)) {
    return setoresCadastrados ?? [];
  }
  return setoresPermitidos;
}

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
