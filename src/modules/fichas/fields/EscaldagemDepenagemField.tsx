import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  avaliarEscaldagem,
  defeitoAcimaDoMaximo,
  escaldagemVazio,
  formatarPct,
  GRUPOS_ESCALDAGEM,
  lerAvaliadas,
  lerContagem,
  montarValorEscaldagem,
  motivosBloqueioEscaldagem,
  PARAMETROS_ESCALDAGEM,
  percentualDefeito,
} from "./escaldagemDepenagem";
import type { EscaldagemDepenagemValor } from "./tiposCompostos";

interface EscaldagemDepenagemFieldProps {
  value: EscaldagemDepenagemValor | undefined | null;
  onChange: (valor: EscaldagemDepenagemValor) => void;
  disabled?: boolean;
}

const apenasDigitos = (t: string) => t.replace(/\D/g, "");
const apenasDecimal = (t: string) => t.replace(/[^0-9.,]/g, "");

/** Escaldagem/Depenagem — Controle: registra os parâmetros do processo e, sobre as aves avaliadas, quantas tiveram
 * cada defeito; devolve o percentual de cada um comparado com o máximo tolerado. */
export function EscaldagemDepenagemField({ value, onChange, disabled }: EscaldagemDepenagemFieldProps) {
  const [v, setV] = useState<EscaldagemDepenagemValor>(() => {
    const base = escaldagemVazio();
    return { ...base, ...(value ?? {}), defeitos: { ...base.defeitos, ...(value?.defeitos ?? {}) } };
  });
  const aval = avaliarEscaldagem(v);
  const completo = motivosBloqueioEscaldagem(v).length === 0;
  const avaliadas = lerAvaliadas(v);

  useEffect(() => {
    onChange(montarValorEscaldagem(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="escaldagem-depenagem">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Parâmetros do processo</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PARAMETROS_ESCALDAGEM.map((p) => (
            <div key={p.chave} className="space-y-1">
              <Label htmlFor={`escaldagem-${p.chave}`}>{p.rotulo}</Label>
              <Input
                id={`escaldagem-${p.chave}`}
                inputMode={p.decimal ? "decimal" : "numeric"}
                autoComplete="off"
                placeholder={p.placeholder}
                value={v[p.chave]}
                onChange={(e) => setV((a) => ({ ...a, [p.chave]: p.decimal ? apenasDecimal(e.target.value) : apenasDigitos(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Defeitos nas aves avaliadas</legend>
        <p className="text-xs text-muted-foreground">
          Informe quantas aves foram avaliadas e, para cada defeito, quantas aves o apresentaram (0 se nenhuma). O percentual é calculado e comparado com o máximo tolerado.
        </p>
        <div className="space-y-1 sm:w-56">
          <Label htmlFor="escaldagem-avaliadas">Quantidade de aves avaliadas</Label>
          <Input
            id="escaldagem-avaliadas"
            inputMode="numeric"
            autoComplete="off"
            placeholder="100"
            value={v.avesAvaliadas}
            onChange={(e) => setV((a) => ({ ...a, avesAvaliadas: apenasDigitos(e.target.value) }))}
          />
        </div>

        {GRUPOS_ESCALDAGEM.map((g) => (
          <div key={g.chave} className="space-y-2 rounded-md border bg-muted/20 p-3" data-testid={`grupo-${g.chave}`}>
            <h4 className="text-sm font-black text-primary">{g.rotulo}</h4>
            {g.defeitos.map((d) => {
              const texto = v.defeitos[d.chave] ?? "";
              const n = lerContagem(texto);
              const nc = defeitoAcimaDoMaximo(n, avaliadas, d.maximoPct);
              return (
                <div
                  key={d.chave}
                  className={`flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between ${nc ? "border-destructive" : ""}`}
                  data-testid={`defeito-${d.chave}`}
                >
                  <span className="text-sm font-medium">
                    {d.rotulo} <span className="text-xs text-muted-foreground">(máx. {d.maximoPct.toLocaleString("pt-BR")}%)</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <Input
                      aria-label={`${d.rotulo}: quantidade de aves`}
                      className={`w-24 ${nc ? "border-destructive text-destructive" : ""}`}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      value={texto}
                      onChange={(e) => setV((a) => ({ ...a, defeitos: { ...a.defeitos, [d.chave]: apenasDigitos(e.target.value) } }))}
                    />
                    <span className={`w-16 text-right text-sm font-black ${nc ? "text-destructive" : ""}`} data-testid={`pct-${d.chave}`}>
                      {formatarPct(percentualDefeito(n, avaliadas))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div className="space-y-1 pt-1">
          <Label htmlFor="observacao-escaldagem">Observações (opcional)</Label>
          <Textarea id="observacao-escaldagem" rows={2} value={v.observacao ?? ""} onChange={(e) => setV((a) => ({ ...a, observacao: e.target.value }))} />
        </div>
      </fieldset>
    </div>
  );
}
