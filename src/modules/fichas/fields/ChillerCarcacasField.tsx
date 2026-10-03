import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, DownloadCloud, Info, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useCargasJaMonitoradas, useCargasRastreabilidade } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import { formatHidrometro, formatMaskedValue, LIMIAR_IMPLAUSIVEL, parseHidrometro } from "./hidrometro";
import {
  apurar,
  avesNoPeriodo,
  detalheDesvio,
  exibirPesoVivo,
  loteDeCarga,
  GELO_PADRAO_CARCACAS,
  mascararPesoVivo,
  metaTanqueCarcacas,
  pesoMedioCarcaca as calcularPesoMedioCarcaca,
  totalAvesBruto,
  type ChaveTanqueCarcacas as ChaveTanque,
} from "./calculosSpr";
import { AvisoImplausivel, AvisoPrimeiroDoDia, LogicaCalculo, TOOLTIP_HIDR_ANTERIOR } from "./componentesSpr";
import type { CargaProcessada, ChillerCarcacasValor, TanqueHidrometro } from "./tiposCompostos";

const CONFIG_TANQUE: Record<ChaveTanque, { nome: string; cor: string }> = {
  preChiller: { nome: "Pré-chiller", cor: "#002060" },
  chiller1: { nome: "Chiller 01", cor: "#059669" },
  chiller2: { nome: "Chiller 02 (Último)", cor: "#002060" },
};

// Gelo padrão (kg) por tanque ao abrir um monitoramento: cada tanque físico tem o seu (ver
// GELO_PADRAO_CARCACAS em calculosSpr.ts) — nunca um valor único para os três.
function tanqueVazio(tanque: ChaveTanque, prev: string): TanqueHidrometro {
  return { prev, cur: "", ice: GELO_PADRAO_CARCACAS[tanque] };
}

/** Só dígitos (aves e condenas são números inteiros). */
const somenteInteiro = (valor: string) => valor.replace(/\D/g, "");

interface ChillerCarcacasFieldProps {
  value: ChillerCarcacasValor | undefined;
  onChange: (valor: ChillerCarcacasValor) => void;
  disabled?: boolean;
  /** dados_dinamicos[chave] do monitoramento mais recente de HOJE (mesma ficha, setor e turno) —
   * a leitura "atual" de lá vira a leitura "anterior" (travada) deste apontamento. */
  prevAppointment?: ChillerCarcacasValor;
}

/** Renovação da Água do SPR Carcaças. Aves no período = cargas − condenas; peso médio da
 * carcaça = média ponderada do peso vivo × 0,84; meta por tanque em função desse peso. O widget
 * só EXIBE o desvio — quem decide `monitoramentos.conformidade` continua sendo o Verificador
 * (segregação de funções, `trg_segregacao_funcoes`). Todas as contas ficam em calculosSpr.ts. */
