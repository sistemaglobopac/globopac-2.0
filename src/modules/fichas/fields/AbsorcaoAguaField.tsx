import { useState } from "react";
import { Input } from "@/shared/ui/input";
import type { AbsorcaoAguaValor, AmostraAbsorcaoAgua } from "./tiposCompostos";

const LIMITE_PERCENTUAL = 8.0;

function amostrasIniciais(): AmostraAbsorcaoAgua[] {
  return Array.from({ length: 10 }, (_, i) => ({ id: i, seal: "", initial: "", final: "" }));
}

interface AbsorcaoAguaFieldProps {
  value: AbsorcaoAguaValor | undefined;
  onChange: (valor: AbsorcaoAguaValor) => void;
  disabled?: boolean;
}

/** Teste de Absorção de Água (Especial SIF) — porte do v1 (WaterAbsorptionField.jsx). 10
 * amostras de peso inicial/final; limite de 8% de ganho médio de peso. */
export function AbsorcaoAguaField({ value, onChange, disabled }: AbsorcaoAguaFieldProps) {
  const [items, setItems] = useState<AmostraAbsorcaoAgua[]>(value?.items ?? amostrasIniciais());

  function alterarItem(indice: number, campo: keyof AmostraAbsorcaoAgua, valor: string) {
    const novosItems = items.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item));
    setItems(novosItems);

    let somaInicial = 0;
    let somaFinal = 0;
    let validas = 0;
    for (const item of novosItems) {
      const inicial = parseFloat(item.initial);
      const final = parseFloat(item.final);
      if (!isNaN(inicial) && !isNaN(final) && inicial > 0) {
        somaInicial += inicial;
        somaFinal += final;
        validas++;
      }
    }

    const mediaPercentual = validas > 0 ? ((somaFinal - somaInicial) / somaInicial) * 100 : 0;
    const status: AbsorcaoAguaValor["status"] = validas > 0 && mediaPercentual > LIMITE_PERCENTUAL ? "nao-conforme" : "conforme";

    onChange({ items: novosItems, status, averagePercentage: mediaPercentual, validCount: validas, sumInitial: somaInicial, sumFinal: somaFinal });
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex gap-2 text-xs font-bold text-muted-foreground">
        <span className="w-8 text-center">#</span>
        <span className="flex-1">Lacre</span>
        <span className="flex-[1.2]">Peso Inicial (kg)</span>
        <span className="flex-[1.2]">Peso Final (kg)</span>
      </div>

      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="w-8 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
          <Input className="flex-1" value={item.seal} onChange={(e) => alterarItem(i, "seal", e.target.value)} disabled={disabled} placeholder="ABC" />
          <Input
            className="flex-[1.2] font-mono"
            type="number"
            step="0.001"
            value={item.initial}
            onChange={(e) => alterarItem(i, "initial", e.target.value)}
            disabled={disabled}
            placeholder="0.000"
          />
          <Input
            className="flex-[1.2] font-mono"
            type="number"
            step="0.001"
            value={item.final}
            onChange={(e) => alterarItem(i, "final", e.target.value)}
            disabled={disabled}
            placeholder="0.000"
          />
        </div>
      ))}

      {value && value.validCount > 0 && (
        <div
          className="mt-3 flex items-center justify-between rounded-md border p-3"
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
              {value.averagePercentage.toFixed(2)}%
            </p>
          </div>
          {value.status === "nao-conforme" && <p className="font-bold text-destructive">ACIMA DO LIMITE ({LIMITE_PERCENTUAL}%)</p>}
        </div>
      )}
    </div>
  );
}
