import type { ReactNode } from "react";
import { DialogProvider } from "@/modules/gestao/dialogSystem";
import { cn } from "@/lib/utils";

/** Invólucro das telas do BPF Estrutural: fornece o sistema de diálogos (alert/confirm do
 * projeto, que só existe dentro de um DialogProvider) e a largura padrão da página. */
export function PaginaBpf({ children, larga }: { children: ReactNode; larga?: boolean }) {
  return (
    <DialogProvider>
      <div className={cn("mx-auto space-y-6", larga ? "max-w-5xl" : "max-w-3xl", "print:max-w-none")}>{children}</div>
    </DialogProvider>
  );
}

export function CabecalhoBpf({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{titulo}</h1>
        {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes}
    </div>
  );
}
