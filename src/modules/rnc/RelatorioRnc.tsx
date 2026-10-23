import { createPortal } from "react-dom";
import { Printer, Shield, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useUsuariosMap } from "@/modules/fichas/api";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { type Rnc, estaAtrasada, useAnexosRnc } from "./api";
import { useMonitoramentoDeOrigem } from "./useMonitoramentoDeOrigem";

const RAZAO_SOCIAL = "KAEFER AGRO INDUSTRIAL LTDA. - SIF1606";

const STATUS: Record<Rnc["status"], string> = {
  ABERTA: "Aberta",
  EM_TRATATIVA: "Em tratativa",
  TRATADA: "Respondida — aguardando julgamento do Verificador",
  REABERTA: "Reaberta",
  DEVOLVIDA: "Devolvida pelo Verificador",
  FECHADA: "Fechada",
};

const SEVERIDADE: Record<Rnc["severidade"], string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus" }) : "—");

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1" style={{ breakInside: "avoid" }}>
      <h2 className="border-b border-hairline pb-0.5 text-xs font-bold uppercase tracking-wider text-primary">{titulo}</h2>
      <div className="text-sm">{children}</div>
    </section>
  );
}

function Texto({ valor, vazio }: { valor: string | null; vazio: string }) {
  return valor ? <p className="whitespace-pre-line">{valor}</p> : <p className="italic text-muted-foreground">{vazio}</p>;
}

/** Documento da RNC para impressão (A4). Segue a mesma técnica do relatório de monitoramento: o
 * conteúdo fica em #relatorio-impressao e o @media print de index.css imprime só ele. */
