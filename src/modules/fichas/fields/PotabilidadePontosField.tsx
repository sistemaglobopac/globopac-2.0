import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Droplets, Shuffle } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  avaliarPotabilidadePontos,
  cloroPontoForaDoLimite,
  LIMITE_CLORO_PONTOS_PPM,
  LIMITE_PH_PONTOS,
  lerMedida,
  montarValorPotabilidadePontos,
  motivosBloqueioPotabilidadePontos,
  phPontoForaDoLimite,
  potabilidadePontosInicial,
  rotuloPonto,
} from "./potabilidadePontos";
import type { PotabilidadePontosValor } from "./tiposCompostos";

interface PotabilidadePontosFieldProps {
  value: PotabilidadePontosValor | undefined | null;
  onChange: (valor: PotabilidadePontosValor) => void;
  disabled?: boolean;
  /** Valor do monitoramento anterior (mesma ficha e setor): o sorteio nunca repete o ponto dele. */
  prevAppointment?: PotabilidadePontosValor;
}

const apenasMedida = (t: string) => t.replace(/[^0-9.,]/g, "");
const um = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1 });

/** Potabilidade da água nos pontos de coleta: o sistema sorteia um ponto por monitoramento (nunca o
 * mesmo do anterior) e o inspetor testa o pH e o cloro dele. */
export function PotabilidadePontosField({ value, onChange, disabled, prevAppointment }: PotabilidadePontosFieldProps) {
  const [v, setV] = useState<PotabilidadePontosValor>(() => value ?? potabilidadePontosInicial(prevAppointment));
  // O monitoramento anterior chega por consulta assíncrona: se o ponto já sorteado coincide com o do
  // anterior e nada foi digitado, sorteia de novo (e já salvo/editado nunca é sobrescrito).
  const editou = useRef(Boolean(value));
  const aval = avaliarPotabilidadePontos(v);
  const completo = motivosBloqueioPotabilidadePontos(v).length === 0;
  const phNc = phPontoForaDoLimite(lerMedida(v.ph));
  const cloroNc = cloroPontoForaDoLimite(lerMedida(v.cloro));

  useEffect(() => {
    if (editou.current || !prevAppointment?.ponto || v.ponto !== prevAppointment.ponto) return;
    setV(potabilidadePontosInicial(prevAppointment));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevAppointment]);

  useEffect(() => {
    onChange(montarValorPotabilidadePontos(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function alterar(campo: "ph" | "cloro", texto: string) {
    editou.current = true;
    setV((a) => ({ ...a, [campo]: apenasMedida(texto) }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="potabilidade-pontos">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : completo ? <CheckCircle2 className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Shuffle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Ponto sorteado pelo sistema a cada monitoramento (nunca o mesmo do anterior). Limites: pH {um(LIMITE_PH_PONTOS.min)} a {um(LIMITE_PH_PONTOS.max)}; cloro{" "}
        {LIMITE_CLORO_PONTOS_PPM.min.toLocaleString("pt-BR")} a {um(LIMITE_CLORO_PONTOS_PPM.max)} ppm.
      </p>

      <fieldset className="space-y-3" disabled={disabled}>
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-black text-primary" data-testid="ponto-sorteado">
              {rotuloPonto(v.ponto)}
            </span>
            {prevAppointment?.ponto && <span className="text-[10px] text-muted-foreground">anterior: {rotuloPonto(prevAppointment.ponto)}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ph-ponto">pH</Label>
              <Input id="ph-ponto" inputMode="decimal" placeholder="7,0" value={v.ph} className={phNc ? "border-destructive text-destructive" : ""} onChange={(e) => alterar("ph", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cloro-ponto">Cloro (ppm)</Label>
              <Input id="cloro-ponto" inputMode="decimal" placeholder="1,0" value={v.cloro} className={cloroNc ? "border-destructive text-destructive" : ""} onChange={(e) => alterar("cloro", e.target.value)} />
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
