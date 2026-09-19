import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "../ModalShell";
import { DossieDetalhe } from "../DossieDetalhe";
import { useMonitoramentosHojeDetalhado } from "../api";

export function ModalMonitoramentosAndamento({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useMonitoramentosHojeDetalhado();
  const [dossieId, setDossieId] = useState<string | null>(null);

  return (
    <ModalShell titulo={`Monitoramentos em Andamento (${data?.total ?? 0})`} onClose={onClose} largura="max-w-3xl">
      {dossieId ? (
        <DossieDetalhe monitoramentoId={dossieId} onVoltar={() => setDossieId(null)} />
      ) : (
        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {data && data.atrasados.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-destructive">
                <AlertTriangle className="h-4 w-4" /> Monitoramentos em atraso ({data.atrasados.length})
              </p>
              <ul className="space-y-1">
                {data.atrasados.map((a, i) => (
                  <li key={i} className="text-xs text-destructive">
                    <span className="font-bold">
                      {a.codigo} · {a.setor}
                    </span>{" "}
                    — {a.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data && data.porSetor.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Nenhum monitoramento criado hoje ainda.</p>
          )}

          {data?.porSetor.map((grupo) => (
            <div key={grupo.setor}>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{grupo.setor}</h4>
                <span className="text-xs font-bold text-ink">{grupo.quantidade}</span>
              </div>
              <ul className="space-y-1">
                {grupo.itens.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setDossieId(item.id)}
                      className="w-full rounded-md border border-hairline bg-surface-soft px-2 py-1.5 text-left text-xs text-ink hover:opacity-80"
                    >
                      {new Date(item.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                      {item.conformidade === false ? "Não conforme" : item.conformidade === true ? "Conforme" : "Aguardando verificação"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
