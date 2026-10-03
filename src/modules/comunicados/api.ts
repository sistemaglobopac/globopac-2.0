import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ComunicadoAlerta {
  id: string;
  titulo: string;
  mensagem: string;
  autor_nome: string;
  autor_perfil: string;
  para_todos: boolean;
  criado_em: string;
}

export interface ComunicadoEnviado extends ComunicadoAlerta {
  comunicados_alerta_destinatarios: { user_id: string; lido_em: string | null }[];
}

const COLUNAS = "id, titulo, mensagem, autor_nome, autor_perfil, para_todos, criado_em";

/** Comunicados enviados (Administrador/Verificador), com a situação de leitura de cada destinatário. */
export function useComunicadosEnviados() {
  return useQuery({
    queryKey: ["comunicados-alerta", "enviados"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicados_alerta")
        .select(`${COLUNAS}, comunicados_alerta_destinatarios(user_id, lido_em)`)
        .order("criado_em", { ascending: false })
        .limit(50)
        .overrideTypes<ComunicadoEnviado[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEnviarComunicado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { titulo: string; mensagem: string; paraTodos: boolean; destinatarios: string[] }) => {
      const { error } = await supabase.rpc("enviar_comunicado", {
        p_titulo: input.titulo,
        p_mensagem: input.mensagem,
        p_para_todos: input.paraTodos,
        p_destinatarios: input.destinatarios,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["comunicados-alerta"] }),
  });
}

/** Comunicados endereçados ao inspetor que ele ainda não confirmou ter lido (mais antigo primeiro). */
export function useComunicadosPendentes(userId: string | undefined) {
  return useQuery({
    queryKey: ["comunicados-alerta", "pendentes", userId],
    enabled: !!userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comunicados_alerta_destinatarios")
        .select(`comunicado_id, comunicados_alerta(${COLUNAS})`)
        .eq("user_id", userId as string)
        .is("lido_em", null)
        .overrideTypes<{ comunicado_id: string; comunicados_alerta: ComunicadoAlerta | null }[], { merge: false }>();
      if (error) throw error;
      return (data ?? [])
        .map((r) => r.comunicados_alerta)
        .filter((c): c is ComunicadoAlerta => c !== null)
        .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
    },
  });
}

export function useConfirmarLeituraComunicado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (comunicadoId: string) => {
      const { error } = await supabase.rpc("confirmar_leitura_comunicado", { p_comunicado_id: comunicadoId });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["comunicados-alerta"] }),
  });
}
