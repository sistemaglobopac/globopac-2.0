import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, LIMIAR_IMPLAUSIVEL, parseHidrometro, parseNumeroHidrometro } from "./hidrometro";
import type { CargaProcessada, ChillerCarcacasValor, TanqueHidrometro } from "./tiposCompostos";

type ChaveTanque = "preChiller" | "chiller1" | "chiller2";

const CONFIG_TANQUE: Record<ChaveTanque, { nome: string; cor: string }> = {
  preChiller: { nome: "Pré-chiller", cor: "#002060" },
  chiller1: { nome: "Chiller 01", cor: "#059669" },
  chiller2: { nome: "Chiller 02 (Último)", cor: "#002060" },
};

/** Meta legal de renovação (L/carcaça) por tanque, em função do peso médio da carcaça —
 * portado literalmente de ChillerField.jsx (v1). Não é um limiar inventado por este projeto. */
function metaTanque(tanque: ChaveTanque, pesoCarcaca: number): number {
  if (pesoCarcaca === 0) return 0;
  if (tanque === "preChiller") return pesoCarcaca <= 2.5 ? 1.5 : pesoCarcaca <= 5.0 ? 1.7 : 2.2;
  if (tanque === "chiller1") return pesoCarcaca <= 2.5 ? 1.1 : pesoCarcaca <= 5.0 ? 1.6 : 2.1;
  return pesoCarcaca <= 2.5 ? 1.0 : pesoCarcaca <= 5.0 ? 1.5 : 2.0;
}

function apuracaoTanque(tanque: TanqueHidrometro, totalAvesPeriodo: number): number | null {
  const prev = parseNumeroHidrometro(tanque.prev);
  const cur = parseNumeroHidrometro(tanque.cur);
  const gelo = parseNumeroHidrometro(tanque.ice);
  if (cur === 0) return 0;
  const aguaUsada = (cur - prev) * 1000 + gelo;
  if (totalAvesPeriodo === 0) return null;
  return aguaUsada / totalAvesPeriodo;
}

// Gelo padrão (kg) por tanque ao abrir um monitoramento — portado literalmente de
// ChillerField.jsx (v1). São os valores calibrados de cada tanque físico desta planta, não
// um placeholder: por isso diferem entre si (Chiller 01 é maior que o Pré-chiller, que por
// sua vez é maior que o Chiller 02) em vez de um único valor genérico para os três.
const GELO_PADRAO: Record<ChaveTanque, string> = {
  preChiller: "1995",
  chiller1: "2394",
  chiller2: "1596",
};

function tanqueVazio(tanque: ChaveTanque, prev: string): TanqueHidrometro {
  return { prev, cur: "", ice: GELO_PADRAO[tanque] };
}

interface ChillerCarcacasFieldProps {
  value: ChillerCarcacasValor | undefined;
  onChange: (valor: ChillerCarcacasValor) => void;
  disabled?: boolean;
  /** dados_dinamicos[chave] do monitoramento mais recente de HOJE desta ficha+setor — a
   * leitura "atual" de lá vira a leitura "anterior" (travada) deste apontamento. */
  prevAppointment?: ChillerCarcacasValor;
}

/** Renovação da Água do SPR Carcaças — porte do v1 (ChillerField.jsx) para o catálogo
 * `chiller_carcacas` do Construtor de Fichas. Mesma lógica de cálculo (metas por faixa de
 * peso, aves no período = cargas − condenas, apuração L/carcaça); só o vínculo com
 * conformidade/RNC muda: aqui o widget só EXIBE o desvio (badge, alerta) — quem decide
 * `monitoramentos.conformidade` continua sendo o Verificador depois, como já funciona no
 * resto do v2 (segregação de funções, `trg_segregacao_funcoes`). */
