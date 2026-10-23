import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import type { CampoTemplate } from "@/shared/schema-campos";

interface OrigemDados {
  id: string;
  setor: string;
  criado_em: string;
  user_id: string;
  fichaCodigo: string | null;
  fichaNome: string;
  naoConformidades: string[];
}

export function useMonitoramentoDeOrigem(monitoramentoId: string | null) {
  return useQuery({
    queryKey: ["rnc", "origem", monitoramentoId],
    enabled: monitoramentoId !== null,
    queryFn: async (): Promise<OrigemDados | null> => {
      const { data: m, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, criado_em, user_id, ficha_template_id, dados_dinamicos")
        .eq("id", monitoramentoId as string)
        .maybeSingle()
        .overrideTypes<{ id: string; setor: string; criado_em: string; user_id: string; ficha_template_id: string; dados_dinamicos: Record<string, unknown> } | null, { merge: false }>();
      if (error) throw error;
      if (!m) return null;

      const { data: ficha } = await supabase
        .from("fichas_templates")
        .select("codigo, nome, schema_campos")
        .eq("id", m.ficha_template_id)
        .maybeSingle()
        .overrideTypes<{ codigo: string; nome: string; schema_campos: CampoTemplate[] } | null, { merge: false }>();

      return {
        id: m.id,
        setor: m.setor,
        criado_em: m.criado_em,
        user_id: m.user_id,
        fichaCodigo: ficha?.codigo ?? null,
        fichaNome: ficha?.nome ?? "Ficha de monitoramento",
        naoConformidades: desviosEspeciais(ficha?.schema_campos ?? [], m.dados_dinamicos ?? {}),
      };
    },
  });
}
