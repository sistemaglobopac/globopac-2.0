import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalShellProps {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  largura?: string;
  rodape?: ReactNode;
}

/** Casca visual comum a todos os modais do Painel de Gestão (KPIs, formulários administrativos)
 * — mesmo padrão do `ModalBase` usado no Painel de Verificação (ver
 * src/modules/fichas/PainelVerificacao.tsx): overlay escuro translúcido, cartão claro
 * arredondado, cabeçalho navy sólido com título + fechar, corpo com scroll próprio. */
export function ModalShell({ titulo, onClose, children, largura = "max-w-lg", rodape }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`flex max-h-[85vh] w-full ${largura} flex-col rounded-2xl bg-background shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl bg-primary p-4 text-primary-foreground">
          <h2 className="text-base font-bold">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 opacity-80 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {rodape && <div className="flex shrink-0 justify-end gap-2 border-t border-hairline p-3">{rodape}</div>}
      </div>
    </div>
  );
}
