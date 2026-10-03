import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Droplets, RefreshCw } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  avaliarPotabilidade,
  cloroForaDoLimite,
  LIMITE_CLORO_PPM,
  LIMITE_PH,
  lerMedida,
  montarValorPotabilidade,
  motivosBloqueioPotabilidade,
  phForaDoLimite,
  potabilidadeInicial,
  rotuloTanque,
  SISTEMAS_POTABILIDADE,
} from "./potabilidadeAgua";
import type { ChaveSistemaPotabilidade, PotabilidadeAguaValor } from "./tiposCompostos";

interface PotabilidadeAguaFieldProps {
  value: PotabilidadeAguaValor | undefined | null;
  onChange: (valor: PotabilidadeAguaValor) => void;
  disabled?: boolean;
  /** Valor do monitoramento anterior do turno (mesma ficha e setor): define o tanque da vez do rodízio. */
  prevAppointment?: PotabilidadeAguaValor;
}

const apenasMedida = (t: string) => t.replace(/[^0-9.,]/g, "");

/** Potabilidade da Água (pH e cloro): um tanque de cada sistema de pré-resfriamento por monitoramento,
 * em rodízio — o tanque da vez vem do monitoramento anterior do turno e nunca repete o último. */
export function PotabilidadeAguaField({ value, onChange, disabled, prevAppointment }: PotabilidadeAguaFieldProps) {
  const [v, setV] = useState<PotabilidadeAguaValor>(() => value ?? potabilidadeInicial(prevAppointment));
  // O monitoramento anterior chega por consulta assíncrona: enquanto nada foi digitado, o rodízio
  // acompanha o anterior (e já salvo/editado nunca é sobrescrito).
  const editou = useRef(Boolean(value));
  const aval = avaliarPotabilidade(v);
  const completo = motivosBloqueioPotabilidade(v).length === 0;

  useEffect(() => {
    if (editou.current) return;
    setV(potabilidadeInicial(prevAppointment));
  }, [prevAppointment]);

  useEffect(() => {
    onChange(montarValorPotabilidade(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function alterar(sistema: ChaveSistemaPotabilidade, campo: "ph" | "cloro", texto: string) {
    editou.current = true;
    setV((a) => ({ ...a, sistemas: { ...a.sistemas, [sistema]: { ...a.sistemas[sistema], [campo]: apenasMedida(texto) } } }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="potabilidade-agua">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Rodízio automático: a cada monitoramento testa-se um tanque de cada sistema, nunca o mesmo do monitoramento anterior, para que todos sejam testados ao longo do turno. Limites: pH {LIMITE_PH.min.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} a{" "}
        {LIMITE_PH.max.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}; cloro {LIMITE_CLORO_PPM.min.toLocaleString("pt-BR")} a {LIMITE_CLORO_PPM.max.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ppm.
      </p>

      <fieldset className="space-y-3" disabled={disabled}>
        {SISTEMAS_POTABILIDADE.map((s) => {
          const t = v.sistemas[s.chave];
          const anterior = prevAppointment?.sistemas?.[s.chave]?.tanque;
          const phNc = phForaDoLimite(lerMedida(t.ph));
          const cloroNc = cloroForaDoLimite(lerMedida(t.cloro));
          return (
            <div key={s.chave} className="space-y-2 rounded-md border p-3" data-testid={`potabilidade-${s.chave}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <strong className="text-sm">{s.rotulo}</strong>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-black text-primary" data-testid={`tanque-${s.chave}`}>
                  Tanque da vez: {rotuloTanque(s.chave, t.tanque)}
                </span>
                {anterior && <span className="text-[10px] text-muted-foreground">anterior: {rotuloTanque(s.chave, anterior)}</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`ph-${s.chave}`}>pH</Label>
                  <Input id={`ph-${s.chave}`} inputMode="decimal" placeholder="7,0" value={t.ph} className={phNc ? "border-destructive text-destructive" : ""} onChange={(e) => alterar(s.chave, "ph", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cloro-${s.chave}`}>Cloro (ppm)</Label>
                  <Input id={`cloro-${s.chave}`} inputMode="decimal" placeholder="1,0" value={t.cloro} className={cloroNc ? "border-destructive text-destructive" : ""} onChange={(e) => alterar(s.chave, "cloro", e.target.value)} />
                </div>
              </div>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
