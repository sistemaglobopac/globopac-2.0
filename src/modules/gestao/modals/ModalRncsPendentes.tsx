import { useState } from "react";
import { ModalShell } from "../ModalShell";
import { DossieDetalhe } from "../DossieDetalhe";
import { type Rnc } from "@/modules/rnc/api";
import { type FichaSemRnc, useRncsPendentesDetalhado } from "../api";

// Mesmo mapeamento de status de RNC usado no Painel de Bordo (ver ESTILO_STATUS em
// src/modules/bordo/PainelBordo.tsx) — cores semânticas do design system, não hex por status.
const VARIANTE_STATUS: Record<Rnc["status"], string> = {
  ABERTA: "bg-warning/10 text-warning",
  EM_TRATATIVA: "bg-warning/10 text-warning",
  REABERTA: "bg-destructive/10 text-destructive",
  DEVOLVIDA: "bg-destructive/10 text-destructive",
  TRATADA: "bg-primary/10 text-primary",
  FECHADA: "bg-secondary text-secondary-foreground",
};

function CartaoRnc({ rnc, onAbrirDossie }: { rnc: Rnc; onAbrirDossie: (monitoramentoId: string) => void }) {
  const variante = VARIANTE_STATUS[rnc.status];
  const conteudo = (
    <div className="rounded-md border border-hairline bg-surface-soft p-3 text-left text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 font-bold ${variante}`}>{rnc.status}</span>
        <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-secondary-foreground">{rnc.setor}</span>
        <span className="text-muted-foreground">{new Date(rnc.criado_em).toLocaleDateString("pt-BR")}</span>
      </div>
      <p className="text-ink">{rnc.descricao}</p>
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
      className="w-full rounded-md border border-hairline bg-surface-soft p-3 text-left text-xs hover:opacity-80"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-secondary-foreground">{ficha.setor}</span>
        <span className="text-muted-foreground">{new Date(ficha.criado_em).toLocaleString("pt-BR")}</span>
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
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Em Tratativa com Encarregados de Setor ({data?.emTratativa.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.emTratativa ?? []).map((rnc) => (
                <CartaoRnc key={rnc.id} rnc={rnc} onAbrirDossie={setDossieId} />
              ))}
              {data && data.emTratativa.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma.</p>}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pendente de Verificação ({data?.pendenteVerificacao.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.pendenteVerificacao ?? []).map((rnc) => (
                <CartaoRnc key={rnc.id} rnc={rnc} onAbrirDossie={setDossieId} />
              ))}
              {data && data.pendenteVerificacao.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma.</p>}
            </div>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Histórico de Fichas com Desvios — Pendentes de Encerramento ({data?.fichasSemRnc.length ?? 0})
            </h4>
            <div className="space-y-2">
              {(data?.fichasSemRnc ?? []).map((ficha) => (
                <CartaoFichaSemRnc key={ficha.id} ficha={ficha} onAbrirDossie={setDossieId} />
              ))}
              {data && data.fichasSemRnc.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma.</p>}
            </div>
          </section>
        </div>
      )}
    </ModalShell>
  );
}