export function RelatorioRnc({ rnc, onFechar }: { rnc: Rnc; onFechar: () => void }) {
  const { data: usuarios } = useUsuariosMap();
  const { data: anexos } = useAnexosRnc(rnc.id);
  const { data: origem } = useMonitoramentoDeOrigem(rnc.monitoramento_id);
  const nome = (id: string | null, padrao = "—") => (id ? (usuarios?.get(id) ?? padrao) : padrao);
  const protocolo = `RNC-${rnc.id.slice(0, 8).toUpperCase()}`;
  const quandoOrigem = origem ? ensureLocalTime(origem.criado_em) : null;
  const atrasada = estaAtrasada(rnc);

  // Portal no <body>: fora do Card/ancestrais da página, o @media print ancora o relatório no topo da folha.
  return createPortal(
    <div className="relatorio-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Relatório de Não Conformidade"
        className="relatorio-modal-dialog flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-surface-soft shadow-2xl"
      >
        <div className="gs-no-print flex items-center justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
          <span className="font-semibold">Relatório de Não Conformidade</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="accent" size="sm" onClick={() => imprimirElemento()} data-testid="imprimir-rnc">
              <Printer className="h-4 w-4" />
              Imprimir
            </Button>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relatorio-modal-body flex-1 overflow-y-auto p-4 sm:p-6">
          <div id="relatorio-impressao">
            <div className="print-page mx-auto flex w-full max-w-4xl flex-col bg-white font-sans text-ink shadow-2xl print:max-w-[210mm]" data-testid="relatorio-rnc">
              <div className="cabecalho-relatorio w-full rounded-t-lg bg-surface-dark p-6 text-ondark">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Shield className="h-9 w-9 shrink-0 opacity-80" />
                    <div className="min-w-0">
                      <p className="text-lg font-black leading-tight tracking-wide">{RAZAO_SOCIAL}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-widest opacity-80">Sistema de Gestão de Qualidade — Registro de Não Conformidade</p>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-lg border border-ondark/20 bg-ondark/10 px-3 py-2 text-right">
                    <p className="text-[9px] uppercase tracking-widest opacity-80">Protocolo</p>
                    <p className="font-mono text-base font-black tracking-wider">{protocolo}</p>
                    <p className="mt-0.5 text-[10px] opacity-80">Emitido em {fmt(new Date().toISOString())}</p>
                  </div>
                </div>
                <h1 className="mt-4 border-t border-ondark/20 pt-3 text-lg font-extrabold leading-snug">RNC — Relatório de Não Conformidade</h1>
                <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ondark/20 bg-ondark/20 sm:grid-cols-3">
                  {[
                    ["Setor", rnc.setor.toUpperCase()],
                    ["Severidade", SEVERIDADE[rnc.severidade]],
                    ["Situação", STATUS[rnc.status]],
                    ["Aberta em", fmt(rnc.criado_em)],
                    ["Prazo limite", `${fmt(rnc.prazo_sla)}${atrasada ? " (vencido)" : ""}`],
                    ["Fechada em", fmt(rnc.fechado_em)],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="min-w-0 bg-surface-dark px-3 py-1.5">
                      <dt className="text-[9px] font-bold uppercase tracking-widest opacity-70">{rotulo}</dt>
                      <dd className="text-sm font-bold">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="space-y-4 p-6 print:space-y-3 print:p-4">
                <Secao titulo="1. Descrição da não conformidade">
                  <Texto valor={rnc.descricao} vazio="Sem descrição." />
                  <p className="mt-1 text-xs text-muted-foreground">Aberta por {nome(rnc.aberto_por, "Inspetor")}</p>
                </Secao>

                <Secao titulo="2. Monitoramento de origem">
                  {rnc.monitoramento_id === null ? (
                    <p className="italic text-muted-foreground">RNC avulsa — não está vinculada a um monitoramento.</p>
                  ) : origem ? (
                    <>
                      <p className="font-semibold">
                        {origem.fichaNome}
                        {origem.fichaCodigo && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold">{origem.fichaCodigo}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {origem.setor} · {quandoOrigem?.datePt} {quandoOrigem?.time} · {nome(origem.user_id, "Inspetor")} · ref. {origem.id.slice(0, 8).toUpperCase()}
                      </p>
                      {origem.naoConformidades.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                          {origem.naoConformidades.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="italic text-muted-foreground">Monitoramento {rnc.monitoramento_id.slice(0, 8).toUpperCase()} (sem acesso aos detalhes).</p>
                  )}
                </Secao>

                <Secao titulo="3. Ação imediata tomada pelo inspetor">
                  <Texto valor={rnc.acao_imediata} vazio="Não informada." />
                </Secao>

                <Secao titulo="4. Causa do desvio (Gestor de Setor)">
                  <Texto valor={rnc.causa_desvio} vazio="Ainda não respondida." />
                </Secao>

                <Secao titulo="5. Ação corretiva (Gestor de Setor)">
                  <Texto valor={rnc.tratativa} vazio="Ainda não respondida." />
                  {rnc.tratado_por && <p className="mt-1 text-xs text-muted-foreground">Respondida por {nome(rnc.tratado_por)}</p>}
                </Secao>

                {rnc.motivo_devolucao && rnc.status === "DEVOLVIDA" && (
                  <Secao titulo="Nota de devolução do Verificador">
                    <Texto valor={rnc.motivo_devolucao} vazio="" />
                  </Secao>
                )}

                {anexos && anexos.length > 0 && (
                  <Secao titulo="6. Evidências anexadas">
                    <ul className="list-disc space-y-0.5 pl-5 text-xs">
                      {anexos.map((a) => (
                        <li key={a.id}>
                          {a.nome} <span className="text-muted-foreground">({a.etapa === "ABERTURA" ? "inspetor" : "gestor"})</span>
                        </li>
                      ))}
                    </ul>
                  </Secao>
                )}

                <Secao titulo="Assinaturas e fechamento">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
                    <div className="rounded border border-hairline p-2 text-xs" style={{ breakInside: "avoid" }}>
                      <p className="font-bold uppercase tracking-wide">Gestor de Setor</p>
                      {rnc.assinatura_gestor_hash ? (
                        <>
                          <p>{nome(rnc.assinatura_gestor_por, "Gestor de Setor")}</p>
                          <p>Assinado eletronicamente em {fmt(rnc.assinatura_gestor_em)}</p>
                          <p className="break-all font-mono text-[10px]">SHA-256 {rnc.assinatura_gestor_hash.slice(0, 32)}…</p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Sem assinatura.</p>
                      )}
                    </div>
                    <div className="rounded border border-hairline p-2 text-xs" style={{ breakInside: "avoid" }}>
                      <p className="font-bold uppercase tracking-wide">Verificador</p>
                      {rnc.status === "FECHADA" && rnc.revisado_por ? (
                        <>
                          <p>{nome(rnc.revisado_por, "Verificador")}</p>
                          <p>Aprovou o fechamento em {fmt(rnc.fechado_em)}</p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Aguardando julgamento.</p>
                      )}
                    </div>
                  </div>
                </Secao>

                <p className="rodape-relatorio border-t border-hairline pt-1 text-[9px] text-muted-foreground">
                  Sistema GloboPac · Kaefer Agro Industrial LTDA. · SIF 1606 · {protocolo} · Id: <span className="font-mono">{rnc.id}</span>
                </p>
                <div className="doc-generated-by hidden pt-1 text-right text-[9px] uppercase text-muted-foreground print:block">Documento gerado pelo Sistema GloboPac.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
