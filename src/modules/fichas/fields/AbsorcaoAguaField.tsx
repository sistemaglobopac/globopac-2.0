import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { amostrasAbsorcaoIniciais, calcularAbsorcaoAgua, formatarPercentual, LIMITE_ABSORCAO_AGUA } from "./calculosAbsorcao";
import type { AbsorcaoAguaValor, AmostraAbsorcaoAgua, FaseAbsorcao } from "./tiposCompostos";

interface AbsorcaoAguaFieldProps {
  value: AbsorcaoAguaValor | undefined;
  onChange: (valor: AbsorcaoAguaValor) => void;
  disabled?: boolean;
  /** Registro de duas fases: INICIAL = só lacre + peso inicial (o final entra depois); FINAL =
   * lacres e pesos iniciais TRAVADOS (somente leitura), só o peso final (ou o descarte) é editável.
   * Sem `fase`, o teste é preenchido de uma vez, como sempre foi. */
  fase?: FaseAbsorcao | "UMA_VEZ";
}

/** Teste de Absorção de Água (pré-resfriamento): 10 carcaças, limite de 8%. A média é por SOMA
 * (ganho do peso TOTAL), não a média dos percentuais de cada carcaça — ver calculosAbsorcao.ts.
 * Independente de qualquer outro monitoramento: nada é herdado nem travado (exceto, na fase FINAL,
 * o que foi gravado na pesagem inicial). */
export function AbsorcaoAguaField({ value, onChange, disabled, fase = "UMA_VEZ" }: AbsorcaoAguaFieldProps) {
  const [items, setItems] = useState<AmostraAbsorcaoAgua[]>(value?.items ?? amostrasAbsorcaoIniciais());
  const faseGravada = fase === "UMA_VEZ" ? undefined : fase;

  // Modo edição: o estado interno acompanha o valor vindo do pai.
  useEffect(() => {
    if (value?.items && JSON.stringify(value.items) !== JSON.stringify(items)) setItems(value.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emitir(novosItems: AmostraAbsorcaoAgua[]) {
    setItems(novosItems);
    onChange({ items: novosItems, ...(faseGravada ? { fase: faseGravada } : {}), ...calcularAbsorcaoAgua(novosItems) });
  }

  function alterarItem(indice: number, campo: keyof AmostraAbsorcaoAgua, valor: string | boolean) {
    emitir(items.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  // Fase 1: emite o estado inicial uma vez (o pai precisa do objeto mesmo sem digitar nada).
  const travaInicial = fase === "FINAL";
  const mostraFinal = fase !== "INICIAL";

  return (
    <div className="space-y-2 rounded-lg border p-4">
      {travaInicial && (
        <p className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
          Lacres e pesos iniciais foram gravados na pesagem inicial e não podem ser alterados. Informe o peso final de cada lacre (ou marque a carcaça como descartada).
        </p>
      )}
      <div className="flex gap-2 text-xs font-bold text-muted-foreground">
        <span className="w-8 text-center">#</span>
        <span className="flex-1">Lacre</span>
        <span className="flex-[1.2]">Peso Inicial (kg)</span>
        {mostraFinal && <span className="flex-[1.2]">Peso Final (kg)</span>}
        {travaInicial && <span className="w-24 text-center">Descartada</span>}
      </div>

      {items.map((item, i) => {
        const linhaTravada = travaInicial && item.seal.trim() === "" && item.initial.trim() === "";
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <Input
                className="flex-1"
                value={item.seal}
                onChange={(e) => alterarItem(i, "seal", e.target.value)}
                disabled={disabled || travaInicial}
                readOnly={travaInicial}
                placeholder="ABC"
              />
              <Input
                className="flex-[1.2] font-mono"
                type="number" inputMode="decimal"
                step="0.001"
                value={item.initial}
                onChange={(e) => alterarItem(i, "initial", e.target.value)}
                disabled={disabled || travaInicial}
                readOnly={travaInicial}
                placeholder="0.000"
              />
              {mostraFinal && (
                <Input
                  className="flex-[1.2] font-mono"
                  type="number" inputMode="decimal"
                  step="0.001"
                  value={item.final}
                  onChange={(e) => alterarItem(i, "final", e.target.value)}
                  disabled={disabled || linhaTravada || Boolean(item.descartada)}
                  placeholder="0.000"
                />
              )}
              {travaInicial && (
                <span className="flex w-24 justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Carcaça ${i + 1} descartada`}
                    checked={Boolean(item.descartada)}
                    disabled={disabled || linhaTravada}
                    onChange={(e) => alterarItem(i, "descartada", e.target.checked)}
                  />
                </span>
              )}
            </div>
            {travaInicial && item.descartada && (
              <Input
                className="ml-10 w-[calc(100%-2.5rem)]"
                value={item.motivoDescarte ?? ""}
                onChange={(e) => alterarItem(i, "motivoDescarte", e.target.value)}
                disabled={disabled}
                placeholder="Motivo do descarte (obrigatório)"
              />
            )}
          </div>
        );
      })}

      {value && value.validCount > 0 && mostraFinal && (
        <div
          className="mt-3 flex flex-wrap gap-2 items-center justify-between rounded-md border p-3"
          style={{
            background: value.status === "nao-conforme" ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)",
            borderColor: value.status === "nao-conforme" ? "#dc2626" : "#059669",
          }}
        >
          <div>
            <p className="text-xs font-bold" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
              MÉDIA DE ABSORÇÃO C/ {value.validCount} AMOS. VÁLIDAS
            </p>
            <p className="text-2xl font-black" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
              {formatarPercentual(value.averagePercentage)}
            </p>
          </div>
          {value.status === "nao-conforme" && <p className="font-bold text-destructive">⚠️ ACIMA DO LIMITE ({LIMITE_ABSORCAO_AGUA}%)</p>}
        </div>
      )}
    </div>
  );
}
