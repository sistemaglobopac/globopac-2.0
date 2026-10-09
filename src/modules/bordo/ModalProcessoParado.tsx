import { useState, type FormEvent } from "react";
import { PauseCircle, X } from "lucide-react";
import { useDesviosCadastrados } from "@/modules/gestao/api";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  MOTIVOS_PARADA_FALLBACK,
  proximaCobrancaAposParada,
  referenciaDoProcessoParado,
  setorDaFicha,
  useRegistrarProcessoParado,
  type FichaAtrasada,
} from "./api";

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" });

interface ModalProcessoParadoProps {
  atrasada: FichaAtrasada;
  userSetores: string[];
  onFechar: () => void;
  onRegistrado?: () => void;
}

/** Justificativa de "processo parado": o monitoramento em atraso não foi feito porque o processo está parado.
 * Ao registrar, o período em atraso é dispensado e a ficha só volta a ser cobrada no período seguinte. */
export function ModalProcessoParado({ atrasada, userSetores, onFechar, onRegistrado }: ModalProcessoParadoProps) {
  const { data: desvios } = useDesviosCadastrados();
  const registrar = useRegistrarProcessoParado();
  const motivos = (desvios ?? []).length > 0 ? (desvios ?? []).map((d) => d.nome) : MOTIVOS_PARADA_FALLBACK;
  const [motivo, setMotivo] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const intervalo = atrasada.ficha.tempo_entre_apontamentos_min ?? 0;
  const agora = new Date();
  const referencia = atrasada.devidoEm && intervalo > 0 ? referenciaDoProcessoParado(new Date(atrasada.devidoEm), intervalo, agora) : null;
  const voltaEm = referencia ? proximaCobrancaAposParada(referencia, intervalo) : null;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    const motivoFinal = motivo === "OUTRO" ? motivoOutro.trim() : motivo;
    if (!motivoFinal) {
      setErro("Informe por que o monitoramento não foi realizado.");
      return;
    }
    if (!atrasada.devidoEm || intervalo <= 0) {
      setErro("Esta ficha não tem período de cobrança definido.");
      return;
    }
    try {
      await registrar.mutateAsync({
        fichaCodigo: atrasada.ficha.codigo,
        setor: setorDaFicha(atrasada.ficha, userSetores) || null,
        referenciaEm: referenciaDoProcessoParado(new Date(atrasada.devidoEm), intervalo, new Date()),
        motivo: motivoFinal,
        detalhes: detalhes.trim() || null,
      });
      onRegistrado?.();
      onFechar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Falha ao registrar o processo parado.");
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" data-testid="modal-processo-parado">
      <div role="dialog" aria-modal="true" aria-label="Processo parado" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <PauseCircle className="h-5 w-5" /> Processo parado
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={confirmar} className="space-y-4 p-4">
          <div>
            <p className="text-sm font-bold">{atrasada.ficha.nome}</p>
            <p className="text-xs text-muted-foreground">
              {atrasada.ficha.codigo} · {atrasada.motivo}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Use quando este monitoramento não pôde ser feito porque o processo está parado. A justificativa fica registrada
            {voltaEm ? <> e o sistema só volta a cobrar este monitoramento às <strong>{hora(voltaEm)}</strong> (próximo período).</> : "."}
          </p>

          <div className="space-y-2">
            <Label htmlFor="motivo-processo-parado">Por que o processo está parado?</Label>
            <Select id="motivo-processo-parado" required value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione…</option>
              {motivos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="OUTRO">Outro (descrever)</option>
            </Select>
            {motivo === "OUTRO" && <Input aria-label="Outro motivo" required placeholder="Descreva o motivo" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} />}
          </div>

          <div className="space-y-2">
            <Label htmlFor="detalhes-processo-parado">Detalhes (opcional)</Label>
            <Textarea id="detalhes-processo-parado" rows={2} value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
          </div>

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={registrar.isPending}>
              {registrar.isPending ? "Registrando…" : "Registrar processo parado"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
