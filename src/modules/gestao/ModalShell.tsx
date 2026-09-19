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
 * — overlay escuro translúcido, cartão branco arredondado, cabeçalho com título + fechar,
 * corpo com scroll próprio. */
export function ModalShell({ titulo, onClose, children, largura = "max-w-lg", rodape }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(21,15,35,0.55)" }}>
      <div className={`flex max-h-[85vh] w-full ${largura} flex-col rounded-2xl bg-white shadow-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b p-4" style={{ borderColor: "#dfe2e7" }}>
          <h2 className="text-base font-bold" style={{ color: "#1f1633" }}>
            {titulo}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-5 w-5" style={{ color: "#1f1633" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {rodape && (
          <div className="flex shrink-0 justify-end gap-2 border-t p-3" style={{ borderColor: "#dfe2e7" }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
