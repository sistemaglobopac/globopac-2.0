import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Fan, Lightbulb, Thermometer, Users, Volume2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { avaliarPendura, montarValorPendura, motivosBloqueioPendura, penduraVazia } from "./penduraAves";
import type { PenduraAvesValor } from "./tiposCompostos";

interface PenduraAvesFieldProps {
  value: PenduraAvesValor | undefined | null;
  onChange: (valor: PenduraAvesValor) => void;
  disabled?: boolean;
}

/** Monitoramento de Bem-Estar Animal na Sala de Pendura: temperatura, ventiladores, luzes, ruídos
 * desnecessários e se os auxiliares de produção penduram as aves conforme os princípios de
 * bem-estar animal. Ruído desnecessário ou pendura inadequada tornam o registro não conforme e
 * exigem descrição da ocorrência/ação corretiva. */
export function PenduraAvesField({ value, onChange, disabled }: PenduraAvesFieldProps) {
  const [v, setV] = useState<PenduraAvesValor>({ ...penduraVazia(), ...(value ?? {}) });
  const aval = avaliarPendura(v);
  const completo = motivosBloqueioPendura(v).length === 0;
  const desvio = v.ruidosDesnecessarios === true || v.auxiliaresConformes === false;

  useEffect(() => {
    onChange(montarValorPendura(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<PenduraAvesValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="pendura-aves">
      <div className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Sala de pendura</legend>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
          <div className="space-y-1">
            <Label htmlFor="pendura-temp" className="flex items-center gap-1">
              <Thermometer className="h-3.5 w-3.5" /> Temperatura (°C)
            </Label>
            <Input id="pendura-temp" inputMode="decimal" placeholder="26,0" value={v.temperaturaC} onChange={(e) => atualizar({ temperaturaC: e.target.value.replace(/[^0-9.,-]/g, "") })} />
          </div>
          <Escolha
            id="ventiladores"
            rotulo="Ventiladores"
            icone={<Fan className="h-3.5 w-3.5" />}
            valor={v.ventiladoresLigados}
            opcoes={[
              [true, "Ligados", "ok"],
              [false, "Desligados", "neutro"],
            ]}
            onChange={(b) => atualizar({ ventiladoresLigados: b })}
          />
          <Escolha
            id="luzes"
            rotulo="Luzes"
            icone={<Lightbulb className="h-3.5 w-3.5" />}
            valor={v.luzesAcesas}
            opcoes={[
              [true, "Acesas", "neutro"],
              [false, "Apagadas", "neutro"],
            ]}
            onChange={(b) => atualizar({ luzesAcesas: b })}
          />
          <Escolha
            id="ruidos"
            rotulo="Ruídos desnecessários?"
            icone={<Volume2 className="h-3.5 w-3.5" />}
            valor={v.ruidosDesnecessarios}
            opcoes={[
              [false, "Não", "ok"],
              [true, "Sim", "nc"],
            ]}
            onChange={(b) => atualizar({ ruidosDesnecessarios: b })}
          />
          <Escolha
            id="auxiliares"
            rotulo="Auxiliares pendurando conforme bem-estar animal?"
            icone={<Users className="h-3.5 w-3.5" />}
            valor={v.auxiliaresConformes}
            opcoes={[
              [true, "Sim", "ok"],
              [false, "Não", "nc"],
            ]}
            onChange={(b) => atualizar({ auxiliaresConformes: b })}
          />
        </div>

        {desvio && (
          <div className="space-y-1" role="alert">
            <Label htmlFor="pendura-desvio" className="text-destructive">
              Descreva a ocorrência e a ação corretiva adotada (obrigatório)
            </Label>
            <Input id="pendura-desvio" value={v.descricaoDesvio} placeholder="Ex.: ruído de equipamento — orientada a equipe; aves recolocadas com cuidado" onChange={(e) => atualizar({ descricaoDesvio: e.target.value })} />
          </div>
        )}
      </fieldset>
    </div>
  );
}

type Tom = "ok" | "nc" | "neutro";

const CLASSE_TOM: Record<Tom, string> = {
  ok: "border-success bg-success/10 text-success",
  nc: "border-destructive bg-destructive/10 text-destructive",
  neutro: "border-primary bg-primary/10",
};

function Escolha({
  id,
  rotulo,
  icone,
  valor,
  opcoes,
  onChange,
}: {
  id: string;
  rotulo: string;
  icone: ReactNode;
  valor: boolean | null;
  opcoes: [boolean, string, Tom][];
  onChange: (b: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1">
        {icone} {rotulo}
      </Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map(([b, texto, tom]) => (
          <label key={texto} className={`flex min-w-[7rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${valor === b ? CLASSE_TOM[tom] : ""}`}>
            <input type="radio" name={`pendura-${id}`} checked={valor === b} onChange={() => onChange(b)} />
            {texto}
          </label>
        ))}
      </div>
    </div>
  );
}
