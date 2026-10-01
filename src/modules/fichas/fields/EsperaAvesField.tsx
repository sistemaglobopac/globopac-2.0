import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Droplets, Fan, Plus, Thermometer, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { useCargasDoDia, type CargaAves } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import { acaoCorretivaPendente, avaliarEspera, boxesOfegantes, boxVazio, COMPORTAMENTOS_AVES, esperaVazia, montarValorEspera, motivosBloqueioEspera } from "./esperaAves";
import type { BoxEsperaAves, EsperaAvesValor } from "./tiposCompostos";

interface EsperaAvesFieldProps {
  value: EsperaAvesValor | undefined | null;
  onChange: (valor: EsperaAvesValor) => void;
  disabled?: boolean;
}

/** Data e hora de agora em Manaus, no formato `YYYY-MM-DDTHH:mm`. */
function agoraLocal(): string {
  const { isoLocal, time } = ensureLocalTime(new Date().toISOString());
  return `${isoLocal}T${time}`;
}

function rotuloCarga(c: CargaAves): string {
  return `GTA ${c.gta} — ${c.integrado} · Aviário ${c.aviario}${c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · ${c.qtd_aves.toLocaleString("pt-BR")} aves`;
}

/** Monitoramento de Bem-Estar Animal na Área de Espera: o inspetor informa quais cargas (GTA) estão
 * em cada box e o comportamento das aves, a temperatura ambiente e se aspersores/ventiladores estão
 * ligados. Com aves ofegantes, a ação corretiva é ligar aspersores e ventiladores (botão dedicado). */