export function ChillerCarcacasField({ value, onChange, disabled, prevAppointment }: ChillerCarcacasFieldProps) {
  const [cargas, setCargas] = useState<CargaProcessada[]>(value?.cargas ?? [{ id: crypto.randomUUID(), quantity: "", avgLiveWeight: "" }]);
  const [condenasParcial, setCondenasParcial] = useState(value?.condenasParcial ?? "");
  const [condenasTotal, setCondenasTotal] = useState(value?.condenasTotal ?? "");
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

  // Primeiro monitoramento do dia (nenhum tanque tem leitura anterior para herdar): não faz
  // sentido pedir cargas processadas, leitura anterior nem gelo — só a leitura atual, que
  // vira a base para o próximo monitoramento comparar.
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

  const totalAves = cargas.reduce((soma, c) => soma + (parseFloat(c.quantity) || 0), 0);
  const totalPesoAves = cargas.reduce((soma, c) => soma + (parseFloat(c.quantity) || 0) * (parseFloat(c.avgLiveWeight) || 0), 0);
  const pesoMedioVivo = totalAves > 0 ? totalPesoAves / totalAves : 0;
  const pesoMedioCarcaca = pesoMedioVivo * 0.84; // Rendimento padrão de 84%

  const totalCondenasParcial = parseFloat(condenasParcial) || 0;
  const totalCondenasTotalNum = parseFloat(condenasTotal) || 0;
  const totalCondenas = totalCondenasParcial + totalCondenasTotalNum;
  const totalAvesPeriodo = Math.max(0, totalAves - totalCondenas);

  const metas: Record<ChaveTanque, number> = {
    preChiller: metaTanque("preChiller", pesoMedioCarcaca),
    chiller1: metaTanque("chiller1", pesoMedioCarcaca),
    chiller2: metaTanque("chiller2", pesoMedioCarcaca),
  };
  const apurado: Record<ChaveTanque, number | null> = {
    preChiller: apuracaoTanque(tanques.preChiller, totalAvesPeriodo),
    chiller1: apuracaoTanque(tanques.chiller1, totalAvesPeriodo),
    chiller2: apuracaoTanque(tanques.chiller2, totalAvesPeriodo),
  };

  const hasCurData = !!(tanques.preChiller.cur || tanques.chiller1.cur || tanques.chiller2.cur);
  const conformeTanque = (chave: ChaveTanque) =>
    !tanques[chave].cur ? true : totalAvesPeriodo === 0 ? true : (apurado[chave] ?? 0) >= metas[chave];
  const confPreChiller = conformeTanque("preChiller");
  const confChiller1 = conformeTanque("chiller1");
  const confChiller2 = conformeTanque("chiller2");
  const isConforme = !hasCurData || (confPreChiller && confChiller1 && confChiller2);

  useEffect(() => {
    const detalhes: string[] = [];
    if (!confPreChiller && totalAvesPeriodo > 0) {
      detalhes.push(`Pré-chiller (Apurado: ${(apurado.preChiller ?? 0).toFixed(3)}L/c | Meta: ${metas.preChiller.toFixed(3)}L/c)`);
    }
    if (!confChiller1 && totalAvesPeriodo > 0) {
      detalhes.push(`Chiller 01 (Apurado: ${(apurado.chiller1 ?? 0).toFixed(3)}L/c | Meta: ${metas.chiller1.toFixed(3)}L/c)`);
    }
    if (!confChiller2 && totalAvesPeriodo > 0) {
      detalhes.push(`Chiller 02 (Apurado: ${(apurado.chiller2 ?? 0).toFixed(3)}L/c | Meta: ${metas.chiller2.toFixed(3)}L/c)`);
    }

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
        <div className="flex items-center justify-between px-3 py-2 text-sm font-black text-white" style={{ background: cor }}>
          {CONFIG_TANQUE[chave].nome.toUpperCase()}
          {totalAves > 0 && <span className="text-xs opacity-90">Meta: {formatMaskedValue(meta.toFixed(3))} L/c</span>}
        </div>
        <div className="space-y-3 p-4">
          <div className={`grid gap-3 ${isPrimeiroDoDia ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {!isPrimeiroDoDia && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Hidr. Anterior (m³) {prevTravado[chave] && <Lock className="h-3 w-3" />}
                </Label>
                <Input
                  disabled={disabled || prevTravado[chave]}
                  title={prevTravado[chave] ? "Herdado do monitoramento anterior — não pode ser alterado" : undefined}
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
              <div className="space-y-1 sm:col-span-2">
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
            <div className="flex items-center justify-between">
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

          {implausivel && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-2 text-xs font-medium text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Valor {((valorApurado ?? 0) / meta).toFixed(0)}x acima da meta — confira a leitura do hidrômetro antes de assinar.
              </span>
            </div>
          )}
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
              <p className="text-lg font-black">{pesoMedioCarcaca.toFixed(3)} kg</p>
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
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-primary">Cargas Processadas no Período</h4>
            <Button type="button" size="sm" variant="outline" onClick={adicionarCarga} disabled={disabled}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Lote
            </Button>
          </div>

          <div className="space-y-2">
            {cargas.map((carga, indice) => (
              <div key={carga.id} className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-end">
                <span className="text-xs font-black text-muted-foreground sm:min-w-[60px]">LOTE {indice + 1}</span>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Aves (un)</Label>
                  <Input
                    type="number"
                    disabled={disabled}
                    value={carga.quantity}
                    onChange={(e) => alterarCarga(carga.id, "quantity", e.target.value)}
                    placeholder="Ex: 4500"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Peso Vivo (kg)</Label>
                  <Input
                    className="font-mono"
                    disabled={disabled}
                    value={carga.avgLiveWeight}
                    onChange={(e) => alterarCarga(carga.id, "avgLiveWeight", e.target.value)}
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
              <Input type="number" disabled={disabled} value={condenasParcial} onChange={(e) => setCondenasParcial(e.target.value)} placeholder="Ex: 40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Totalmente Condenadas</Label>
              <Input type="number" disabled={disabled} value={condenasTotal} onChange={(e) => setCondenasTotal(e.target.value)} placeholder="Ex: 80" />
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
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Primeiro monitoramento do dia:</strong> informe apenas a leitura atual de cada hidrômetro. Cargas processadas e apuração de vazão
            começam no próximo monitoramento.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {renderTanque("preChiller")}
        {renderTanque("chiller1")}
        {renderTanque("chiller2")}
      </div>
    </div>
  );
}
