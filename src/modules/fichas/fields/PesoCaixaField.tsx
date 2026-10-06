import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { useCargasDoDia, useCargasJaMonitoradas, type CargaAves } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import { acimaDoLimite, avaliarPesoCaixa, cargaPesoVazia, cargasSemPeso, LIMITE_PESO_CAIXA_KG, montarValorPesoCaixa, motivosBloqueioPesoCaixa, pesoCaixaVazio, pesoPorCaixa } from "./pesoCaixa";
import type { CargaPesoCaixa, PesoCaixaValor } from "./tiposCompostos";

import type { CargasEmRascunhoPorTipo } from "../utils/rascunhosAnterior";

interface PesoCaixaFieldProps {
  value: PesoCaixaValor | undefined | null;
  onChange: (valor: PesoCaixaValor) => void;
  disabled?: boolean;
  /** Cargas já monitoradas em rascunhos locais (ainda não assinados): não voltam à lista. */
  cargasUsadasEmRascunho?: CargasEmRascunhoPorTipo;
}

function rotuloCarga(c: CargaAves): string {
  return `GTA ${c.gta} — ${c.integrado} · Aviário ${c.aviario}${c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · ${c.qtd_aves.toLocaleString("pt-BR")} aves`;
}

/** Peso vivo por caixa de transporte: seleciona a carga pré-cadastrada (GTA), informa aves por
 * caixa e peso médio das aves; calcula o peso por caixa. Conforme até 25 kg, não conforme acima. */
export function PesoCaixaField({ value, onChange, disabled, cargasUsadasEmRascunho }: PesoCaixaFieldProps) {
  const [v, setV] = useState<PesoCaixaValor>({ ...pesoCaixaVazio(), ...(value ?? {}) });
  const [dataProgramacao, setDataProgramacao] = useState(() => ensureLocalTime(new Date().toISOString()).isoLocal);
  const { data: cargasDoDia } = useCargasDoDia(dataProgramacao);
  const { data: jaMonitoradas } = useCargasJaMonitoradas("peso");
  const aval = avaliarPesoCaixa(v);
  const escolhidas = new Set(v.cargas.map((c) => c.cargaId).filter(Boolean));
  const completo = motivosBloqueioPesoCaixa(v).length === 0;
  // Balança ainda não passou o peso de alguma carga: dá para salvar agora e completar depois (etapa 2).
  const pendentes = cargasSemPeso(v);
  const aguardandoPeso = pendentes.length > 0 && motivosBloqueioPesoCaixa(v, { permitirSemPeso: true }).length === 0;

  useEffect(() => {
    onChange(montarValorPesoCaixa(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizarCarga(indice: number, parcial: Partial<CargaPesoCaixa>) {
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
    <div className="space-y-5 rounded-lg border p-4" data-testid="peso-caixa">
      <div className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : aguardandoPeso ? "bg-warning/15 text-warning-foreground" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : aguardandoPeso ? "AGUARDANDO O PESO DA BALANÇA" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Peso vivo por caixa de transporte (limite {LIMITE_PESO_CAIXA_KG} kg)</legend>
        <div className="space-y-1 sm:w-48">
          <Label htmlFor="peso-data">Data da programação</Label>
          <Input id="peso-data" type="date" value={dataProgramacao} onChange={(e) => setDataProgramacao(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          A balança ainda não passou o peso? Deixe o peso médio em branco e salve: o monitoramento fica <strong>aguardando peso</strong> (já vale para a frequência) e você completa
          depois, pela lista "Monitoramentos em andamento".
        </p>
        {(cargasDoDia ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma carga programada para esta data. Peça ao Administrador/Verificador para cadastrar a GTA.</p>}

        {v.cargas.map((c, i) => {
          // Já monitoradas (ou escolhidas em outra carga desta ficha) saem da lista; a desta linha permanece.
          const opcoes = (cargasDoDia ?? []).filter(
            (x) => x.id === c.cargaId || (!jaMonitoradas?.has(x.id) && !cargasUsadasEmRascunho?.peso.has(x.id) && !escolhidas.has(x.id))
          );
          const naLista = opcoes.some((x) => x.id === c.cargaId);
          const peso = pesoPorCaixa(c);
          const acima = acimaDoLimite(c);
          return (
            <div key={i} className={`space-y-3 rounded-md border p-3 ${acima ? "border-destructive bg-destructive/5" : ""}`} data-testid={`carga-peso-${i}`}>
              <div className="space-y-1">
                <Label htmlFor={`peso-gta-${i}`}>Carga (GTA)</Label>
                <Select id={`peso-gta-${i}`} value={c.cargaId} onChange={(e) => escolherCarga(i, e.target.value)}>
                  <option value="">Selecione a carga…</option>
                  {c.cargaId && !naLista && <option value={c.cargaId}>{`GTA ${c.gta} — ${c.integrado}`}</option>}
                  {opcoes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {rotuloCarga(x)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor={`peso-aves-${i}`}>Aves por caixa</Label>
                  <Input id={`peso-aves-${i}`} inputMode="numeric" value={c.avesPorCaixa} onChange={(e) => atualizarCarga(i, { avesPorCaixa: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`peso-medio-${i}`}>Peso médio das aves (kg) — opcional agora</Label>
                  <Input id={`peso-medio-${i}`} inputMode="decimal" placeholder="2,850" value={c.pesoMedioKg} onChange={(e) => atualizarCarga(i, { pesoMedioKg: e.target.value.replace(/[^0-9.,]/g, "") })} />
                </div>
                <div className="space-y-1">
                  <Label>Peso por caixa</Label>
                  <div className={`flex h-10 items-center rounded-md border px-3 text-sm font-black ${peso === null ? "text-muted-foreground" : acima ? "border-destructive text-destructive" : "border-success text-success"}`} data-testid={`peso-calculado-${i}`}>
                    {peso === null ? "—" : `${peso.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg · ${acima ? "NÃO CONFORME" : "CONFORME"}`}
                  </div>
                </div>
              </div>
              {v.cargas.length > 1 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setV((a) => ({ ...a, cargas: a.cargas.filter((_, j) => j !== i) }))}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover carga
                </Button>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setV((a) => ({ ...a, cargas: [...a.cargas, cargaPesoVazia()] }))}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar carga
        </Button>
      </fieldset>
    </div>
  );
}
