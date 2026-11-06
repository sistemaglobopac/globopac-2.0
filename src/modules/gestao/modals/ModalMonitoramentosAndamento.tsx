import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ModalShell } from "../ModalShell";
import { DossieDetalhe } from "../DossieDetalhe";
import { useMonitoramentosHojeDetalhado } from "../api";
import { rotuloSituacao } from "@/shared/situacaoConformidade";

export function ModalMonitoramentosAndamento({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useMonitoramentosHojeDetalhado();
  const [dossieId, setDossieId] = useState<string | null>(null);

  return (
    <ModalShell titulo={`Monitoramentos do turno (${data?.total ?? 0})`} onClose={onClose} largura="max-w-3xl">
      {dossieId ? (
        <DossieDetalhe monitoramentoId={dossieId} onVoltar={() => setDossieId(null)} />
      ) : (
        <div className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {data && data.total === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">Nenhum monitoramento registrado neste turno.</p>
          )}

          {data && data.atrasados.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-destructive">Em atraso ({data.atrasados.length})</h4>
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
            </section>
          )}

          {data?.porSetor.map((grupo) => (
            <section key={grupo.setor}>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {grupo.setor} ({grupo.quantidade})
              </h4>
              <ul className="space-y-1">
                {grupo.itens.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setDossieId(m.id)}
                      className="w-full rounded-md border border-hairline bg-surface-soft px-2 py-1.5 text-left text-xs hover:opacity-80"
                    >
                      <span className="flex items-center justify-between gap-2 font-bold text-ink">
                        <span>
                          {m.fichaCodigo ?? "—"} · {m.fichaNome ?? "Ficha"}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {new Date(m.criado_em).toLocaleTimeString("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="block text-muted-foreground">{rotuloSituacao(m)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
