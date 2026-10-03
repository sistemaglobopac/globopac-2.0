import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Thermometer } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import {
  avaliarTemperaturas,
  LIMITE_AGUA_C,
  LIMITE_AMBIENTE_C,
  LIMITE_PRODUTO_C,
  lerTemperatura,
  montarValorTemperatura,
  motivosBloqueioTemperatura,
  PONTOS_AGUA,
  PONTOS_AMBIENTE,
  PRODUTOS,
  temperaturaVazia,
  TIPOS_PARTE,
} from "./temperaturaResfriamento";
import type { ChaveAguaResfriamento, ChaveAmbienteResfriamento, ChaveProdutoResfriamento, TemperaturaResfriamentoValor } from "./tiposCompostos";

interface TemperaturaResfriamentoFieldProps {
  value: TemperaturaResfriamentoValor | undefined | null;
  onChange: (valor: TemperaturaResfriamentoValor) => void;
  disabled?: boolean;
}

/** Só dígitos, vírgula/ponto e sinal de menos (temperatura pode ser negativa). */
const apenasTemperatura = (t: string) => t.replace(/[^0-9.,-]/g, "");

/** Temperaturas dos Sistemas de Pré-resfriamento: água de cada tanque (10 pontos) e duas amostras de
 * cada produto na saída (carcaça, parte, fígado, moela, cabeça, coração, pé). A conformidade sai
 * dos limites máximos configurados em temperaturaResfriamento.ts. */
export function TemperaturaResfriamentoField({ value, onChange, disabled }: TemperaturaResfriamentoFieldProps) {
  const [v, setV] = useState<TemperaturaResfriamentoValor>(() => ({ ...temperaturaVazia(), ...(value ?? {}) }));
  const aval = avaliarTemperaturas(v);
  const completo = motivosBloqueioTemperatura(v).length === 0;

  useEffect(() => {
    onChange(montarValorTemperatura(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function alterarAgua(chave: ChaveAguaResfriamento, texto: string) {
    setV((a) => ({ ...a, agua: { ...a.agua, [chave]: apenasTemperatura(texto) } }));
  }
  function alterarAmbiente(chave: ChaveAmbienteResfriamento, texto: string) {
    setV((a) => ({ ...a, ambiente: { ...a.ambiente, [chave]: apenasTemperatura(texto) } }));
  }
  function alterarAmostra(chave: ChaveProdutoResfriamento, n: "amostra1" | "amostra2", texto: string) {
    setV((a) => ({ ...a, produtos: { ...a.produtos, [chave]: { ...a.produtos[chave], [n]: apenasTemperatura(texto) } } }));
  }

  const acima = (texto: string, limite: number | null) => {
    const t = lerTemperatura(texto);
    return limite !== null && t !== null && t > limite;
  };

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="temperatura-resfriamento">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <Thermometer className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Temperaturas da água dos sistemas de pré-resfriamento</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PONTOS_AGUA.map((p) => {
            const limite = LIMITE_AGUA_C[p.chave];
            const nc = acima(v.agua[p.chave], limite);
            return (
              <div key={p.chave} className="space-y-1">
                <Label htmlFor={`temp-agua-${p.chave}`}>{p.rotulo}</Label>
                <Input
                  id={`temp-agua-${p.chave}`}
                  inputMode="decimal"
                  placeholder="0,0"
                  value={v.agua[p.chave]}
                  className={nc ? "border-destructive text-destructive" : ""}
                  onChange={(e) => alterarAgua(p.chave, e.target.value)}
                />
                {limite !== null && <p className={`text-[10px] ${nc ? "font-bold text-destructive" : "text-muted-foreground"}`}>Limite: {limite.toLocaleString("pt-BR")} ºC</p>}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Temperatura ambiente das salas de pré-resfriamento</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PONTOS_AMBIENTE.map((p) => {
            const limite = LIMITE_AMBIENTE_C[p.chave];
            const nc = acima(v.ambiente?.[p.chave] ?? "", limite);
            return (
              <div key={p.chave} className="space-y-1">
                <Label htmlFor={`temp-ambiente-${p.chave}`}>{p.rotulo} (ºC)</Label>
                <Input
                  id={`temp-ambiente-${p.chave}`}
                  inputMode="decimal"
                  placeholder="0,0"
                  value={v.ambiente?.[p.chave] ?? ""}
                  className={nc ? "border-destructive text-destructive" : ""}
                  onChange={(e) => alterarAmbiente(p.chave, e.target.value)}
                />
                {limite !== null && <p className={`text-[10px] ${nc ? "font-bold text-destructive" : "text-muted-foreground"}`}>Limite: {limite.toLocaleString("pt-BR")} ºC</p>}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Temperatura dos produtos na saída dos sistemas (2 amostras)</legend>
        {PRODUTOS.map((p) => {
          const limite = LIMITE_PRODUTO_C[p.chave];
          return (
            <div key={p.chave} className="space-y-2 rounded-md border p-3" data-testid={`produto-${p.chave}`}>
              <div className="flex flex-wrap items-center gap-3">
                <strong className="text-sm">{p.rotulo}</strong>
                {p.chave === "parte" && (
                  <div className="min-w-[12rem]">
                    <Select aria-label="Qual parte foi aferida" value={v.tipoParte} onChange={(e) => setV((a) => ({ ...a, tipoParte: e.target.value }))}>
                      <option value="">Selecione a parte…</option>
                      {TIPOS_PARTE.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {limite !== null && <span className="text-[10px] text-muted-foreground">Limite: {limite.toLocaleString("pt-BR")} ºC</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["amostra1", "amostra2"] as const).map((n, i) => {
                  const nc = acima(v.produtos[p.chave][n], limite);
                  return (
                    <div key={n} className="space-y-1">
                      <Label htmlFor={`temp-${p.chave}-${n}`}>
                        {p.amostra} 0{i + 1} (ºC)
                      </Label>
                      <Input
                        id={`temp-${p.chave}-${n}`}
                        inputMode="decimal"
                        placeholder="0,0"
                        value={v.produtos[p.chave][n]}
                        className={nc ? "border-destructive text-destructive" : ""}
                        onChange={(e) => alterarAmostra(p.chave, n, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
