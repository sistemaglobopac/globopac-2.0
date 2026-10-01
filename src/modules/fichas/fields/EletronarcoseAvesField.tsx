import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Activity, Droplets, Timer, Zap } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  avaliarEletronarcose,
  eletronarcoseVazia,
  FAIXA_CORRENTE_MA,
  FAIXA_FREQUENCIA_HZ,
  FAIXA_VOLTAGEM_V,
  foraDaFaixa,
  LIMITE_CONTENCAO_MAX_S,
  LIMITE_POSTURA_ESTACAO_MAX_S,
  LIMITE_SAIDA_SANGRIA_MAX_S,
  LIMITE_SANGRIA_MIN_S,
  lerNumero,
  montarValorEletronarcose,
  motivosBloqueioEletronarcose,
  SINAIS_INSENSIBILIZACAO,
} from "./eletronarcoseAves";
import type { EletronarcoseAvesValor } from "./tiposCompostos";

interface EletronarcoseAvesFieldProps {
  value: EletronarcoseAvesValor | undefined | null;
  onChange: (valor: EletronarcoseAvesValor) => void;
  disabled?: boolean;
}

const soNumero = (t: string) => t.replace(/[^0-9.,]/g, "");

/** Monitoramento de Bem-Estar Animal na Eletronarcose: parâmetros elétricos, tempos da linha
 * (contenção ≤ 60 s, saída da cuba ≤ 12 s, sangria ≥ 3 min), pré-choque, aves sem sangrar e sinais
 * de insensibilização. Qualquer desvio torna o registro não conforme e exige descrição da
 * ocorrência/ação corretiva. */