export function EsperaAvesField({ value, onChange, disabled }: EsperaAvesFieldProps) {
  const [v, setV] = useState<EsperaAvesValor>({ ...esperaVazia(), ...(value ?? {}) });
  const [dataProgramacao, setDataProgramacao] = useState(() => ensureLocalTime(new Date().toISOString()).isoLocal);
  const { data: cargas } = useCargasDoDia(dataProgramacao);

  const aval = avaliarEspera(v);
  const completo = motivosBloqueioEspera(v).length === 0;
  const ofegantes = boxesOfegantes(v);
  const pendente = acaoCorretivaPendente(v);

  useEffect(() => {
    onChange(montarValorEspera(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<EsperaAvesValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  function atualizarBox(indice: number, parcial: Partial<BoxEsperaAves>) {
    setV((atual) => ({ ...atual, boxes: atual.boxes.map((b, i) => (i === indice ? { ...b, ...parcial } : b)) }));
  }

  function escolherCarga(indice: number, id: string) {
    const c = (cargas ?? []).find((x) => x.id === id);
    atualizarBox(
      indice,
      c
        ? { cargaId: c.id, gta: c.gta, integrado: c.integrado, aviario: c.aviario, nucleo: c.nucleo, qtdAves: c.qtd_aves }
        : { cargaId: "", gta: "", integrado: "", aviario: "", nucleo: "", qtdAves: 0 }
    );
  }

  function acionarEquipamentos() {
    atualizar({ aspersoresLigados: true, ventiladoresLigados: true, acaoCorretiva: true, acaoCorretivaEm: agoraLocal() });
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="espera-aves">
      <div className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">1. Cargas nos boxes e comportamento das aves</legend>
        <div className="space-y-1 sm:w-48">
          <Label htmlFor="espera-data">Data da programação</Label>
          <Input id="espera-data" type="date" value={dataProgramacao} onChange={(e) => setDataProgramacao(e.target.value)} />
        </div>
        {(cargas ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma carga programada para esta data. Peça ao Administrador/Verificador para cadastrar a GTA.</p>
        )}

        <div className="space-y-3">
          {v.boxes.map((b, i) => {
            const naLista = (cargas ?? []).some((c) => c.id === b.cargaId);
            return (
              <div key={i} className={`space-y-3 rounded-md border p-3 ${b.comportamento === "ofegantes" ? "border-destructive bg-destructive/5" : ""}`} data-testid={`box-${i}`}>
                <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor={`espera-box-${i}`}>Box</Label>
                    <Input id={`espera-box-${i}`} value={b.box} maxLength={6} placeholder="1" onChange={(e) => atualizarBox(i, { box: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`espera-gta-${i}`}>GTA da carga no box</Label>
                    <Select id={`espera-gta-${i}`} value={b.cargaId} onChange={(e) => escolherCarga(i, e.target.value)}>
                      <option value="">Selecione a GTA…</option>
                      {b.cargaId && !naLista && <option value={b.cargaId}>{`GTA ${b.gta} — ${b.integrado}`}</option>}
                      {(cargas ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {rotuloCarga(c)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comportamento das aves</Label>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Comportamento das aves no box ${b.box || i + 1}`}>
                    {COMPORTAMENTOS_AVES.map((c) => (
                      <label
                        key={c.chave}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                          b.comportamento === c.chave
                            ? c.chave === "normais"
                              ? "border-success bg-success/10 text-success"
                              : c.chave === "ofegantes"
                                ? "border-destructive bg-destructive/10 text-destructive"
                                : "border-warning bg-warning/10"
                            : ""
                        }`}
                      >
                        <input type="radio" name={`comportamento-${i}`} checked={b.comportamento === c.chave} onChange={() => atualizarBox(i, { comportamento: c.chave })} />
                        {c.rotulo}
                      </label>
                    ))}
                  </div>
                  {b.comportamento === "outras" && (
                    <Input aria-label="Descrição do comportamento" placeholder="Qual comportamento? (obrigatório)" value={b.outrasCondicoes} onChange={(e) => atualizarBox(i, { outrasCondicoes: e.target.value })} />
                  )}
                </div>
                {v.boxes.length > 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => atualizar({ boxes: v.boxes.filter((_, j) => j !== i) })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover box
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => atualizar({ boxes: [...v.boxes, boxVazio()] })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar box
        </Button>
      </fieldset>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">2. Ambiente e climatização</legend>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
          <div className="space-y-1">
            <Label htmlFor="espera-temp" className="flex h-5 items-center gap-1 whitespace-nowrap">
              <Thermometer className="h-3.5 w-3.5" /> Temperatura ambiente (°C)
            </Label>
            <Input id="espera-temp" inputMode="decimal" placeholder="28,5" value={v.temperaturaC} onChange={(e) => atualizar({ temperaturaC: e.target.value.replace(/[^0-9.,-]/g, "") })} />
          </div>
          <LigadoDesligado id="aspersores" rotulo="Aspersores" icone={<Droplets className="h-3.5 w-3.5" />} valor={v.aspersoresLigados} onChange={(b) => atualizar({ aspersoresLigados: b })} />
          <LigadoDesligado id="ventiladores" rotulo="Ventiladores" icone={<Fan className="h-3.5 w-3.5" />} valor={v.ventiladoresLigados} onChange={(b) => atualizar({ ventiladoresLigados: b })} />
        </div>
      </fieldset>

      {ofegantes.length > 0 && (
        <div className={`space-y-2 rounded-md border p-3 ${pendente ? "border-destructive bg-destructive/5" : "border-success bg-success/5"}`} role="alert" data-testid="acao-corretiva">
          <p className={`flex items-center gap-2 text-sm font-black ${pendente ? "text-destructive" : "text-success"}`}>
            {pendente ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            Aves ofegantes em {ofegantes.map((b) => `Box ${b.box || "?"}`).join(", ")}
          </p>
          {pendente ? (
            <>
              <p className="text-sm">Ação corretiva: ligar os aspersores e os ventiladores.</p>
              <Button type="button" disabled={disabled} onClick={acionarEquipamentos} data-testid="acionar-equipamentos">
                Ligar aspersores e ventiladores
              </Button>
            </>
          ) : (
            <p className="text-sm">
              Aspersores e ventiladores ligados
              {v.acaoCorretiva && v.acaoCorretivaEm ? ` — ação corretiva registrada em ${v.acaoCorretivaEm.replace("T", " às ")}` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LigadoDesligado({ id, rotulo, icone, valor, onChange }: { id: string; rotulo: string; icone: ReactNode; valor: boolean | null; onChange: (b: boolean) => void }) {
  return (
    <div className="space-y-1">
      <Label className="flex h-5 items-center gap-1 whitespace-nowrap">
        {icone} {rotulo}
      </Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {(
          [
            [true, "Ligados"],
            [false, "Desligados"],
          ] as const
        ).map(([b, texto]) => (
          <label
            key={texto}
            className={`flex min-w-[7rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
              valor === b ? (b ? "border-success bg-success/10 text-success" : "border-warning bg-warning/10") : ""
            }`}
          >
            <input type="radio" name={`espera-${id}`} checked={valor === b} onChange={() => onChange(b)} />
            {texto}
          </label>
        ))}
      </div>
    </div>
  );
}