export function ChillerCarcacasField({ value, onChange, disabled, prevAppointment }: ChillerCarcacasFieldProps) {
  const [cargas, setCargas] = useState<CargaProcessada[]>(value?.cargas ?? [{ id: crypto.randomUUID(), quantity: "", avgLiveWeight: "" }]);
  const [condenasParcial, setCondenasParcial] = useState(value?.condenasParcial ?? "");
  // Registros antigos só têm o campo `condenas`: ele entra como "totalmente condenadas".
  const [condenasTotal, setCondenasTotal] = useState(value?.condenasTotal ?? value?.condenas ?? "");
  const [tanques, setTanques] = useState({
    preChiller: value?.tanques.preChiller ?? tanqueVazio("preChiller", prevAppointment?.tanques.preChiller.cur ?? ""),
    chiller1: value?.tanques.chiller1 ?? tanqueVazio("chiller1", prevAppointment?.tanques.chiller1.cur ?? ""),
    chiller2: value?.tanques.chiller2 ?? tanqueVazio("chiller2", prevAppointment?.tanques.chiller2.cur ?? ""),
  });
  const [prevTravado, setPrevTravado] = useState({
    preChiller: !!(value?.tanques.preChiller.prev || prevAppointment?.tanques.preChiller.cur),
    chiller1: !!(value?.tanques.chiller1.prev || prevAppointment?.tanques.chiller1.cur),
    chiller2: !!(value?.tanques.chiller2.prev || prevAppointment?.tanques.chiller2.cur),
  });

  // Herança do Bem-Estar Animal: cargas do dia com a pendura iniciada, que ainda não entraram em
  // nenhuma apuração do SPR (nem nesta), com aves da GTA e peso médio da densidade das caixas.
  const [herdarAberto, setHerdarAberto] = useState(false);
  const { data: cargasDoDia } = useCargasRastreabilidade(ensureLocalTime(new Date().toISOString()).isoLocal);
  const { data: jaUsadas } = useCargasJaMonitoradas("spr");
  const usadasNestaFicha = new Set(cargas.map((c) => c.cargaId).filter(Boolean));
  const disponiveis = (cargasDoDia ?? []).filter((c) => c.pendura_inicio_em && !jaUsadas?.has(c.carga_id) && !usadasNestaFicha.has(c.carga_id));

  function herdarCargas(escolhidas: typeof disponiveis) {
    if (escolhidas.length === 0) return;
    const novos = escolhidas.map((c) => loteDeCarga(c, crypto.randomUUID()));
    // O lote em branco inicial dá lugar às cargas herdadas.
    setCargas((atual) => [...atual.filter((c) => c.cargaId || c.quantity || c.avgLiveWeight), ...novos]);
  }

  // Primeiro monitoramento do dia (nenhum tanque tem leitura anterior para herdar): só a leitura
  // atual, que vira a base do próximo monitoramento comparar.
  const isPrimeiroDoDia = !prevTravado.preChiller && !prevTravado.chiller1 && !prevTravado.chiller2;

  // Atualiza leitura anterior quando prevAppointment chega depois (fetch assíncrono).
  useEffect(() => {
    if (!prevAppointment) return;
    setTanques((atual) => ({
      preChiller: { ...atual.preChiller, prev: atual.preChiller.prev || prevAppointment.tanques.preChiller.cur },
      chiller1: { ...atual.chiller1, prev: atual.chiller1.prev || prevAppointment.tanques.chiller1.cur },
      chiller2: { ...atual.chiller2, prev: atual.chiller2.prev || prevAppointment.tanques.chiller2.cur },
    }));
    setPrevTravado((atual) => ({
      preChiller: atual.preChiller || !!prevAppointment.tanques.preChiller.cur,
      chiller1: atual.chiller1 || !!prevAppointment.tanques.chiller1.cur,
      chiller2: atual.chiller2 || !!prevAppointment.tanques.chiller2.cur,
    }));
  }, [prevAppointment]);

  const totalAves = totalAvesBruto(cargas);
  const pesoMedioCarcaca = calcularPesoMedioCarcaca(cargas); // já com o rendimento fixo de 84%

  const totalCondenasParcial = parseFloat(condenasParcial) || 0;
  const totalCondenasTotalNum = parseFloat(condenasTotal) || 0;
  const totalCondenas = totalCondenasParcial + totalCondenasTotalNum;
  const totalAvesPeriodo = avesNoPeriodo(totalAves, totalCondenasParcial, totalCondenasTotalNum);

  const metas: Record<ChaveTanque, number> = {
    preChiller: metaTanqueCarcacas("preChiller", pesoMedioCarcaca),
    chiller1: metaTanqueCarcacas("chiller1", pesoMedioCarcaca),
    chiller2: metaTanqueCarcacas("chiller2", pesoMedioCarcaca),
  };
  const apurado: Record<ChaveTanque, number | null> = {
    preChiller: apurar(tanques.preChiller.prev, tanques.preChiller.cur, tanques.preChiller.ice, totalAvesPeriodo),
    chiller1: apurar(tanques.chiller1.prev, tanques.chiller1.cur, tanques.chiller1.ice, totalAvesPeriodo),
    chiller2: apurar(tanques.chiller2.prev, tanques.chiller2.cur, tanques.chiller2.ice, totalAvesPeriodo),
  };

  const hasCurData = !!(tanques.preChiller.cur || tanques.chiller1.cur || tanques.chiller2.cur);
  // Tanque sem leitura atual, ou sem base de cálculo, é tratado como conforme; igual à meta
  // também é conforme (apurado >= meta).
  const conformeTanque = (chave: ChaveTanque) =>
    !tanques[chave].cur ? true : totalAvesPeriodo === 0 ? true : (apurado[chave] ?? 0) >= metas[chave];
  const confPreChiller = conformeTanque("preChiller");
  const confChiller1 = conformeTanque("chiller1");
  const confChiller2 = conformeTanque("chiller2");
  const isConforme = !hasCurData || (confPreChiller && confChiller1 && confChiller2);

  useEffect(() => {
    const detalhes: string[] = [];
    if (!confPreChiller && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Pré-chiller", apurado.preChiller ?? 0, metas.preChiller, "L/c"));
    if (!confChiller1 && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Chiller 01", apurado.chiller1 ?? 0, metas.chiller1, "L/c"));
    if (!confChiller2 && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Chiller 02", apurado.chiller2 ?? 0, metas.chiller2, "L/c"));

    onChange({
      cargas,
      tanques,
      condenasParcial,
      condenasTotal,
      totalAves: totalAvesPeriodo,
      totalAvesBruto: totalAves,
      pesoMedioCarcaca,
      conformidade: isConforme,
      detalhesRNC: detalhes.length > 0 ? `Vazão Insuficiente: ${detalhes.join("; ")}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargas, tanques, condenasParcial, condenasTotal, isConforme]);

  function adicionarCarga() {
    setCargas((atual) => [...atual, { id: crypto.randomUUID(), quantity: "", avgLiveWeight: "" }]);
  }
  function removerCarga(id: string) {
    setCargas((atual) => atual.filter((c) => c.id !== id));
  }
  function alterarCarga(id: string, campo: keyof CargaProcessada, valor: string) {
    setCargas((atual) => atual.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));
  }
  function alterarTanque(chave: ChaveTanque, campo: keyof TanqueHidrometro, valor: string) {
    setTanques((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));
  }

  function renderTanque(chave: ChaveTanque) {
    const cor = CONFIG_TANQUE[chave].cor;
    const tanque = tanques[chave];
    const meta = metas[chave];
    const valorApurado = apurado[chave];
    const temResultado = totalAvesPeriodo > 0 && !!tanque.cur;
    const naoConforme = !!tanque.cur && totalAvesPeriodo > 0 && (valorApurado ?? 0) < meta;
    const implausivel = !!tanque.cur && totalAvesPeriodo > 0 && meta > 0 && (valorApurado ?? 0) > meta * LIMIAR_IMPLAUSIVEL;

    return (
      <div key={chave} className="overflow-hidden rounded-lg border-2" style={{ borderColor: naoConforme ? "#dc2626" : `${cor}40` }}>
        <div className="flex flex-wrap gap-2 items-center justify-between px-3 py-2 text-sm font-black text-white" style={{ background: cor }}>
          {CONFIG_TANQUE[chave].nome.toUpperCase()}
          {totalAves > 0 && <span className="text-xs opacity-90">Meta: {formatMaskedValue(meta.toFixed(3))} L/c</span>}
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3">
            {!isPrimeiroDoDia && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Hidr. Anterior (m³) {prevTravado[chave] && <Lock className="h-3 w-3" />}
                </Label>
                <Input
                  disabled={disabled || prevTravado[chave]}
                  title={prevTravado[chave] ? TOOLTIP_HIDR_ANTERIOR : undefined}
                  value={formatHidrometro(tanque.prev)}
                  onChange={(e) => alterarTanque(chave, "prev", parseHidrometro(e.target.value))}
                  className="font-mono"
                  placeholder="Ex: 3718,72"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hidr. Atual (m³)</Label>
              <Input
                disabled={disabled}
                value={formatHidrometro(tanque.cur)}
                onChange={(e) => alterarTanque(chave, "cur", parseHidrometro(e.target.value))}
                className="font-mono"
                placeholder="Ex: 3718,72"
              />
            </div>
            {!isPrimeiroDoDia && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Gelo Adicionado (kg)</Label>
                <Input
                  disabled={disabled}
                  value={formatHidrometro(tanque.ice)}
                  onChange={(e) => alterarTanque(chave, "ice", parseHidrometro(e.target.value))}
                  className="font-mono"
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div
            className="rounded-md border p-3"
            style={{
              background: !temResultado ? undefined : naoConforme ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)",
              borderColor: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669",
            }}
          >
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <span className="text-xs font-bold" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                RENOVAÇÃO APURADA
              </span>
              <span className="text-lg font-black" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                {temResultado ? `${formatMaskedValue((valorApurado ?? 0).toFixed(3))} L/c` : "—"}
              </span>
            </div>
            {naoConforme && temResultado && (
              <p className="mt-1 text-xs font-bold text-destructive">ABAIXO DO MÍNIMO ({formatMaskedValue(meta.toFixed(3))} L/c)</p>
            )}
          </div>

          {implausivel && <AvisoImplausivel apurado={valorApurado ?? 0} meta={meta} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-4">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Status de Conformidade</p>
          <p className={`mt-1 flex items-center gap-2 text-lg font-black ${!hasCurData ? "text-primary" : !isConforme ? "text-destructive" : "text-success"}`}>
            {!hasCurData ? (
              <>
                <Info className="h-5 w-5" /> AGUARDANDO LEITURA
              </>
            ) : !isConforme ? (
              <>
                <AlertTriangle className="h-5 w-5" /> ATENÇÃO: DESVIO DETECTADO
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" /> CONFORME
              </>
            )}
          </p>
        </div>
        {totalAves > 0 && (
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs font-bold text-muted-foreground">Aves no Período</p>
              <p className="text-lg font-black">{totalAvesPeriodo.toLocaleString("pt-BR")} aves</p>
              <p className="text-xs text-muted-foreground">
                {totalAves.toLocaleString("pt-BR")} bruto − {totalCondenas.toLocaleString("pt-BR")} condenas
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-muted-foreground">Média Carcaça (Est.)</p>
              <p className="text-lg font-black">{formatMaskedValue(pesoMedioCarcaca.toFixed(3))} kg</p>
              <p className="max-w-[210px] text-xs text-muted-foreground">carcaças = aves abatidas com 16% de perda de peso (despojos do abate)</p>
            </div>
          </div>
        )}
      </div>

      {!isConforme && !disabled && (
        <div className="flex items-center gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-3">
          <AlertTriangle className="h-8 w-8 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-destructive">DESVIO DE VAZÃO REGISTRADO</p>
            <p className="text-xs text-muted-foreground">
              O sistema detectou uma renovação de água fora dos padrões legais — o Verificador vai decidir a conformidade final.
            </p>
          </div>
        </div>
      )}

      {!isPrimeiroDoDia ? (
        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h4 className="text-sm font-bold text-primary">Cargas Processadas no Período</h4>
            <Button type="button" size="sm" variant="outline" onClick={adicionarCarga} disabled={disabled}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Lote
            </Button>
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-background p-3" data-testid="herdar-cargas">
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setHerdarAberto((a) => !a)}>
              <DownloadCloud className="h-3.5 w-3.5" /> Herdar cargas do Bem-Estar Animal ({disponiveis.length})
            </Button>
            {herdarAberto && (
              <div className="space-y-1">
                {disponiveis.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma carga nova com a pendura iniciada (as já usadas em apurações do SPR não aparecem).</p>
                )}
                {disponiveis.map((c) => (
                  <div key={c.carga_id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs">
                    <span>
                      <strong>GTA {c.gta}</strong> · {c.qtd_aves.toLocaleString("pt-BR")} aves ·{" "}
                      {c.peso_medio_kg ? `peso ${c.peso_medio_kg} kg` : <em className="text-warning-foreground">sem peso (densidade das caixas ainda não feita)</em>}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => herdarCargas([c])}>
                      <Plus className="h-3.5 w-3.5" /> Adicionar
                    </Button>
                  </div>
                ))}
                {disponiveis.length > 1 && (
                  <Button type="button" size="sm" onClick={() => herdarCargas(disponiveis)}>
                    Adicionar todas
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {cargas.map((carga, indice) => (
              <div key={carga.id} className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-end">
                <span className="text-xs font-black text-muted-foreground sm:min-w-[60px]">
                  LOTE {indice + 1}
                  {carga.gta && <span className="block font-normal">GTA {carga.gta}</span>}
                </span>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Aves (un)</Label>
                  <Input
                    inputMode="numeric"
                    disabled={disabled || !!(carga.cargaId && carga.quantity)}
                    value={carga.quantity}
                    onChange={(e) => alterarCarga(carga.id, "quantity", somenteInteiro(e.target.value))}
                    placeholder="Ex: 4500"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Peso Vivo (kg)</Label>
                  <Input
                    className="font-mono"
                    inputMode="numeric"
                    disabled={disabled || !!(carga.cargaId && carga.avgLiveWeight)}
                    value={exibirPesoVivo(carga.avgLiveWeight)}
                    onChange={(e) => alterarCarga(carga.id, "avgLiveWeight", mascararPesoVivo(e.target.value))}
                    placeholder="Ex: 2,850"
                  />
                </div>
                {cargas.length > 1 && !disabled && (
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removerCarga(carga.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-dashed pt-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Parcialmente Aproveitadas</Label>
              <Input inputMode="numeric" disabled={disabled} value={condenasParcial} onChange={(e) => setCondenasParcial(somenteInteiro(e.target.value))} placeholder="Ex: 40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Totalmente Condenadas</Label>
              <Input inputMode="numeric" disabled={disabled} value={condenasTotal} onChange={(e) => setCondenasTotal(somenteInteiro(e.target.value))} placeholder="Ex: 80" />
            </div>
          </div>
          {totalAves > 0 && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Aves no Período:</strong> {totalAves.toLocaleString("pt-BR")} (cargas) − {totalCondenas.toLocaleString("pt-BR")}{" "}
              (condenas) = <strong className="text-primary">{totalAvesPeriodo.toLocaleString("pt-BR")} aves</strong>
            </p>
          )}
        </div>
      ) : (
        <AvisoPrimeiroDoDia />
      )}

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {renderTanque("preChiller")}
        {renderTanque("chiller1")}
        {renderTanque("chiller2")}
      </div>

      <LogicaCalculo titulo="SPR Carcaças">
        <li>
          Curva das metas (L/carcaça) para o peso médio de carcaça atual
          {pesoMedioCarcaca > 0 ? ` (${formatMaskedValue(pesoMedioCarcaca.toFixed(3))} kg)` : ""}: Pré-chiller {formatMaskedValue(metas.preChiller.toFixed(3)) || "—"} →
          Chiller 01 {formatMaskedValue(metas.chiller1.toFixed(3)) || "—"} → Chiller 02 {formatMaskedValue(metas.chiller2.toFixed(3)) || "—"}.
        </li>
        <li>Aves no Período = Σ aves das cargas − (carcaças parcialmente aproveitadas + totalmente condenadas).</li>
        <li>Peso médio da carcaça = média ponderada do peso vivo × 0,84 (rendimento fixo de 84%).</li>
        <li>Água usada (L) = (Hidr. Atual − Hidr. Anterior) × 1000 + Gelo Adicionado.</li>
        <li>Renovação apurada (L/ave) = água usada ÷ Aves no Período. Conforme quando a renovação apurada é maior ou igual à meta.</li>
        <li>Metas por faixa de peso da carcaça (≤ 2,5 kg / ≤ 5,0 kg / &gt; 5,0 kg): Pré-chiller 1,5 / 1,7 / 2,2 · Chiller 01 1,1 / 1,6 / 2,1 · Chiller 02 1,0 / 1,5 / 2,0.</li>
      </LogicaCalculo>
    </div>
  );
}
