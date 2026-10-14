import { Loader2 } from "lucide-react";
import { RelatorioModal } from "@/modules/fichas/components/relatorio/RelatorioModal";
import { useIdVigenteDoMonitoramento } from "./api";

/** Relatório oficial (somente leitura) de um monitoramento do turno, com os dados que o inspetor informou. Se o registro foi
 * corrigido por adendo, mostra a versão vigente (o original continua no histórico do relatório). */
export function RelatorioDoMonitoramentoModal({ monitoramentoId, onFechar }: { monitoramentoId: string; onFechar: () => void }) {
  const { data: idVigente, isError } = useIdVigenteDoMonitoramento(monitoramentoId);
  if (idVigente) return <RelatorioModal ids={[idVigente]} onFechar={onFechar} />;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Relatório de monitoramento">
      <div className="flex items-center gap-2 rounded-xl bg-background px-6 py-5 text-sm shadow-2xl">
        {isError ? (
          <span className="text-destructive">Não foi possível abrir o relatório.</span>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Abrindo o relatório…
          </>
        )}
        <button type="button" onClick={onFechar} className="ml-4 text-xs font-bold text-primary underline">
          Fechar
        </button>
      </div>
    </div>
  );
}
