import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Waves } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { LIMITE_AGUA_C } from "./temperaturaResfriamento";
import {
  avaliarControleAbsorcao,
  BORBULHAMENTO,
  controleAbsorcaoVazio,
  lerTemperatura,
  montarValorControleAbsorcao,
  motivosBloqueioControleAbsorcao,
  TANQUES_ABSORCAO,
  temperaturaAbsorcaoAcimaDoLimite,
} from "./controleAbsorcao";
import type { ChaveTanqueAbsorcao, ControleAbsorcaoValor } from "./tiposCompostos";

interface ControleAbsorcaoFieldProps {
  value: ControleAbsorcaoValor | undefined | null;
  onChange: (valor: ControleAbsorcaoValor) => void;
  disabled?: boolean;
}

const apenasMedida = (t: string) => t.replace(/[^0-9.,]/g, "");
/** Temperatura da água pode ser negativa. */
const apenasTemperatura = (t: string) => t.replace(/[^0-9.,-]/g, "");

/** Controle de Absorção: tempo de permanência das carcaças no pré-chiller, temperatura da água e
 * borbulhamento (moderado ou intenso) do pré-chiller, do chiller 1 e do chiller 2. */
export function ControleAbsorcaoField({ value, onChange, disabled }: ControleAbsorcaoFieldProps) {
  const [v, setV] = useState<ControleAbsorcaoValor>(() => ({ ...controleAbsorcaoVazio(), ...(value ?? {}) }));
  const aval = avaliarControleAbsorcao(v);
  const completo = motivosBloqueioControleAbsorcao(v).length === 0;

  useEffect(() => {
    onChange(montarValorControleAbsorcao(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function alterarTemperatura(tanque: ChaveTanqueAbsorcao, texto: string) {
    setV((a) => ({ ...a, temperaturas: { ...a.temperaturas, [tanque]: apenasTemperatura(texto) } }));
  }

  function alterarBorbulhamento(tanque: ChaveTanqueAbsorcao, valor: string) {
    setV((a) => ({ ...a, borbulhamento: { ...a.borbulhamento, [tanque]: valor } }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="controle-absorcao">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <Waves className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <div className="space-y-1 rounded-md border p-3">
          <Label htmlFor="tempo-permanencia-pre-chiller">Tempo de permanência das carcaças no pré-chiller (min)</Label>
          <Input
            id="tempo-permanencia-pre-chiller"
            className="w-40"
            inputMode="decimal"
            placeholder="15"
            value={v.tempoPermanenciaMin}
            onChange={(e) => setV((a) => ({ ...a, tempoPermanenciaMin: apenasMedida(e.target.value) }))}
          />
        </div>

        {TANQUES_ABSORCAO.map((t) => {
          const temp = v.temperaturas?.[t.chave] ?? "";
          const nc = temperaturaAbsorcaoAcimaDoLimite(t.chave, lerTemperatura(temp));
          const limite = LIMITE_AGUA_C[t.chave];
          return (
            <div key={t.chave} className="space-y-3 rounded-md border p-3" data-testid={`absorcao-${t.chave}`}>
              <strong className="text-sm">{t.rotulo}</strong>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`temp-absorcao-${t.chave}`}>
                    Temperatura da água (ºC){limite !== null && <span className="text-xs text-muted-foreground"> — máx. {limite.toLocaleString("pt-BR")} ºC</span>}
                  </Label>
                  <Input
                    id={`temp-absorcao-${t.chave}`}
                    inputMode="decimal"
                    placeholder="4,0"
                    value={temp}
                    className={nc ? "border-destructive text-destructive" : ""}
                    onChange={(e) => alterarTemperatura(t.chave, e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium">Borbulhamento</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Borbulhamento — ${t.rotulo}`}>
                    {BORBULHAMENTO.map((b) => (
                      <label
                        key={b.valor}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${v.borbulhamento?.[t.chave] === b.valor ? "border-success bg-success/10 text-success" : ""}`}
                      >
                        <input type="radio" name={`borbulhamento-${t.chave}`} checked={v.borbulhamento?.[t.chave] === b.valor} onChange={() => alterarBorbulhamento(t.chave, b.valor)} />
                        {b.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="space-y-1 pt-1">
          <Label htmlFor="observacao-controle-absorcao">Observações (opcional)</Label>
          <Textarea id="observacao-controle-absorcao" rows={2} value={v.observacao ?? ""} onChange={(e) => setV((a) => ({ ...a, observacao: e.target.value }))} />
        </div>
      </fieldset>
    </div>
  );
}
