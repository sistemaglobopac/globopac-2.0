import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useDadosRelatorio } from "../../api";
import { imprimirElemento } from "../../utils/printHelper";
import { RelatorioMonitoramento } from "./RelatorioMonitoramento";

const ELEMENTO_IMPRESSAO_ID = "relatorio-impressao";

/** Modal grande de pré-visualização/impressão do relatório oficial — distinto do ModalBase
 * estreito usado em PainelVerificacao.tsx para ações rápidas (aprovar/reprovar/adendo). A
 * barra de ferramentas (`gs-no-print`) nunca vai para o papel — só o conteúdo dentro de
 * #relatorio-impressao, que imprimirElemento copia para a janela de impressão. */
export function RelatorioModal({ ids, onFechar }: { ids: string[]; onFechar: () => void }) {
  const { data: dados, isLoading, isError } = useDadosRelatorio(ids);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
      <div role="dialog" aria-modal="true" aria-label="Relatório de monitoramento" className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface-soft shadow-2xl">
        <div className="gs-no-print flex items-center justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
          <span className="font-semibold">Relatório de Monitoramento</span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!dados}
              onClick={() => imprimirElemento(ELEMENTO_IMPRESSAO_ID)}
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
