import { ChevronLeft } from "lucide-react";
import { useDossieMonitoramento } from "./api";

/** Documento de auditoria de um monitoramento, aberto de dentro dos modais de "Monitoramentos
 * em Andamento" e "RNCs Pendentes" (seção "cada item é clicável e abre o dossiê completo... com
 * botão Voltar para a lista"). Componente único reaproveitado pelos dois lugares. */
export function DossieDetalhe({ monitoramentoId, onVoltar }: { monitoramentoId: string; onVoltar: () => void }) {
  const { data: dossie, isLoading, error } = useDossieMonitoramento(monitoramentoId);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1 text-sm font-bold text-primary">
        <ChevronLeft className="h-4 w-4" /> Voltar para a lista
      </button>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando dossiê…</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Falha ao carregar o dossiê: {error instanceof Error ? error.message : "erro desconhecido"}
        </p>
      )}

      {dossie && (
        <div className="space-y-4">
          <div className="rounded-xl border border-hairline bg-surface-soft p-4">
            <p className="text-sm font-bold text-ink">
              {dossie.fichaCodigo ?? "—"} · {dossie.fichaNome ?? "Ficha"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Setor: {dossie.setor} · Criado em {new Date(dossie.criado_em).toLocaleString("pt-BR")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  dossie.conformidade === false ? "bg-destructive/10 text-destructive" : "bg-lime text-primary"
                }`}
              >
                {dossie.conformidade === false ? "Não conforme" : dossie.conformidade === true ? "Conforme" : "Aguardando verificação"}
              </span>
              {dossie.liberado_sif && (
                <span className="rounded-full bg-surface-dark px-2.5 py-1 text-lime">Liberado ao SIF</span>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Inspetor: {dossie.inspetorNome ?? "—"}
              {dossie.verificadorNome && <> · Verificado por {dossie.verificadorNome} em {new Date(dossie.verificado_em!).toLocaleString("pt-BR")}</>}
            </p>
          </div>

          {dossie.assinaturas.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Assinaturas eletrônicas</h4>
              <ul className="space-y-1">
                {dossie.assinaturas.map((a, i) => (
                  <li key={i} className="text-xs text-ink">
                    {a.tipo} — {new Date(a.criado_em).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Dados apontados</h4>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(dossie.dados_dinamicos)
                .filter(([campo]) => campo !== "adendos")
                .map(([campo, valor]) => (
                  <div key={campo} className="rounded-md bg-surface-soft p-2 text-xs">
                    <dt className="font-bold text-muted-foreground">{campo}</dt>
                    <dd className="text-ink">{typeof valor === "object" ? JSON.stringify(valor) : String(valor)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
