import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { useCargasDoDia, type CargaAves } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import {
  acimaDoLimite,
  avaliarHematomas,
  cargaHematomasVazia,
  formatarPctHematomas,
  hematomasVazio,
  LESOES_HEMATOMAS,
  LIMITE_HEMATOMAS_PCT,
  lerAvaliadas,
  lerContagem,
  montarValorHematomas,
  motivosBloqueioHematomas,
  percentualHematomas,
  percentualSobreAvaliadas,
  SETOR_RNC_HEMATOMAS,
  totalDeLesoes,
} from "./hematomas";
import type { CargaHematomas, HematomasCarcacasValor } from "./tiposCompostos";

interface HematomasFieldProps {
  value: HematomasCarcacasValor | undefined | null;
  onChange: (valor: HematomasCarcacasValor) => void;
  disabled?: boolean;
}

function rotuloCarga(c: CargaAves): string {
  return `GTA ${c.gta} — ${c.integrado} · Aviário ${c.aviario}${c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · ${c.qtd_aves.toLocaleString("pt-BR")} aves`;
}

/** Hematomas nas carcaças: seleciona a carga pré-cadastrada (GTA), informa as carcaças avaliadas e as contagens de
 * contusões (asas, peito, coxa) e fraturas; o sistema calcula o percentual. Conforme até 4%; acima disso é NÃO CONFORME
 * e a RNC segue para o Fomento Avícola. */
export function HematomasField({ value, onChange, disabled }: HematomasFieldProps) {
  const [v, setV] = useState<HematomasCarcacasValor>({ ...hematomasVazio(), ...(value ?? {}) });
  const [dataProgramacao, setDataProgramacao] = useState(() => ensureLocalTime(new Date().toISOString()).isoLocal);
  const { data: cargasDoDia } = useCargasDoDia(dataProgramacao);
  const aval = avaliarHematomas(v);
  const escolhidas = new Set(v.cargas.map((c) => c.cargaId).filter(Boolean));
  const completo = motivosBloqueioHematomas(v).length === 0;

  useEffect(() => {
    onChange(montarValorHematomas(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizarCarga(indice: number, parcial: Partial<CargaHematomas>) {
    setV((atual) => ({ ...atual, cargas: atual.cargas.map((c, i) => (i === indice ? { ...c, ...parcial } : c)) }));
  }

  function escolherCarga(indice: number, id: string) {
    const c = (cargasDoDia ?? []).find((x) => x.id === id);
    atualizarCarga(
      indice,
      c
        ? { cargaId: c.id, gta: c.gta, integrado: c.integrado, aviario: c.aviario, nucleo: c.nucleo, qtdAves: c.qtd_aves }
        : { cargaId: "", gta: "", integrado: "", aviario: "", nucleo: "", qtdAves: 0 }
    );
  }

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="hematomas">
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${
          !aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
        }`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && (
          <span className="font-normal">
            {aval.motivos.join("; ")}. A RNC será enviada ao setor {SETOR_RNC_HEMATOMAS}.
          </span>
        )}
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Hematomas nas carcaças (limite {LIMITE_HEMATOMAS_PCT}%)</legend>
        <div className="space-y-1 sm:w-48">
          <Label htmlFor="hematomas-data">Data da programação</Label>
          <Input id="hematomas-data" type="date" value={dataProgramacao} onChange={(e) => setDataProgramacao(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Informe 0 quando não houver lesão daquele tipo. O percentual é o total de lesões (contusões nas asas, no peito, na coxa e fraturas) dividido pelas carcaças avaliadas.
        </p>
        {(cargasDoDia ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma carga programada para esta data. Peça ao Administrador/Verificador para cadastrar a GTA.</p>}

        {v.cargas.map((c, i) => {
          // A carga escolhida em outra linha desta ficha sai da lista; a desta linha permanece.
          const opcoes = (cargasDoDia ?? []).filter((x) => x.id === c.cargaId || !escolhidas.has(x.id));
          const naLista = opcoes.some((x) => x.id === c.cargaId);
          const avaliadas = lerAvaliadas(c);
          const total = totalDeLesoes(c);
          const pct = percentualHematomas(c);
          const acima = acimaDoLimite(c);
          return (
            <div key={i} className={`space-y-3 rounded-md border p-3 ${acima ? "border-destructive bg-destructive/5" : ""}`} data-testid={`carga-hematomas-${i}`}>
              <div className="space-y-1">
                <Label htmlFor={`hematomas-gta-${i}`}>Carga (GTA)</Label>
                <Select id={`hematomas-gta-${i}`} value={c.cargaId} onChange={(e) => escolherCarga(i, e.target.value)}>
                  <option value="">Selecione a carga…</option>
                  {c.cargaId && !naLista && <option value={c.cargaId}>{`GTA ${c.gta} — ${c.integrado}`}</option>}
                  {opcoes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {rotuloCarga(x)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1 sm:w-56">
                <Label htmlFor={`hematomas-avaliadas-${i}`}>Carcaças avaliadas</Label>
                <Input
                  id={`hematomas-avaliadas-${i}`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={c.carcacasAvaliadas}
                  onChange={(e) => atualizarCarga(i, { carcacasAvaliadas: e.target.value.replace(/\D/g, "") })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {LESOES_HEMATOMAS.map((l) => {
                  const n = lerContagem(c[l.chave]);
                  const parcial = percentualSobreAvaliadas(n, avaliadas);
                  return (
                    <div key={l.chave} className="space-y-1">
                      <Label htmlFor={`hematomas-${l.chave}-${i}`}>{l.rotulo}</Label>
                      <Input
                        id={`hematomas-${l.chave}-${i}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={c[l.chave]}
                        onChange={(e) => atualizarCarga(i, { [l.chave]: e.target.value.replace(/\D/g, "") })}
                      />
                      <p className="text-[11px] text-muted-foreground" data-testid={`hematomas-pct-${l.chave}-${i}`}>
                        {formatarPctHematomas(parcial)} das carcaças
                      </p>
                    </div>
                  );
                })}
              </div>

              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-black ${
                  pct === null ? "text-muted-foreground" : acima ? "border-destructive text-destructive" : "border-success text-success"
                }`}
                data-testid={`hematomas-calculado-${i}`}
              >
                <span>
                  Total de lesões: {total === null ? "—" : total.toLocaleString("pt-BR")}
                  {avaliadas !== null && total !== null ? ` em ${avaliadas.toLocaleString("pt-BR")} carcaças` : ""}
                </span>
                <span>
                  Hematomas: {formatarPctHematomas(pct)}
                  {pct === null ? "" : acima ? ` · NÃO CONFORME (limite ${LIMITE_HEMATOMAS_PCT}%)` : " · CONFORME"}
                </span>
              </div>

              {v.cargas.length > 1 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setV((a) => ({ ...a, cargas: a.cargas.filter((_, j) => j !== i) }))}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover carga
                </Button>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setV((a) => ({ ...a, cargas: [...a.cargas, cargaHematomasVazia()] }))}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar carga
        </Button>
      </fieldset>
    </div>
  );
}
