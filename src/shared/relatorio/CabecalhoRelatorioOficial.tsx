import { Shield } from "lucide-react";

// Razão social/SIF fixos — mesma planta/cliente do v1, só trocou de sistema (confirmado com o usuário). Não há hoje um app_config para
// isso; se um dia mudar, este é o ponto do cabeçalho dos relatórios oficiais a tocar.
export const RAZAO_SOCIAL = "KAEFER AGRO INDUSTRIAL LTDA. - SIF1606";

interface CabecalhoRelatorioOficialProps {
  /** Linha abaixo da razão social (ex.: "Sistema de Gestão de Qualidade — Relatório Oficial"). */
  subtitulo: string;
  protocolo: string;
  /** Texto do carimbo de tempo no quadro do protocolo; o rótulo antes dele é `rotuloEmissao`. */
  emitidoEm: string;
  rotuloEmissao?: string;
  /** Nome do documento (ficha / relatório). */
  titulo: string;
  /** Código de ficha (ex.: RAC 002/001), no selo ao lado do título. */
  codigo?: string | null;
  codigoTestId?: string;
  /** Selos extras ao lado do código (ex.: "2 APURAÇÕES NO DIA"). */
  etiquetas?: string[];
  /** Grade de metadados rotulados: [rótulo, valor]. */
  metadados: [string, string][];
}

/** Cabeçalho dos relatórios oficiais — o mesmo dos relatórios de monitoramento e dos relatórios de OS (BPF): identificação da planta e
 * protocolo no topo, nome do documento com o código de ficha e uma grade de metadados rotulados. Fica no tema escuro e é impresso
 * como está (`cabecalho-relatorio` ajusta a impressão em index.css). */
export function CabecalhoRelatorioOficial({
  subtitulo,
  protocolo,
  emitidoEm,
  rotuloEmissao = "Emitido em",
  titulo,
  codigo,
  codigoTestId,
  etiquetas = [],
  metadados,
}: CabecalhoRelatorioOficialProps) {
  return (
    <div className="cabecalho-relatorio w-full rounded-t-lg bg-surface-dark p-6 text-ondark">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Shield className="h-9 w-9 shrink-0 opacity-80" />
          <div className="min-w-0">
            <p className="text-lg font-black leading-tight tracking-wide">{RAZAO_SOCIAL}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest opacity-80">{subtitulo}</p>
          </div>
        </div>
        <div className="shrink-0 rounded-lg border border-ondark/20 bg-ondark/10 px-3 py-2 text-right">
          <p className="text-[9px] uppercase tracking-widest opacity-80">Protocolo</p>
          <p className="font-mono text-base font-black tracking-wider">{protocolo}</p>
          <p className="mt-0.5 text-[10px] opacity-80">
            {rotuloEmissao} {emitidoEm}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ondark/20 pt-3">
        <h1 className="min-w-0 text-lg font-extrabold leading-snug">{titulo}</h1>
        {codigo && (
          <span className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime" data-testid={codigoTestId}>
            {codigo}
          </span>
        )}
        {etiquetas.map((e) => (
          <span key={e} className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime">
            {e}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ondark/20 bg-ondark/20 sm:grid-cols-3">
        {metadados.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0 bg-surface-dark px-3 py-1.5">
            <dt className="text-[9px] font-bold uppercase tracking-widest opacity-70">{rotulo}</dt>
            <dd className="truncate text-sm font-bold">{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
