import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useDadosRelatorio } from "../../api";
import { imprimirElemento } from "../../utils/printHelper";
import { RelatorioMonitoramento } from "./RelatorioMonitoramento";

const ELEMENTO_IMPRESSAO_ID = "relatorio-impressao";

/** Modal grande de pré-visualização/impressão do relatório oficial — distinto do ModalBase
 * estreito usado em PainelVerificacao.tsx para ações rápidas (aprovar/reprovar/adendo). A
 * barra de ferramentas (`gs-no-print`) nunca vai para o papel — a impressão é da própria
 * página (ver printHelper.ts e o bloco @media print em index.css), então o que sai no papel é
 * exatamente o mesmo HTML/CSS já renderizado na tela, nunca uma cópia à parte. As classes
 * `relatorio-modal-*` existem só para o @media print neutralizar overflow/position dos
 * wrappers do modal (ver index.css) — sem isso, o overflow-hidden/max-h-full do diálogo corta
 * o relatório na impressão mesmo com #relatorio-impressao marcado como visível. */
export function RelatorioModal({ ids, onFechar }: { ids: string[]; onFechar: () => void }) {
  const { data: dados, isLoading, isError } = useDadosRelatorio(ids);

  return (
    <div className="relatorio-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Relatório de monitoramento"
        className="relatorio-modal-dialog flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface-soft shadow-2xl"
      >
        <div className="gs-no-print flex items-center justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
          <span className="font-semibold">Relatório de Monitoramento</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="accent" size="sm" disabled={!dados} onClick={() => imprimirElemento()}>
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relatorio-modal-body flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando relatório…
            </div>
          )}
          {isError && <p className="py-20 text-center text-sm text-destructive">Falha ao carregar os dados do relatório.</p>}
          {dados && (
            <div id={ELEMENTO_IMPRESSAO_ID}>
              <RelatorioMonitoramento ids={ids} dados={dados} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
