import { useEffect, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { CHAVE_OUTRAS, MEDIDAS_CORRETIVAS, montarValorPragas, PRAGAS, pragasVazias } from "./pragas";
import type { OcorrenciaPragasValor } from "./tiposCompostos";

interface OcorrenciaPragasFieldProps {
  value: OcorrenciaPragasValor | undefined;
  onChange: (valor: OcorrenciaPragasValor) => void;
  disabled?: boolean;
}

/** Monitoramento Diário de Ocorrência de Pragas. Todos os dias o inspetor confirma o setor:
 * nada marcado = ausência de pragas (registro diário obrigatório, assinado mesmo assim); com
 * praga marcada, é obrigatório confirmar as ações corretivas antes de assinar. */
export function OcorrenciaPragasField({ value, onChange, disabled }: OcorrenciaPragasFieldProps) {
  const [pragas, setPragas] = useState<Record<string, boolean>>({ ...pragasVazias(), ...(value?.pragas ?? {}) });
  const [outrasPragas, setOutrasPragas] = useState(value?.outrasPragas ?? "");
  const [acoesCorretivas, setAcoesCorretivas] = useState(value?.acoesCorretivas ?? false);

  const valor = montarValorPragas(pragas, outrasPragas, acoesCorretivas);

  useEffect(() => {
    onChange(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pragas, outrasPragas, acoesCorretivas]);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-4">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Ocorrência de Pragas — hoje</p>
          <p className={`mt-1 flex items-center gap-2 text-lg font-black ${valor.houvePraga ? "text-destructive" : "text-success"}`}>
            {valor.houvePraga ? (
              <>
                <AlertTriangle className="h-5 w-5" /> PRAGA(S) IDENTIFICADA(S)
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" /> AUSÊNCIA DE PRAGAS
              </>
            )}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Marque apenas as pragas encontradas hoje neste setor. Sem nenhuma marcação, o registro é de ausência de pragas.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PRAGAS.map((praga) => (
          <label
            key={praga.chave}
            className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${
              pragas[praga.chave] ? "border-destructive bg-destructive/10 font-semibold text-destructive" : "bg-background"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4"
              disabled={disabled}
              checked={pragas[praga.chave] === true}
              onChange={(e) => setPragas((atual) => ({ ...atual, [praga.chave]: e.target.checked }))}
            />
            <Bug className="h-4 w-4 shrink-0" />
            {praga.rotulo}
          </label>
        ))}
      </div>

      {pragas[CHAVE_OUTRAS] && (
        <div className="space-y-1">
          <label htmlFor="outras-pragas" className="text-xs text-muted-foreground">
            Qual praga? (obrigatório)
          </label>
          <Input id="outras-pragas" disabled={disabled} value={outrasPragas} onChange={(e) => setOutrasPragas(e.target.value)} placeholder="Ex: Lagarta-rosca" />
        </div>
      )}

      {valor.houvePraga && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border-2 border-destructive bg-destructive/5 p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" disabled={disabled} checked={acoesCorretivas} onChange={(e) => setAcoesCorretivas(e.target.checked)} />
          <span>
            <strong className="block text-destructive">Ações corretivas executadas (obrigatório)</strong>
            {MEDIDAS_CORRETIVAS}
          </span>
        </label>
      )}
    </div>
  );
}
