import { useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useCargasCanceladasDoDia, useReativarCarga } from "./api";

/** Cargas canceladas do dia de abate: GTA, quem cancelou, quando e por quê. Cada uma pode ser reativada (cancelada por engano). */
export function CargasCanceladas({ dataAbate }: { dataAbate: string }) {
  const { data: canceladas } = useCargasCanceladasDoDia(dataAbate);
  const reativar = useReativarCarga();
  const [erro, setErro] = useState<string | null>(null);

  if (!canceladas || canceladas.length === 0) return null;

  async function desfazer(id: string) {
    setErro(null);
    try {
      await reativar.mutateAsync(id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reativar a carga.");
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-warning/50 bg-warning/5 p-4" data-testid="cargas-canceladas">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-warning-foreground">
        <Ban className="h-4 w-4" /> Cargas canceladas ({canceladas.length})
      </h2>
      <ul className="space-y-2">
        {canceladas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-background p-3 text-sm" data-testid={`carga-cancelada-${c.gta}`}>
            <div className="min-w-0 space-y-0.5">
              <p>
                <strong>GTA {c.gta}</strong> — {c.integrado} · Aviário {c.aviario}
                {c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · {c.qtd_aves.toLocaleString("pt-BR")} aves
              </p>
              <p className="text-xs italic">Motivo: {c.motivo_cancelamento}</p>
              <p className="text-xs text-muted-foreground">
                Cancelada por {c.cancelada_por_nome} em {new Date(c.cancelada_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={reativar.isPending} onClick={() => void desfazer(c.id)} aria-label={`Reativar GTA ${c.gta}`}>
              <Undo2 className="mr-1 h-4 w-4" /> Reativar
            </Button>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </section>
  );
}
