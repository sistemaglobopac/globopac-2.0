import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  avaliarQualidadeMiudos,
  defeitoAcimaDoMaximo,
  formatarPct,
  lerContagem,
  montarValorQualidadeMiudos,
  motivosBloqueioQualidadeMiudos,
  PARTES_MIUDOS,
  percentualDefeito,
  qualidadeMiudosVazio,
} from "./qualidadeMiudos";
import type { ChaveParteMiudo, QualidadeMiudosValor } from "./tiposCompostos";

interface QualidadeMiudosFieldProps {
  value: QualidadeMiudosValor | undefined | null;
  onChange: (valor: QualidadeMiudosValor) => void;
  disabled?: boolean;
}

const apenasDigitos = (t: string) => t.replace(/\D/g, "");

/** Qualidade de Miúdos e Pertences: por parte (cabeça, pés, moela, fígado, coração) o inspetor informa a
 * quantidade avaliada e quantas unidades tiveram cada defeito; o percentual é calculado e comparado com
 * o máximo tolerado. */
export function QualidadeMiudosField({ value, onChange, disabled }: QualidadeMiudosFieldProps) {
  const [v, setV] = useState<QualidadeMiudosValor>(() => ({ ...qualidadeMiudosVazio(), ...(value ?? {}) }));
  const aval = avaliarQualidadeMiudos(v);
  const completo = motivosBloqueioQualidadeMiudos(v).length === 0;

  useEffect(() => {
    onChange(montarValorQualidadeMiudos(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function alterarAmostra(parte: ChaveParteMiudo, texto: string) {
    setV((a) => ({ ...a, partes: { ...a.partes, [parte]: { ...a.partes[parte], amostra: apenasDigitos(texto) } } }));
  }

  function alterarDefeito(parte: ChaveParteMiudo, defeito: string, texto: string) {
    setV((a) => ({ ...a, partes: { ...a.partes, [parte]: { ...a.partes[parte], defeitos: { ...a.partes[parte].defeitos, [defeito]: apenasDigitos(texto) } } } }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="qualidade-miudos">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        Informe a quantidade avaliada de cada parte e quantas unidades apresentaram cada defeito (0 se nenhuma). O percentual é calculado e comparado com o máximo tolerado; onde o máximo é 0%, qualquer ocorrência é não conformidade.
      </p>

      <fieldset className="space-y-4" disabled={disabled}>
        {PARTES_MIUDOS.map((p) => {
          const reg = v.partes?.[p.chave];
          const amostra = lerContagem(reg?.amostra);
          return (
            <div key={p.chave} className="space-y-2 rounded-md border bg-muted/20 p-3" data-testid={`parte-${p.chave}`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h4 className="text-sm font-black text-primary">{p.rotulo}</h4>
                <div className="space-y-1">
                  <Label htmlFor={`amostra-${p.chave}`}>Quantidade avaliada</Label>
                  <Input id={`amostra-${p.chave}`} className="w-32" inputMode="numeric" placeholder="100" value={reg?.amostra ?? ""} onChange={(e) => alterarAmostra(p.chave, e.target.value)} />
                </div>
              </div>
              {p.defeitos.map((d) => {
                const texto = reg?.defeitos?.[d.chave] ?? "";
                const defeitos = lerContagem(texto);
                const nc = defeitoAcimaDoMaximo(defeitos, amostra, d.maximoPct);
                return (
                  <div
                    key={d.chave}
                    className={`flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between ${nc ? "border-destructive" : ""}`}
                    data-testid={`defeito-${p.chave}-${d.chave}`}
                  >
                    <span className="text-sm font-medium">
                      {d.rotulo} <span className="text-xs text-muted-foreground">(máx. {d.maximoPct.toLocaleString("pt-BR")}%)</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <Input
                        aria-label={`${d.rotulo} — ${p.rotulo}: quantidade com defeito`}
                        className={`w-24 ${nc ? "border-destructive text-destructive" : ""}`}
                        inputMode="numeric"
                        placeholder="0"
                        value={texto}
                        onChange={(e) => alterarDefeito(p.chave, d.chave, e.target.value)}
                      />
                      <span className={`w-16 text-right text-sm font-black ${nc ? "text-destructive" : ""}`}>{formatarPct(percentualDefeito(defeitos, amostra))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="space-y-1 pt-1">
          <Label htmlFor="observacao-qualidade-miudos">Observações (opcional)</Label>
          <Textarea id="observacao-qualidade-miudos" rows={2} value={v.observacao ?? ""} onChange={(e) => setV((a) => ({ ...a, observacao: e.target.value }))} />
        </div>
      </fieldset>
    </div>
  );
}
