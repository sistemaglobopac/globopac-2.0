// Pendências de assinatura (Painel de Gestão): rascunhos aguardando a assinatura do inspetor (cópia na nuvem, de qualquer
// aparelho) e registros já gravados que ficaram sem a assinatura dele.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface RascunhoPendente {
  id: string;
  user_id: string;
  setor: string;
  hora_monitoramento: string;
  salvo_em: string;
  conteudo: { nomeFicha?: string; naoConforme?: boolean; motivosNc?: string[] };
}

/** Rascunhos ainda não assinados de todos os inspetores (só ADMIN_MASTER e VERIFICADOR enxergam os dos outros). */
export function useRascunhosPendentes() {
  return useQuery({
    queryKey: ["gestao", "rascunhos-pendentes"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rascunhos_monitoramento")
        .select("id, user_id, setor, hora_monitoramento, salvo_em, conteudo")
        .eq("status", "pendente")
        .order("hora_monitoramento", { ascending: true })
        .limit(500)
        .overrideTypes<RascunhoPendente[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RegistroSemAssinatura {
  id: string;
  user_id: string;
  setor: string;
  ficha: string;
  realizado_em: string;
  verificado: boolean;
}

/** Monitoramentos finalizados sem a assinatura do inspetor (função do banco; só ADMIN_MASTER e VERIFICADOR). */
export function useRegistrosSemAssinatura() {
  return useQuery({
    queryKey: ["gestao", "registros-sem-assinatura"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitoramentos_sem_assinatura_inspetor");
      if (error) throw error;
      return (data ?? []) as unknown as RegistroSemAssinatura[];
    },
  });
}