export function EletronarcoseAvesField({ value, onChange, disabled }: EletronarcoseAvesFieldProps) {
  const [v, setV] = useState<EletronarcoseAvesValor>({ ...eletronarcoseVazia(), ...(value ?? {}) });
  const aval = avaliarEletronarcose(v);
  const completo = motivosBloqueioEletronarcose(v).length === 0;
  const desvio = aval.motivos.length > 0 && !aval.conformidade;

  useEffect(() => {
    onChange(montarValorEletronarcose(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<EletronarcoseAvesValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  const contencao = lerNumero(v.contencaoS);
  const saida = lerNumero(v.saidaSangriaS);
  const sangria = lerNumero(v.sangriaS);
  const postura = lerNumero(v.posturaEstacaoS);

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="eletronarcose-aves">
      <div className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3.5 w-3.5" /> Parâmetros da eletronarcose
        </legend>
        <div className="grid items-end gap-4 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
          <Numero id="volt" rotulo="Voltagem (V)" dica={`${FAIXA_VOLTAGEM_V.min} a ${FAIXA_VOLTAGEM_V.max} V`} nc={foraDaFaixa(lerNumero(v.voltagemV), FAIXA_VOLTAGEM_V)} valor={v.voltagemV} onChange={(t) => atualizar({ voltagemV: t })} />
          <Numero id="freq" rotulo="Frequência (Hz)" dica={`${FAIXA_FREQUENCIA_HZ.min} a ${FAIXA_FREQUENCIA_HZ.max} Hz`} nc={foraDaFaixa(lerNumero(v.frequenciaHz), FAIXA_FREQUENCIA_HZ)} valor={v.frequenciaHz} onChange={(t) => atualizar({ frequenciaHz: t })} />
          <Numero id="ma" rotulo="Corrente (mA por ave)" dica={`${FAIXA_CORRENTE_MA.min} a ${FAIXA_CORRENTE_MA.max} mA`} nc={foraDaFaixa(lerNumero(v.correnteMa), FAIXA_CORRENTE_MA)} valor={v.correnteMa} onChange={(t) => atualizar({ correnteMa: t })} />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Timer className="h-3.5 w-3.5" /> Tempos (segundos)
        </legend>
        <div className="grid items-end gap-4 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
          <Numero id="contencao" rotulo="Contenção: pendura até a cuba" dica={`máx. ${LIMITE_CONTENCAO_MAX_S} s`} nc={contencao !== null && contencao > LIMITE_CONTENCAO_MAX_S} valor={v.contencaoS} onChange={(t) => atualizar({ contencaoS: t })} />
          <Numero id="cuba" rotulo="Tempo dentro da cuba" valor={v.tempoCubaS} onChange={(t) => atualizar({ tempoCubaS: t })} />
          <Numero id="saida" rotulo="Saída da cuba até a sangria" dica={`máx. ${LIMITE_SAIDA_SANGRIA_MAX_S} s`} nc={saida !== null && saida > LIMITE_SAIDA_SANGRIA_MAX_S} valor={v.saidaSangriaS} onChange={(t) => atualizar({ saidaSangriaS: t })} />
          <Numero id="sangria" rotulo="Tempo de sangria" dica={`mín. ${LIMITE_SANGRIA_MIN_S} s (3 min)`} nc={sangria !== null && sangria < LIMITE_SANGRIA_MIN_S} valor={v.sangriaS} onChange={(t) => atualizar({ sangriaS: t })} />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Droplets className="h-3.5 w-3.5" /> Pré-choque e sangria
        </legend>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
          <Escolha id="prechoque" rotulo="Aves recebendo pré-choque?" valor={v.preChoque} onChange={(b) => atualizar({ preChoque: b })} />
          <Escolha id="semsangrar" rotulo="Aves sem sangrar após o disco automático e o rapasse da sangria?" valor={v.avesSemSangrar} onChange={(b) => atualizar({ avesSemSangrar: b })} />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Sinais de insensibilização
        </legend>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
          {SINAIS_INSENSIBILIZACAO.map((sinal) => (
            <Escolha key={sinal.chave} id={sinal.chave} rotulo={sinal.rotulo} simConforme={sinal.simConforme} valor={v[sinal.chave]} onChange={(b) => atualizar({ [sinal.chave]: b })} />
          ))}
          <Numero id="postura" rotulo="Tempo para restabelecer a postura de estação (s)" dica={`máx. ${LIMITE_POSTURA_ESTACAO_MAX_S} s`} nc={postura !== null && postura > LIMITE_POSTURA_ESTACAO_MAX_S} valor={v.posturaEstacaoS} onChange={(t) => atualizar({ posturaEstacaoS: t })} />
        </div>
      </fieldset>

      {desvio && (
        <fieldset className="space-y-1" role="alert" disabled={disabled}>
          <Label htmlFor="eletro-desvio" className="text-destructive">
            Descreva a ocorrência e a ação corretiva adotada (obrigatório)
          </Label>
          <Input id="eletro-desvio" value={v.descricaoDesvio} placeholder="Ex.: ajustada a voltagem; aves reinspecionadas; sangria reforçada" onChange={(e) => atualizar({ descricaoDesvio: e.target.value })} />
        </fieldset>
      )}
    </div>
  );
}

function Numero({ id, rotulo, valor, onChange, dica, nc, placeholder }: { id: string; rotulo: string; valor: string; onChange: (t: string) => void; dica?: string; nc?: boolean; placeholder?: string }): ReactNode {
  return (
    <div className="flex flex-col justify-end gap-1">
      <Label htmlFor={`eletro-${id}`} className="flex flex-col gap-0.5 leading-tight">
        <span>{rotulo}</span>
        {dica && <span className={`text-xs font-normal ${nc ? "font-black text-destructive" : "text-muted-foreground"}`}>{dica}</span>}
      </Label>
      <Input id={`eletro-${id}`} inputMode="decimal" placeholder={placeholder} aria-invalid={nc || undefined} className={nc ? "border-destructive" : ""} value={valor} onChange={(e) => onChange(soNumero(e.target.value))} />
    </div>
  );
}

/** Sim/Não em que "Sim" é o desvio, salvo `simConforme` (então "Não" é o desvio). */
function Escolha({ id, rotulo, valor, onChange, simConforme = false }: { id: string; rotulo: string; valor: boolean | null; onChange: (b: boolean) => void; simConforme?: boolean }) {
  const opcoes: [boolean, string, string][] = [
    [false, "Não", simConforme ? "border-destructive bg-destructive/10 text-destructive" : "border-success bg-success/10 text-success"],
    [true, "Sim", simConforme ? "border-success bg-success/10 text-success" : "border-destructive bg-destructive/10 text-destructive"],
  ];
  return (
    <div className="space-y-1">
      <Label>{rotulo}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map(([b, texto, classe]) => (
          <label key={texto} className={`flex min-w-[7rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${valor === b ? classe : ""}`}>
            <input type="radio" name={`eletro-${id}`} checked={valor === b} onChange={() => onChange(b)} />
            {texto}
          </label>
        ))}
      </div>
    </div>
  );
}
