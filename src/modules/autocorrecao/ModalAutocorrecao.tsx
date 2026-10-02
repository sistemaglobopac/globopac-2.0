import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useSessionStore } from "@/store/session";
import { AUTOCORRECAO_MIN_CARACTERES, descricaoAutocorrecaoValida, useRegistrarAutocorrecao } from "./api";

interface ModalAutocorrecaoProps {
  monitoramentoId: string;
  /** Nome da ficha, para o inspetor saber de qual monitoramento está falando. */
  fichaNome?: string;
  onFechar: () => void;
  onRegistrada?: () => void;
}

/** Registro da autocorreção imediata: o inspetor descreve a ação imediata que executou. Alternativa à
 * RNC — a ação restabelece a conformidade do monitoramento (o verificador ainda decide a verificação). */
export function ModalAutocorrecao({ monitoramentoId, fichaNome, onFechar, onRegistrada }: ModalAutocorrecaoProps) {
  const perfil = useSessionStore((s) => s.perfil);
  const registrar = useRegistrarAutocorrecao();
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const valida = descricaoAutocorrecaoValida(descricao);

  async function confirmar() {
    if (!perfil || !valida) return;
    setErro(null);
    try {
      await registrar.mutateAsync({ monitoramentoId, userId: perfil.id, descricao });
      onRegistrada?.();
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao registrar a autocorreção.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="modal-autocorrecao">
      <div role="dialog" aria-modal="true" aria-label="Autocorreção imediata" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5" />
            Autocorreção imediata
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar" disabled={registrar.isPending}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {fichaNome && <p className="text-sm font-medium">{fichaNome}</p>}
          <p className="text-sm text-muted-foreground">
            Alternativa à RNC. Descreva a <strong>ação imediata</strong> que você executou como medida de autocontrole: ela restabelece a conformidade deste
            monitoramento. O registro não pode ser editado depois.
          </p>
          <div className="space-y-1">
            <Label htmlFor="autocorrecao-descricao">Ação imediata executada</Label>
            <Textarea
              id="autocorrecao-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Ajustada a voltagem do equipamento e reinspecionadas as aves do lote."
              rows={4}
              autoFocus
            />
            <p className={`text-xs ${valida ? "text-muted-foreground" : "text-destructive"}`}>
              {valida ? "Pronto para registrar." : `Descreva com pelo menos ${AUTOCORRECAO_MIN_CARACTERES} caracteres.`}
            </p>
          </div>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar} disabled={registrar.isPending}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={() => void confirmar()} disabled={!valida || registrar.isPending}>
              {registrar.isPending ? "Registrando…" : "Registrar autocorreção"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
