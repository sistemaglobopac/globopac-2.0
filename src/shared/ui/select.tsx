import * as React from "react";
import { cn } from "@/lib/utils";

// Select nativo estilizado (não Radix): para os formulários da Fase 1 (poucas opções, sem
// necessidade de busca/virtualização), um <select> nativo é mais simples, mais acessível por
// padrão e evita uma dependência extra sem ganho real neste estágio.
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = "Select";
