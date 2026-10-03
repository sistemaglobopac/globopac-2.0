import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  avaliarChecklist,
  CHECKLISTS,
  checklistVazio,
  montarValorChecklist,
  motivosBloqueioChecklist,
  OPCOES_POR_MODO,
  salasDoChecklist,
  type TipoChecklist,
} from "./checklistConformidade";
import type { ChaveSalaChecklist, ChecklistConformidadeValor } from "./tiposCompostos";

interface ChecklistConformidadeFieldProps {
  tipo: TipoChecklist;
  value: ChecklistConformidadeValor | undefined | null;
  onChange: (valor: ChecklistConformidadeValor) => void;
  disabled?: boolean;
}

/** Checklist de conformidade (Águas Residuais, Ventilação e Higiene) das salas de pré-resfriamento de
 * Carcaças e de Miúdos: cada item é respondido Conforme / Não conforme / Não se aplica (excesso de
 * água no piso: Sim / Não). Qualquer não conformidade marca o monitoramento como NÃO CONFORME. */
export function ChecklistConformidadeField({ tipo, value, onChange, disabled }: ChecklistConformidadeFieldProps) {
  const def = CHECKLISTS[tipo];
  const [v, setV] = useState<ChecklistConformidadeValor>(() => ({ ...checklistVazio(tipo), ...(value ?? {}) }));
  const aval = avaliarChecklist(tipo, v);
  const completo = motivosBloqueioChecklist(tipo, v).length === 0;

  useEffect(() => {
    onChange(montarValorChecklist(tipo, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function responder(sala: ChaveSalaChecklist, chave: string, resposta: string) {
    setV((a) => ({ ...a, salas: { ...a.salas, [sala]: { ...a.salas[sala], [chave]: resposta } } }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid={`checklist-${tipo}`}>
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">{def.titulo}</legend>
        {salasDoChecklist(tipo).map((sala) => (
          <div key={sala.chave} className="space-y-2 rounded-md border bg-muted/20 p-3" data-testid={`sala-${sala.chave}`}>
            {sala.chave !== "geral" && <h4 className="text-sm font-black text-primary">{sala.rotulo}</h4>}
            {def.itens.map((item, indice) => {
              const resposta = v.salas?.[sala.chave]?.[item.chave] ?? "";
              const novoGrupo = item.grupo && item.grupo !== def.itens[indice - 1]?.grupo;
              return (
                <div key={item.chave} className="space-y-2">
                  {novoGrupo && <h5 className="pt-2 text-xs font-black uppercase tracking-wider text-muted-foreground">{item.grupo}</h5>}
                <div className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`item-${sala.chave}-${item.chave}`}>
                  <span className="text-sm font-medium">{item.rotulo}</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${item.rotulo} — ${sala.curto}`}>
                    {OPCOES_POR_MODO[item.modo].map((o) => (
                      <label
                        key={o.valor}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                          resposta === o.valor ? (o.naoConforme ? "border-destructive bg-destructive/10 text-destructive" : "border-success bg-success/10 text-success") : ""
                        }`}
                      >
                        <input type="radio" name={`${tipo}-${sala.chave}-${item.chave}`} checked={resposta === o.valor} onChange={() => responder(sala.chave, item.chave, o.valor)} />
                        {o.rotulo}
                      </label>
                    ))}
                  </div>
                </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className="space-y-1 pt-1">
          <Label htmlFor={`observacao-${tipo}`}>Observações (opcional)</Label>
          <Textarea id={`observacao-${tipo}`} rows={2} value={v.observacao ?? ""} onChange={(e) => setV((a) => ({ ...a, observacao: e.target.value }))} />
        </div>
      </fieldset>
    </div>
  );
}
