import type { ReactNode } from "react";
import { resumoHash } from "@/modules/fichas/utils/hashDocumento";

/** Selo de assinatura eletrônica dos relatórios oficiais (monitoramento e BPF): marca d'água da
 * logo a 10% de opacidade, nome, data/hora, SHA-256 resumido e a base legal. `integro` só aparece
 * quando o relatório consegue recomputar o hash (null = não exibe). `children` entra abaixo do
 * hash, para detalhar atos assinados (ex.: cada SS aprovada). */
export function SeloAssinatura({
  titulo,
  nome,
  dataHora,
  hash,
  integro,
  corLabel = "text-primary",
  children,
}: {
  titulo: string;
  nome: string;
  dataHora: string;
  hash: string | null | undefined;
  integro: boolean | null;
  corLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-ink/70 bg-white p-3 print:p-2">
      {/* Marca d'água da logo a 10% de opacidade (90% de transparência, a pedido do usuário) —
          mesma ideia do selo de assinatura do v1, atrás do conteúdo, sem interferir na leitura. */}
      <div className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center" style={{ opacity: 0.1 }}>
        <img src="/logo-globopac.png" alt="" className="max-h-[85%] max-w-[85%] object-contain" />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center">
        <p className="mb-1 w-full border-b border-hairline pb-1 text-center text-[9px] font-bold uppercase tracking-tight text-muted-foreground print:pb-0.5 print:text-[8px]">
          {titulo}
        </p>
        <p className="mt-1 max-w-full truncate text-sm font-bold text-ink print:text-[9px]">{nome}</p>
        <p className="mt-1 font-mono text-xs font-bold text-muted-foreground print:text-[8px]">{dataHora}</p>
        <p className={`mt-1 text-[10px] font-black uppercase print:text-[8px] ${corLabel}`}>SISTEMA GLOBOPAC</p>
        <p className="mt-0.5 font-mono text-[8px] leading-tight text-muted-foreground print:text-[7px]">
          SHA-256: {resumoHash(hash, 20) ?? "—"}
          {integro !== null && (integro ? " · ÍNTEGRO" : " · VERIFIQUE")}
        </p>
        <p className="text-[7px] leading-none text-muted-foreground">LEI 14.063/2020 · Art. 4º §2º</p>
        {children}
      </div>
    </div>
  );
}
