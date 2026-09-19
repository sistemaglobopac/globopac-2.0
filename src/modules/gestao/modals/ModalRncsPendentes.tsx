import { useState } from "react";
import { ModalShell } from "../ModalShell";
import { DossieDetalhe } from "../DossieDetalhe";
import { type Rnc } from "@/modules/rnc/api";
import { type FichaSemRnc, useRncsPendentesDetalhado } from "../api";

const VARIANTE_STATUS: Record<Rnc["status"], { bg: string; cor: string }> = {
  ABERTA: { bg: "#dc26261a", cor: "#dc2626" },
  EM_TRATATIVA: { bg: "#dc26261a", cor: "#dc2626" },
  REABERTA: { bg: "#c58a1f1a", cor: "#c58a1f" },
  TRATADA: { bg: "#6a5fc11a", cor: "#6a5fc1" },
  FECHADA: { bg: "#e5e7eb", cor: "#374151" },
};

function CartaoRnc({ rnc, onAbrirDossie }: { rnc: Rnc; onAbrirDossie: (monitoramentoId: string) => void }) {
  const cor = VARIANTE_STATUS[rnc.status];
  const conteudo = (
    <div className="rounded-md p-3 text-left text-xs" style={{ background: "#f7f8fa", border: "1px solid #dfe2e7" }}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: cor.bg, color: cor.cor }}>
          {rnc.status}
        </span>
        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "#e5e7eb", color: "#374151" }}>
          {rnc.setor}
        </span>
        <span style={{ color: "#79628c" }}>{new Date(rnc.criado_em).toLocaleDateString("pt-BR")}</span>
      </div>
      <p style={{ color: "#1f1633" }}>{rnc.descricao}</p>
    </div>
  );

  if (!rnc.monitoramento_id) return <div>{conteudo}</div>;
  return (
    <button type="button" className="w-full hover:opacity-80" onClick={() => onAbrirDossie(rnc.monitoramento_id as string)}>
      {conteudo}
    </button>
  );
}

function CartaoFichaSemRnc({ ficha, onAbrirDossie }: { ficha: FichaSemRnc; onAbrirDossie: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrirDossie(ficha.id)}
      className="w-full rounded-md p-3 text-left text-xs hover:opacity-80"
      style={{ background: "#f7f8fa", border: "1px solid #dfe2e7" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: "#e5e7eb", color: "#374151" }}>
          {ficha.setor}
        </span>
        <span style={{ color: "#79628c" }}>{new Date(ficha.criado_em).toLocaleString("pt-BR")}</span>
      </div>
    </button>
  );
}

export function ModalRncsPendentes({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useRncsPendentesDetalhado();
  const [dossieId, setDossieId] = useState<string | null>(null);

  const total = (data?.emTratativa.length ?? 0) + (data?.pendenteVerificacao.length ?? 0) + (data?.fichasSemRnc.length ?? 0);

  return (
    <ModalShell titulo={`RNCs Pendentes (${total})`} onClose={onClose} largura="max-w-3xl">
      {dossieId ? (
        <DossieDetalhe monitoramentoId={dossieId} onVoltar={() => setDossieId(null)} />
      ) : (
        <div className="space-y-5">
          {isLoading && <p className="text-sm" style={{ color: "#79628c" }}>Carregando…</p>}

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
              Em Tratativa com Encarregados de Setor ({data?.emTratativa.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.emTratativa ?? []).map((rnc) => (
                <CartaoRnc key={rnc.id} rnc={rnc} onAbrirDossie={setDossieId} />
              ))}
              {data && data.emTratativa.length === 0 && <p className="text-xs" style={{ color: "#79628c" }}>Nenhuma.</p>}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
              Pendente de Verificação ({data?.pendenteVerificacao.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.pendenteVerificacao ?? []).map((rnc) => (
                <CartaoRnc key={rnc.id} rnc={rnc} onAbrirDossie={setDossieId} />
              ))}
              {data && data.pendenteVerificacao.length === 0 && <p className="text-xs" style={{ color: "#79628c" }}>Nenhuma.</p>}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
              Histórico de Fichas com Desvios — Pendentes de Encerramento ({data?.fichasSemRnc.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.fichasSemRnc ?? []).map((ficha) => (
                <CartaoFichaSemRnc key={ficha.id} ficha={ficha} onAbrirDossie={setDossieId} />
              ))}
              {data && data.fichasSemRnc.length === 0 && <p className="text-xs" style={{ color: "#79628c" }}>Nenhuma.</p>}
            </div>
          </section>
        </div>
      )}
    </ModalShell>
  );
}
