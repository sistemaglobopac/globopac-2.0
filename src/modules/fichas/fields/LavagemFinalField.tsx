import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, LIMIAR_IMPLAUSIVEL, parseHidrometro, parseNumeroHidrometro } from "./hidrometro";
import type { ChillerCarcacasValor, LavagemFinalValor, TanqueHidrometro } from "./tiposCompostos";

const META_L_CARCACA = 1.5;

interface LavagemFinalFieldProps {
  value: LavagemFinalValor | undefined;
  onChange: (valor: LavagemFinalValor) => void;
  disabled?: boolean;
  prevAppointment?: LavagemFinalValor;
  carcacasAtual: ChillerCarcacasValor | undefined;
}

function apuracao(chuveiro: TanqueHidrometro, totalAves: number): number | null {
  const prev = parseNumeroHidrometro(chuveiro.prev);
  const cur = parseNumeroHidrometro(chuveiro.cur);
  if (cur === 0) return 0;
  const aguaUsada = (cur - prev) * 1000;
  if (totalAves === 0) return null;
  return aguaUsada / totalAves;
}

/** Vazão do Chuveiro Final de Lavagem de Carcaças — porte do v1 (FinalWashField.jsx). Base
 * (Total de Aves e Carcaças Totalmente Condenadas) herdada ao vivo do SPR Carcaças da mesma
 * ficha; Carcaças Parcialmente Condenadas apuradas aqui mesmo. Meta: 1,5 L/carcaça. */
