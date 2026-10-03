import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "../ModalShell";
import { DossieDetalhe } from "../DossieDetalhe";
import { useMonitoramentosHojeDetalhado } from "../api";

export function ModalMonitoramentosAndamento({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useMonitoramentosHojeDetalhado();
  const [dossieId, setDossieId] = useState<string | null>(null);

  return (
    <ModalShell titulo={`Monitoramentos em Atraso (${data?.atrasados.length ?? 0})`} onClose={onClose} largura="max-w-3xl">
      {dossieId ? (
        <DossieDetalhe monitoramentoId={dossieId} onVoltar={() => setDossieId(null)} />
      ) : (
        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {data && data.atrasados.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Nenhum monitoramento em atraso neste turno.</p>
          )}

          {data && data.atrasados.length > 0 && (
            <ul className="space-y-1">
              {data.atrasados.map((a) => (
                <li key={`${a.fichaTemplateId}-${a.setor}`}>
                  <button
                    type="button"
                    onClick={() => setDossieId(a.ultimoMonitoramentoId)}
                    className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-left text-xs text-destructive hover:opacity-80"
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" /> {a.codigo} · {a.setor}
                    </span>
                    <span className="block">{a.motivo}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalShell>
  );
}
