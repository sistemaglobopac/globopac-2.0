import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileSearch } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/shared/ui/button";
import { RelatorioModal } from "@/modules/fichas/components/relatorio/RelatorioModal";
import { useUsuariosMap } from "@/modules/fichas/api";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
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

function useMonitoramentoDeOrigem(monitoramentoId: string | null) {
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

/** "Monitoramento de origem": referência do monitoramento não conforme que gerou a RNC (ficha,
 * código, setor, data/hora, inspetor e o que estava não conforme) + abertura do relatório
 * completo do monitoramento. Fica visível para quem recebe a RNC (gestor de setor e verificador). */
export function OrigemRnc({ monitoramentoId }: { monitoramentoId: string | null }) {
  const { data: origem, isLoading } = useMonitoramentoDeOrigem(monitoramentoId);
  const { data: usuarios } = useUsuariosMap();
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  if (monitoramentoId === null) {
    return (
      <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-testid="origem-rnc">
        RNC avulsa — não está vinculada a um monitoramento.
      </p>
    );
  }
  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando o monitoramento de origem…</p>;
  if (!origem) {
    return (
      <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-testid="origem-rnc">
        Monitoramento de origem {monitoramentoId.slice(0, 8).toUpperCase()} (sem acesso aos detalhes).
      </p>
    );
  }

  const quando = ensureLocalTime(origem.criado_em);

  return (
    <div className="space-y-2 rounded-md border-2 border-down/30 bg-down-soft/40 p-3 text-sm" data-testid="origem-rnc">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="mb-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-down">
            <FileSearch className="h-3.5 w-3.5" /> Monitoramento de origem (não conforme)
          </span>
          <p className="font-semibold">
            {origem.fichaNome}
            {origem.fichaCodigo && <span className="ml-1.5 rounded bg-background px-1.5 py-0.5 text-xs font-bold">{origem.fichaCodigo}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {origem.setor} · {quando.datePt} {quando.time} · {usuarios?.get(origem.user_id) ?? "Inspetor"} · ref. {origem.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setRelatorioAberto(true)}>
          <Eye className="h-3.5 w-3.5" />
          Ver monitoramento
        </Button>
      </div>
      {origem.naoConformidades.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {origem.naoConformidades.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {relatorioAberto && <RelatorioModal ids={[origem.id]} onFechar={() => setRelatorioAberto(false)} />}
    </div>
  );
}