export function LavagemFinalField({ value, onChange, disabled, prevAppointment, carcacasAtual }: LavagemFinalFieldProps) {
  const [condenacoesParciais, setCondenacoesParciais] = useState(value?.condenacoesParciais ?? "");
  const [chuveiro, setChuveiro] = useState<TanqueHidrometro>(
    value?.chuveiro ?? { prev: prevAppointment?.chuveiro.cur ?? "", cur: "", ice: "0" }
  );
  const [prevTravado, setPrevTravado] = useState(!!(value?.chuveiro.prev || prevAppointment?.chuveiro.cur));

  useEffect(() => {
    if (!prevAppointment) return;
    setChuveiro((atual) => ({ ...atual, prev: atual.prev || prevAppointment.chuveiro.cur }));
    if (prevAppointment.chuveiro.cur) setPrevTravado(true);
  }, [prevAppointment]);

  const totalAvesBruto = carcacasAtual?.totalAvesBruto ?? 0;
  const condenasTotalSPR = parseFloat(carcacasAtual?.condenasTotal ?? "") || 0;
  const condenacoesParciaisNum = parseFloat(condenacoesParciais) || 0;
  const totalAves = Math.max(0, totalAvesBruto - (condenasTotalSPR + condenacoesParciaisNum));
  const avesIndisponivel = prevTravado && !totalAvesBruto;

  const valorApurado = apuracao(chuveiro, totalAves);
  const hasCurData = !!chuveiro.cur;
  const confChuveiro = !chuveiro.cur ? true : totalAves === 0 ? true : (valorApurado ?? 0) >= META_L_CARCACA;
  const isConforme = !hasCurData || confChuveiro;
  const naoConforme = !!chuveiro.cur && totalAves > 0 && (valorApurado ?? 0) < META_L_CARCACA;
  const implausivel = !!chuveiro.cur && totalAves > 0 && (valorApurado ?? 0) > META_L_CARCACA * LIMIAR_IMPLAUSIVEL;
  const temResultado = totalAves > 0 && !!chuveiro.cur;

  useEffect(() => {
    const detalhes: string[] = [];
    if (!confChuveiro && totalAves > 0) {
      detalhes.push(`Chuveiro Final (Apurado: ${(valorApurado ?? 0).toFixed(3)}L/carcaça | Meta: ${META_L_CARCACA.toFixed(3)}L/carcaça)`);
    }
    onChange({
      chuveiro,
      condenacoesParciais,
      totalAvesBruto,
      condenasTotalSPR,
      totalAves,
      avesIndisponivel,
      conformidade: isConforme,
      detalhesRNC: detalhes.length > 0 ? `Vazão Insuficiente (Chuveiro Final): ${detalhes.join("; ")}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chuveiro, condenacoesParciais, totalAvesBruto, condenasTotalSPR, isConforme, avesIndisponivel]);

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
          <div className="text-right">
            <p className="text-xs font-bold text-muted-foreground">Aves no Chuveiro Final</p>
            <p className="text-lg font-black">{totalAves.toLocaleString("pt-BR")} un</p>
          </div>
        )}
      </div>

      {avesIndisponivel && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>Preencha primeiro o "Renovação da Água do SPR Carcaças":</strong> o Total de Aves e as Carcaças Totalmente Condenadas vêm de lá.
          </span>
        </div>
      )}
      {!avesIndisponivel && totalAvesBruto > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Total de Aves ({totalAvesBruto.toLocaleString("pt-BR")}) e Carcaças Totalmente Condenadas ({condenasTotalSPR.toLocaleString("pt-BR")}) usados ao vivo</strong>{" "}
            do "Renovação da Água do SPR Carcaças" desta mesma ficha.
          </span>
        </div>
      )}
      {!isConforme && !disabled && (
        <div className="flex items-center gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-3">
          <AlertTriangle className="h-8 w-8 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-destructive">DESVIO DE VAZÃO REGISTRADO</p>
            <p className="text-xs text-muted-foreground">Vazão do chuveiro final abaixo de 1,5 L/carcaça.</p>
          </div>
        </div>
      )}

      {prevTravado ? (
        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
          <h4 className="text-sm font-bold text-primary">Base de Cálculo — Aves no Chuveiro Final</h4>
          <div className="flex flex-wrap items-end gap-4 rounded-md border bg-background p-3">
            <div className="min-w-[140px] flex-1">
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                Total de Aves (SPR Carcaças) <Lock className="h-3 w-3" />
              </Label>
              <p className="py-1 text-lg font-black">{totalAvesBruto.toLocaleString("pt-BR")}</p>
            </div>
            <div className="min-w-[140px] flex-1">
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                Carcaças Totalmente Condenadas (SPR Carcaças) <Lock className="h-3 w-3" />
              </Label>
              <p className="py-1 text-lg font-black">{condenasTotalSPR.toLocaleString("pt-BR")}</p>
            </div>
            <div className="min-w-[140px] flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Parcialmente Condenadas (Un)</Label>
              <Input type="number" disabled={disabled} value={condenacoesParciais} onChange={(e) => setCondenacoesParciais(e.target.value)} placeholder="Ex: 30" />
            </div>
          </div>
          {totalAvesBruto > 0 && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Aves que Passaram pelo Chuveiro Final:</strong> {totalAvesBruto.toLocaleString("pt-BR")} −{" "}
              {condenasTotalSPR.toLocaleString("pt-BR")} − {condenacoesParciaisNum.toLocaleString("pt-BR")} ={" "}
              <strong className="text-primary">{totalAves.toLocaleString("pt-BR")} aves</strong>
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Primeiro monitoramento do dia:</strong> informe apenas a leitura atual do hidrômetro. Volume processado e apuração de vazão
            começam no próximo monitoramento.
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border-2" style={{ borderColor: naoConforme ? "#dc2626" : "hsl(var(--primary) / 0.25)" }}>
        <div className="flex items-center justify-between bg-primary px-3 py-2 text-sm font-black text-primary-foreground">
          CHUVEIRO FINAL
          {totalAves > 0 && <span className="text-xs opacity-90">Meta: {META_L_CARCACA.toFixed(3)} L/carcaça</span>}
        </div>
        <div className="space-y-3 p-4">
          <div className={`grid gap-3 ${!prevTravado ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {prevTravado && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Hidr. Anterior (m³) <Lock className="h-3 w-3" />
                </Label>
                <Input disabled value={formatHidrometro(chuveiro.prev)} className="font-mono" placeholder="Ex: 3718,72" readOnly />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hidr. Atual (m³)</Label>
              <Input
                disabled={disabled}
                value={formatHidrometro(chuveiro.cur)}
                onChange={(e) => setChuveiro((atual) => ({ ...atual, cur: parseHidrometro(e.target.value) }))}
                className="font-mono"
                placeholder="Ex: 3718,72"
              />
            </div>
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
                VAZÃO APURADA
              </span>
              <span className="text-lg font-black" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                {temResultado ? `${formatMaskedValue((valorApurado ?? 0).toFixed(3))} L/carcaça` : "—"}
              </span>
            </div>
            {naoConforme && temResultado && <p className="mt-1 text-xs font-bold text-destructive">ABAIXO DO MÍNIMO ({META_L_CARCACA.toFixed(3)} L/carcaça)</p>}
          </div>

          {implausivel && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-2 text-xs font-medium text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Valor {((valorApurado ?? 0) / META_L_CARCACA).toFixed(0)}x acima da meta — confira a leitura do hidrômetro.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
