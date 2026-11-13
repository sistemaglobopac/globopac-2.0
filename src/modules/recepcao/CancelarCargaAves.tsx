import { useRef, useState } from "react";
import { Ban, Loader2, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useFocoPresoNoModal } from "@/shared/useFocoPresoNoModal";
import { useCancelarCarga, useCargasJaMonitoradas, type CargaAves } from "./api";

export const MOTIVO_CANCELAMENTO_MIN_CARACTERES = 5;

function rotuloCarga(c: CargaAves): string {
  return `GTA ${c.gta} — ${c.integrado} · Aviário ${c.aviario}${c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · ${c.qtd_aves.toLocaleString("pt-BR")} aves`;
}

interface CancelarCargaAvesProps {
  /** Cargas ativas do dia que podem ser canceladas (a recepção já monitorada é tirada daqui). */
  cargas: CargaAves[];
  /** Chamado depois de a carga ser cancelada, para o campo largar a carga se ela estava escolhida na ficha. */
  aoCancelar?: (cargaId: string) => void;
  disabled?: boolean;
}

/** Botão "Carga cancelada?" do monitoramento de Recepção de Aves e da Área de Espera: o inspetor escolhe a GTA que não vai mais
 * chegar e informa o motivo. A carga sai das listas de seleção e fica registrada (quem, quando e por quê) na conferência das cargas. */
export function CancelarCargaAves({ cargas, aoCancelar, disabled }: CancelarCargaAvesProps) {
  const [aberto, setAberto] = useState(false);
  const { data: comRecepcao } = useCargasJaMonitoradas("recepcao");
  const candidatas = cargas.filter((c) => !comRecepcao?.has(c.id));
  const [mensagem, setMensagem] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setMensagem(null);
          setAberto(true);
        }}
        data-testid="abrir-cancelar-carga"
      >
        <Ban className="mr-1 h-4 w-4" /> Carga cancelada?
      </Button>
      {mensagem && (
        <p role="status" className="text-xs font-semibold text-success" data-testid="carga-cancelada-aviso">
          {mensagem}
        </p>
      )}
      {aberto && (
        <ModalCancelarCarga
          cargas={candidatas}
          onFechar={() => setAberto(false)}
          onCancelada={(c) => {
            setAberto(false);
            setMensagem(`GTA ${c.gta} marcada como cancelada.`);
            aoCancelar?.(c.id);
          }}
        />
      )}
    </div>
  );
}

function ModalCancelarCarga({ cargas, onFechar, onCancelada }: { cargas: CargaAves[]; onFechar: () => void; onCancelada: (carga: CargaAves) => void }) {
  const [cargaId, setCargaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const cancelar = useCancelarCarga();
  const dialogoRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useFocoPresoNoModal(dialogoRef, selectRef);

  const motivoValido = motivo.trim().length >= MOTIVO_CANCELAMENTO_MIN_CARACTERES;
  const podeConfirmar = !!cargaId && motivoValido && !cancelar.isPending;

  async function confirmar() {
    if (!podeConfirmar) return;
    setErro(null);
    try {
      await cancelar.mutateAsync({ cargaId, motivo: motivo.trim() });
      const carga = cargas.find((c) => c.id === cargaId);
      if (carga) onCancelada(carga);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao cancelar a carga. Tente novamente.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="modal-cancelar-carga">
      <div
        ref={dialogoRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Carga cancelada"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-background shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <Ban className="h-5 w-5" /> Carga cancelada
          </span>
          <button type="button" onClick={onFechar} disabled={cancelar.isPending} aria-label="Fechar" className="disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Indique a carga que foi cancelada e não vai mais chegar. Ela sai das listas de monitoramento e fica registrada com o motivo, o seu nome e a hora.
          </p>
          {cargas.length === 0 ? (
            <p className="rounded-md bg-muted p-3 text-sm" data-testid="sem-cargas-para-cancelar">
              Não há carga disponível para cancelar nesta data (as que já tiveram a recepção monitorada não podem ser canceladas).
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="cancelar-carga-gta">Carga (GTA)</Label>
                <Select id="cancelar-carga-gta" ref={selectRef} value={cargaId} onChange={(e) => setCargaId(e.target.value)}>
                  <option value="">Selecione a GTA…</option>
                  {cargas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {rotuloCarga(c)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cancelar-carga-motivo">Motivo do cancelamento (obrigatório)</Label>
                <Textarea
                  id="cancelar-carga-motivo"
                  rows={3}
                  value={motivo}
                  placeholder="Ex.: carga cancelada pela integração / veículo não saiu do aviário"
                  onChange={(e) => setMotivo(e.target.value)}
                />
                {motivo.length > 0 && !motivoValido && <p className="text-xs text-destructive">Descreva o motivo (mínimo {MOTIVO_CANCELAMENTO_MIN_CARACTERES} caracteres).</p>}
              </div>
            </>
          )}
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={cancelar.isPending} onClick={onFechar}>
              Voltar
            </Button>
            {cargas.length > 0 && (
              <Button type="button" className="flex-1" disabled={!podeConfirmar} onClick={() => void confirmar()} data-testid="confirmar-cancelar-carga">
                {cancelar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {cancelar.isPending ? "Cancelando…" : "Marcar como cancelada"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
