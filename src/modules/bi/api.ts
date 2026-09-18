import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export interface MonitoramentoResumo {
  id: string;
  setor: string;
  conformidade: boolean | null;
  criado_em: string;
  verificado_em: string | null;
  liberado_sif: boolean;
  liberado_em: string | null;
}

/** Monitoramentos dos últimos 30 dias (RLS já escopa por setor/perfil — o mesmo dado que o
 * usuário já enxergaria navegando pelas outras telas, só agregado). */
export function useMonitoramentosResumo() {
  return useQuery({
    queryKey: ["bi", "monitoramentos"],
    queryFn: async () => {
      const desde = new Date(Date.now() - TRINTA_DIAS_MS).toISOString();
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, conformidade, criado_em, verificado_em, liberado_sif, liberado_em")
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .overrideTypes<MonitoramentoResumo[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export interface RncResumo {
  id: string;
  setor: string;
  severidade: string;
  status: string;
  criado_em: string;
  prazo_sla: string;
  fechado_em: string | null;
}

/** Todas as RNCs visíveis (sem corte de 30 dias — volume naturalmente pequeno e o histórico
 * de tratativas importa para auditoria mesmo fora da janela recente). */
export function useRncResumo() {
  return useQuery({
    queryKey: ["bi", "rnc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rnc")
        .select("id, setor, severidade, status, criado_em, prazo_sla, fechado_em")
        .order("criado_em", { ascending: false })
        .overrideTypes<RncResumo[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export interface OsResumo {
  id: string;
  setor: string;
  descricao: string;
  status: string;
  criado_em: string;
  concluido_em: string | null;
  liberado_sif: boolean;
  liberado_em: string | null;
}

export function useOsResumo() {
  return useQuery({
    queryKey: ["bi", "manutencao_os"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencao_os")
        .select("id, setor, descricao, status, criado_em, concluido_em, liberado_sif, liberado_em")
        .order("criado_em", { ascending: false })
        .overrideTypes<OsResumo[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}
