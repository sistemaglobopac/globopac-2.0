import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { avaliarCaixasVazias, caixasVaziasVazio, montarValorCaixasVazias } from "./caixasVazias";
import type { CaixasVaziasValor } from "./tiposCompostos";

interface CaixasVaziasFieldProps {
  value: CaixasVaziasValor | undefined | null;
  onChange: (valor: CaixasVaziasValor) => void;
  disabled?: boolean;
}

/** Checagem de que TODAS as caixas de transporte de aves estão vazias antes do tanque de imersão
 * (lavagem das caixas). "Não" torna o registro não conforme e exige quantidade + ação corretiva. */
export function CaixasVaziasField({ value, onChange, disabled }: CaixasVaziasFieldProps) {
  const [v, setV] = useState<CaixasVaziasValor>({ ...caixasVaziasVazio(), ...(value ?? {}) });
  const aval = avaliarCaixasVazias(v);

  useEffect(() => {
    onChange(montarValorCaixasVazias(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<CaixasVaziasValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  return (
    <div className="space-y-4 rounded-lg border p-4" data-testid="caixas-vazias">
      <div className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : v.todasVazias === true ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : v.todasVazias === true ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Antes do tanque de imersão</legend>
        <div className="space-y-1">
          <Label>Todas as caixas de transporte estão vazias?</Label>
          <div className="flex gap-2" role="radiogroup" aria-label="Todas as caixas vazias">
            {([
              [true, "Sim", "border-success bg-success/10 text-success"],
              [false, "Não", "border-destructive bg-destructive/10 text-destructive"],
            ] as const).map(([b, texto, classe]) => (
              <label key={texto} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${v.todasVazias === b ? classe : ""}`}>
                <input type="radio" name="caixas-vazias" checked={v.todasVazias === b} onChange={() => atualizar({ todasVazias: b })} />
                {texto}
              </label>
            ))}
          </div>
        </div>

        {v.todasVazias === false && (
          <div className="grid gap-4 sm:grid-cols-2" role="alert">
            <div className="space-y-1">
              <Label htmlFor="caixas-qtd" className="text-destructive">Quantidade de caixas não vazias</Label>
              <Input id="caixas-qtd" inputMode="numeric" value={v.caixasNaoVazias} onChange={(e) => atualizar({ caixasNaoVazias: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="caixas-acao" className="text-destructive">Ação corretiva (obrigatória)</Label>
              <Input id="caixas-acao" value={v.acaoCorretiva} placeholder="Ex.: caixas retiradas e esvaziadas antes da imersão" onChange={(e) => atualizar({ acaoCorretiva: e.target.value })} />
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
