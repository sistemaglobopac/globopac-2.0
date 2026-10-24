import type { ReactNode } from "react";
import { CheckCircle2, Clock, Scale, Search, Shield } from "lucide-react";
import { resumoHash } from "@/modules/fichas/utils/hashDocumento";

/** Rodapé "Atestado de Validade Jurídica e Compliance Tecnológico" dos relatórios oficiais
 * (monitoramento e BPF). O que muda de um relatório para outro entra por props: o objeto
 * (monitoramento / relatório), o protocolo, o hash, e os blocos de carimbo de tempo e de auditoria,
 * que dependem do que o sistema de fato registra para aquele documento. */
export function RodapeAtestado({
  objeto,
  protocolo,
  hash,
  integro,
  carimbo,
  auditoria,
}: {
  /** "monitoramento" ou "relatório" — aparece no bloco do carimbo de tempo. */
  objeto: string;
  protocolo: string;
  hash: string | null | undefined;
  integro: boolean | null;
  carimbo: ReactNode;
  auditoria: ReactNode;
}) {
  return (
    <>
      {/* Rodapé de conformidade legal */}
      <div className="rodape-relatorio mt-4 overflow-hidden rounded-lg border border-hairline print:mt-2" style={{ breakInside: "avoid" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-gray-50 px-4 py-2 print:px-3 print:py-1">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary print:text-[9px]">
            <Shield className="h-4 w-4 print:h-3 print:w-3" /> Atestado de Validade Jurídica e Compliance Tecnológico
          </h3>
          {hash && (
            <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 print:text-[8px]">
              SHA-256: {resumoHash(hash, 16)}
              {integro !== null && (integro ? " ✓ ÍNTEGRO" : " ≠ VERIFIQUE")}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 bg-white p-4 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2 print:grid-cols-2 print:gap-x-4 print:gap-y-2 print:p-3 print:text-[8px]">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
              <Scale className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Amparo Legal e Normativo
            </p>
            <p>
              Documento oficial de autocontrole, gerado em conformidade com as exigências do MAPA para os agentes privados. As assinaturas e registros
              atendem aos requisitos de evidência eletrônica e rastreabilidade industrial.
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 print:h-3 print:w-3" /> Criptografia e Imutabilidade
            </p>
            <p>
              Após assinado digitalmente, este registro entra em modo estrito de bloqueio (Read-Only). O banco de dados em nuvem garante que o conteúdo
              não pode ser corrompido, adulterado ou apagado sem gerar alertas no sistema mestre.
            </p>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
              <Clock className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Carimbo de Tempo (Timestamp)
            </p>
            <p>
              A sincronização de data e hora deste {objeto} foi aferida por servidores seguros no momento exato do lançamento, prevenindo edições
              retroativas. Protocolo Oficial: <strong className="text-primary">{protocolo}</strong>
            </p>
            {carimbo}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
              <Search className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Auditoria Permanente
            </p>
            {auditoria}
          </div>
        </div>
        <p className="border-t border-hairline bg-gray-50 px-4 py-1 text-[9px] text-muted-foreground print:px-3 print:text-[7px]">
          Sistema GloboPac · Kaefer Agro Industrial LTDA. · SIF 1606
          {hash ? ` · SHA-256: ${resumoHash(hash, 16)}` : ""}
        </p>
      </div>

      <div className="doc-generated-by hidden pt-2 text-right text-[9px] uppercase text-muted-foreground print:block">
        Relatório validado e gerado pelo Sistema GloboPac.
      </div>
    </>
  );
}
