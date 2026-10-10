// Peças de UI repetidas nos 4 monitoramentos de água (SPR Carcaças, Partes, Miúdos e Chuveiro):
// aviso de 1º monitoramento do dia, alerta de valor implausível e campo bloqueado (herdado do
// SPR Carcaças). Ficam aqui para os textos serem idênticos nos quatro.
import { useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Info, Lock } from "lucide-react";
import { Label } from "@/shared/ui/label";

export const TOOLTIP_HIDR_ANTERIOR = "Herdado do monitoramento anterior — não pode ser alterado";

export const TEXTO_PRIMEIRO_DO_DIA =
  "Primeiro monitoramento do dia: informe apenas a leitura atual de cada hidrômetro. Cargas/volume processado e apuração de vazão começam a partir do próximo monitoramento.";

/** Aviso roxo/informativo do 1º monitoramento do dia. */
export function AvisoPrimeiroDoDia() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-violet-300 bg-violet-50 p-3 text-sm text-violet-900">
      <Info className="h-4 w-4 shrink-0 text-violet-600" />
      <span>{TEXTO_PRIMEIRO_DO_DIA}</span>
    </div>
  );
}

/** Alerta âmbar (não bloqueia): apurado acima de 10× a meta — provável erro de leitura. */
export function AvisoImplausivel({ apurado, meta }: { apurado: number; meta: number }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-xs font-medium text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <span>
        Valor {(apurado / meta).toFixed(0)}x acima da meta — confira a leitura do hidrômetro (casas decimais/rolete de fração) antes de assinar.
      </span>
    </div>
  );
}

/** Valor herdado do SPR Carcaças: somente leitura, com cadeado, rotulado "(SPR Carcaças)". */
export function CampoBloqueado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-[140px] flex-1">
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo} (SPR Carcaças) <Lock className="h-3 w-3" />
      </Label>
      <p className="py-1 text-lg font-black" aria-readonly="true">
        {valor}
      </p>
    </div>
  );
}

/** "Ver lógica de cálculo": recolhida na tela, sempre visível no relatório impresso (print:block).
 * Mesma peça nos 4 monitoramentos de água; cada um passa só os seus itens. */
export function LogicaCalculo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="rounded-md border border-hairline bg-muted/30">
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        className="gs-no-print flex w-full items-center justify-between px-4 py-2 text-left text-sm font-bold text-primary"
      >
        Ver lógica de cálculo
        <ChevronDown className={`h-4 w-4 transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      <div className={`${aberta ? "block" : "hidden"} space-y-1 px-4 pb-3 text-xs text-muted-foreground print:block print:pt-2`}>
        <p className="hidden text-sm font-bold text-primary print:block">Lógica de cálculo — {titulo}</p>
        <ul className="list-disc space-y-1 pl-5">{children}</ul>
      </div>
    </div>
  );
}

/** Caixa "Sem produção" no cabeçalho colorido do tanque: o tanque não processou nada no período, então não há leitura de
 * hidrômetro nem vazão a informar (ver tanqueSemProducao.ts). */
export function ChaveSemProducao({ marcado, onChange, disabled, testId }: { marcado: boolean; onChange: (marcado: boolean) => void; disabled?: boolean; testId: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold">
      <input type="checkbox" className="h-4 w-4" checked={marcado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      Sem produção
    </label>
  );
}

/** No lugar dos campos do tanque marcado como sem produção. */
export function AvisoSemProducao() {
  return (
    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground" data-testid="aviso-sem-producao">
      Tanque sem produção neste período: não há leitura de hidrômetro nem vazão a informar. A leitura anterior fica guardada para o próximo monitoramento.
    </p>
  );
}
