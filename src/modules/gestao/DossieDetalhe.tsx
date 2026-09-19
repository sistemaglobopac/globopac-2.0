import { ChevronLeft } from "lucide-react";
import { useDossieMonitoramento } from "./api";

/** Documento de auditoria de um monitoramento, aberto de dentro dos modais de "Monitoramentos
 * em Andamento" e "RNCs Pendentes" (seção "cada item é clicável e abre o dossiê completo... com
 * botão Voltar para a lista"). Componente único reaproveitado pelos dois lugares. */
export function DossieDetalhe({ monitoramentoId, onVoltar }: { monitoramentoId: string; onVoltar: () => void }) {
  const { data: dossie, isLoading, error } = useDossieMonitoramento(monitoramentoId);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-1 text-sm font-bold"
        style={{ color: "#6a5fc1" }}
      >
        <ChevronLeft className="h-4 w-4" /> Voltar para a lista
      </button>

      {isLoading && <p className="text-sm" style={{ color: "#79628c" }}>Carregando dossiê…</p>}
      {error && (
        <p className="rounded-md p-3 text-sm" style={{ background: "#dc26261a", color: "#dc2626" }}>
          Falha ao carregar o dossiê: {error instanceof Error ? error.message : "erro desconhecido"}
        </p>
      )}

      {dossie && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: "#f7f8fa", border: "1px solid #dfe2e7" }}>
            <p className="text-sm font-bold" style={{ color: "#1f1633" }}>
              {dossie.fichaCodigo ?? "—"} · {dossie.fichaNome ?? "Ficha"}
            </p>
            <p className="mt-1 text-xs" style={{ color: "#79628c" }}>
              Setor: {dossie.setor} · Criado em {new Date(dossie.criado_em).toLocaleString("pt-BR")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span
                className="rounded-full px-2.5 py-1"
                style={{
                  background: dossie.conformidade === false ? "#dc26261a" : "#c2ef4e",
                  color: dossie.conformidade === false ? "#dc2626" : "#1f1633",
                }}
              >
                {dossie.conformidade === false ? "Não conforme" : dossie.conformidade === true ? "Conforme" : "Aguardando verificação"}
              </span>
              {dossie.liberado_sif && (
                <span className="rounded-full px-2.5 py-1" style={{ background: "#1f1633", color: "#c2ef4e" }}>
                  Liberado ao SIF
                </span>
              )}
            </div>
            <p className="mt-2 text-xs" style={{ color: "#79628c" }}>
              Inspetor: {dossie.inspetorNome ?? "—"}
              {dossie.verificadorNome && <> · Verificado por {dossie.verificadorNome} em {new Date(dossie.verificado_em!).toLocaleString("pt-BR")}</>}
            </p>
          </div>

          {dossie.assinaturas.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
                Assinaturas eletrônicas
              </h4>
              <ul className="space-y-1">
                {dossie.assinaturas.map((a, i) => (
                  <li key={i} className="text-xs" style={{ color: "#1f1633" }}>
                    {a.tipo} — {new Date(a.criado_em).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
              Dados apontados
            </h4>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(dossie.dados_dinamicos)
                .filter(([campo]) => campo !== "adendos")
                .map(([campo, valor]) => (
                  <div key={campo} className="rounded-md p-2 text-xs" style={{ background: "#f7f8fa" }}>
                    <dt className="font-bold" style={{ color: "#79628c" }}>
                      {campo}
                    </dt>
                    <dd style={{ color: "#1f1633" }}>{typeof valor === "object" ? JSON.stringify(valor) : String(valor)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
