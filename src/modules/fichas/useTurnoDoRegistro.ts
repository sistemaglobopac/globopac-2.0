import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { turnoDoRegistro, type TurnoInspetorResolucao } from "./utils/turnoUtils";

const JANELA_DIAS = 90;

/** Resolve o turno de um monitoramento pelos turnos abertos dos inspetores (ver `turnoDoRegistro`).
 * Enquanto os turnos não carregam — ou se o perfil não puder lê-los — usa a regra do relógio. */
export function useTurnoDoRegistro() {
  const { data } = useQuery({
    queryKey: ["turnos_inspetores", "resolucao-turno"],
    staleTime: 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();
      // Função do banco: o Verificador/Auditor não leem turnos_inspetores (RLS). Sem a migração aplicada,
      // cai na leitura direta da tabela (que o ADMIN_MASTER e o dono já têm).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: viaRpc, error: erroRpc } = await (supabase.rpc as any)("turnos_para_resolucao", { p_desde: desde });
      if (!erroRpc) return (viaRpc ?? []) as TurnoInspetorResolucao[];

      const { data: linhas, error } = await supabase
        .from("turnos_inspetores")
        .select("user_id, setor, inicio, fim")
        .gte("inicio", desde)
        .overrideTypes<TurnoInspetorResolucao[], { merge: false }>();
      if (error) throw error;
      return linhas ?? [];
    },
  });
  return useCallback(
    (m: { user_id: string; setor?: string; criado_em: string }) => turnoDoRegistro(m, data ?? []),
    [data]
  );
}
