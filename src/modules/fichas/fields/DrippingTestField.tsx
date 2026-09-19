import { useState } from "react";
import { Droplet, Save, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { AmostraDrippingTest, DrippingTestValor } from "./tiposCompostos";

const CHAVE_RASCUNHO = "@globopac:dripping_test_draft";
const LIMITE_PERCENTUAL = 6.0;

function amostrasIniciais(): AmostraDrippingTest[] {
  return Array.from({ length: 6 }, (_, i) => ({ id: i, seal: "", m0: "", m1: "", m3: "", horaRetirada: "", m2: "" }));
}

interface Rascunho {
  items: AmostraDrippingTest[];
  lote: string;
  horaInicio: string;
  data: string;
}

function carregarRascunho(): Rascunho | null {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    if (!bruto) return null;
    const parsed = JSON.parse(bruto) as Rascunho;
    if (parsed.data !== new Date().toLocaleDateString()) {
      localStorage.removeItem(CHAVE_RASCUNHO);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Tempo mínimo de drenagem (minutos) exigido conforme o peso bruto congelado (M0, gramas) —
 * portado literalmente do v1 (DrippingTestField.jsx, Portaria 210/1998). */
function tempoImersaoMinimo(m0: number): number | null {
  if (!m0 || isNaN(m0)) return null;
  const faixas: [number, number][] = [
    [800, 65],
    [900, 72],
    [1000, 78],
    [1100, 85],
    [1200, 91],
    [1300, 98],
    [1400, 105],
    [1500, 112],
    [1600, 119],
    [1700, 126],
    [1800, 133],
    [1900, 140],
    [2000, 147],
    [2100, 154],
    [2200, 161],
    [2300, 168],
  ];
  for (const [limite, minutos] of faixas) {
    if (m0 <= limite) return minutos;
  }
  const excesso = m0 - 2300;
  const passos = Math.ceil(excesso / 100);
  return 168 + passos * 7;
}

function paraMinutos(horaTexto: string): number {
  if (!horaTexto) return 0;
  const partes = horaTexto.split(":");
  return Number(partes[0]) * 60 + Number(partes[1]);
}

interface DrippingTestFieldProps {
  value: DrippingTestValor | undefined;
  onChange: (valor: DrippingTestValor) => void;
  disabled?: boolean;
}

/** Dripping Test — Portaria 210/1998 (Especial SIF). Porte do v1 (DrippingTestField.jsx):
 * amostragem de 6 carcaças, fórmula (M0-M1-M2)/(M0-M1-M3)*100%, limite de 6% de absorção
 * média + tempo mínimo de drenagem conforme peso bruto congelado. */
export function DrippingTestField({ value, onChange, disabled }: DrippingTestFieldProps) {
  const rascunho = value ? null : carregarRascunho();
  const [items, setItems] = useState<AmostraDrippingTest[]>(value?.items ?? rascunho?.items ?? amostrasIniciais());
  const [lote, setLote] = useState(value?.lote ?? rascunho?.lote ?? "");
  const [horaInicio, setHoraInicio] = useState(value?.horaInicio ?? rascunho?.horaInicio ?? "");
  const [mensagemRascunho, setMensagemRascunho] = useState(false);

  function disparar(novosItems: AmostraDrippingTest[], novoLote: string, novaHora: string) {
    let somaAbsorcoes = 0;
    let validas = 0;
    let temNaoConformidadeTempo = false;
    const inicioMin = paraMinutos(novaHora);

    const itemsComFlag = novosItems.map((item) => {
      const m0 = parseFloat(item.m0);
      const m1 = parseFloat(item.m1);
      const m3 = parseFloat(item.m3);
      const m2 = parseFloat(item.m2);

      if (!isNaN(m0) && !isNaN(m1) && !isNaN(m3) && !isNaN(m2) && m0 - m1 - m3 > 0) {
        somaAbsorcoes += ((m0 - m1 - m2) / (m0 - m1 - m3)) * 100;
        validas++;
      }

      let timeNc = false;
      if (novaHora && item.horaRetirada && !isNaN(m0)) {
        const fimMin = paraMinutos(item.horaRetirada);
        let diff = fimMin - inicioMin;
        if (diff < 0) diff += 24 * 60;
        const minimoExigido = tempoImersaoMinimo(m0);
        if (minimoExigido !== null && diff < minimoExigido) {
          timeNc = true;
          temNaoConformidadeTempo = true;
        }
      }
      return { ...item, timeNc };
    });

    const mediaPercentual = validas > 0 ? somaAbsorcoes / validas : 0;
    const limiteExcedido = validas > 0 && mediaPercentual > LIMITE_PERCENTUAL;
    const status: DrippingTestValor["status"] = limiteExcedido || temNaoConformidadeTempo ? "nao-conforme" : "conforme";

    setItems(itemsComFlag);
    onChange({ items: itemsComFlag, lote: novoLote, horaInicio: novaHora, status, averagePercentage: mediaPercentual, validCount: validas, timeNonConformity: temNaoConformidadeTempo });
  }

  function alterarItem(indice: number, campo: keyof AmostraDrippingTest, valor: string) {
    disparar(
      items.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
      lote,
      horaInicio
    );
  }

  function salvarRascunho() {
    const dados: Rascunho = { items, lote, horaInicio, data: new Date().toLocaleDateString() };
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(dados));
    setMensagemRascunho(true);
    setTimeout(() => setMensagemRascunho(false), 4000);
  }

  function limparRascunho() {
    if (!window.confirm("Tem certeza que deseja apagar os dados parciais desta ficha?")) return;
    localStorage.removeItem(CHAVE_RASCUNHO);
    const vazio = amostrasIniciais();
    setItems(vazio);
    setLote("");
    setHoraInicio("");
    disparar(vazio, "", "");
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-col gap-4 border-b bg-primary/5 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <Droplet className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold">Dripping Test (Portaria 210/1998)</h4>
            <p className="text-xs text-muted-foreground">Amostragem: 6 carcaças. Limite de absorção: 6,00%</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border bg-background p-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Lote</Label>
            <Input className="h-8 w-32 text-xs" value={lote} onChange={(e) => { setLote(e.target.value); disparar(items, e.target.value, horaInicio); }} disabled={disabled} placeholder="Lote do teste" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Hora Início</Label>
            <Input
              className="h-8 w-24 text-xs font-bold"
              type="time"
              value={horaInicio}
              onChange={(e) => { setHoraInicio(e.target.value); disparar(items, lote, e.target.value); }}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <p className="border-b bg-muted/40 p-2 text-center text-[10px] font-bold uppercase text-muted-foreground">
        Fórmula: (M0 - M1 - M2) / (M0 - M1 - M3) × 100%
      </p>

      <div className="overflow-x-auto">
        <div className="grid min-w-[750px] gap-2 p-4">
          <div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase text-muted-foreground">
            <span className="w-8 shrink-0 text-center">Nº</span>
            <span className="min-w-[50px] flex-[1.5]">Lacre</span>
            <span className="min-w-[60px] flex-[1.2]" title="Peso Bruto Congelado">M0 (g)</span>
            <span className="min-w-[60px] flex-[1.2]" title="Embalagem Primária">M1 (g)</span>
            <span className="min-w-[60px] flex-[1.2]" title="Miúdos">M3 (g)</span>
            <span className="w-20 shrink-0 rounded px-1 text-center text-warning-foreground">Retirada</span>
            <span className="min-w-[60px] flex-[1.2] rounded px-1 text-center text-warning-foreground" title="Peso Drenado">M2 (g)</span>
            <span className="w-16 shrink-0 text-right">Absorção</span>
          </div>

          {items.map((item, i) => {
            const m0 = parseFloat(item.m0);
            const m1 = parseFloat(item.m1);
            const m3 = parseFloat(item.m3);
            const m2 = parseFloat(item.m2);
            let absorcao: number | null = null;
            if (!isNaN(m0) && !isNaN(m1) && !isNaN(m3) && !isNaN(m2) && m0 - m1 - m3 > 0) {
              absorcao = ((m0 - m1 - m2) / (m0 - m1 - m3)) * 100;
            }
            const minimoExigido = tempoImersaoMinimo(m0);

            return (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
                <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                <Input className="h-8 min-w-[50px] flex-[1.5] text-xs" value={item.seal} onChange={(e) => alterarItem(i, "seal", e.target.value)} disabled={disabled} placeholder="Lacre" />
                <div className="relative min-w-[60px] flex-[1.2]">
                  <Input className="h-8 font-mono text-xs" type="number" step="0.01" value={item.m0} onChange={(e) => alterarItem(i, "m0", e.target.value)} disabled={disabled} placeholder="M0" />
                  {minimoExigido !== null && (
                    <span className="pointer-events-none absolute -bottom-3.5 left-0 w-full text-center text-[9px] font-bold text-primary">{minimoExigido}min</span>
                  )}
                </div>
                <Input className="h-8 min-w-[60px] flex-[1.2] font-mono text-xs" type="number" step="0.01" value={item.m1} onChange={(e) => alterarItem(i, "m1", e.target.value)} disabled={disabled} placeholder="M1" />
                <Input className="h-8 min-w-[60px] flex-[1.2] font-mono text-xs" type="number" step="0.01" value={item.m3} onChange={(e) => alterarItem(i, "m3", e.target.value)} disabled={disabled} placeholder="M3" />
                <Input
                  className={`h-8 w-20 shrink-0 text-[10px] font-bold ${item.timeNc ? "border-destructive bg-destructive/10 text-destructive" : ""}`}
                  type="time"
                  value={item.horaRetirada}
                  onChange={(e) => alterarItem(i, "horaRetirada", e.target.value)}
                  disabled={disabled}
                />
                <Input className="h-8 min-w-[60px] flex-[1.2] font-mono text-xs" type="number" step="0.01" value={item.m2} onChange={(e) => alterarItem(i, "m2", e.target.value)} disabled={disabled} placeholder="M2" />
                <span className={`w-16 shrink-0 text-right font-mono text-xs font-bold ${absorcao !== null && absorcao > 6 ? "text-destructive" : absorcao !== null ? "text-success" : "text-muted-foreground"}`}>
                  {absorcao !== null ? `${absorcao.toFixed(2)}%` : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {value && value.validCount > 0 && (
        <div
          className="m-4 rounded-lg border-2 p-4"
          style={{ background: value.status === "nao-conforme" ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)", borderColor: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
                Média Oficial ({value.validCount}/6 válidas)
              </p>
              <p className="font-mono text-3xl font-black" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
                {value.averagePercentage.toFixed(2)}%
              </p>
            </div>
            {value.status === "nao-conforme" && (
              <p className="flex items-center gap-2 rounded-full bg-destructive/20 px-3 py-1.5 font-bold text-destructive">
                <ShieldAlert className="h-4 w-4" />
                {value.averagePercentage > LIMITE_PERCENTUAL && value.timeNonConformity
                  ? "ACIMA DE 6% E TEMPO INFERIOR"
                  : value.averagePercentage > LIMITE_PERCENTUAL
                    ? "ACIMA DE 6%"
                    : "TEMPO INFERIOR À META"}
              </p>
            )}
          </div>
        </div>
      )}

      {!disabled && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={salvarRascunho}>
              <Save className="h-4 w-4" /> Salvar Dados da Fase 1
            </Button>
            <Button type="button" variant="outline" className="text-destructive" onClick={limparRascunho} title="Descartar Teste">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {mensagemRascunho && (
            <p className="rounded border border-success bg-success/10 p-2 text-center text-xs font-bold text-success">
              Dados da Fase 1 salvos no dispositivo! Você pode fechar a tela e retornar depois para preencher a Fase 2.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
