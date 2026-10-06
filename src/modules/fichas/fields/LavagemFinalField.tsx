import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, leituraHerdada, LIMIAR_IMPLAUSIVEL, parseHidrometro } from "./hidrometro";
import { apurar, avesNoChuveiro, detalheDesvio, META_L_CARCACA } from "./calculosSpr";
import { AvisoImplausivel, AvisoPrimeiroDoDia, CampoBloqueado, LogicaCalculo, TOOLTIP_HIDR_ANTERIOR } from "./componentesSpr";
import type { ChillerCarcacasValor, LavagemFinalValor } from "./tiposCompostos";

interface LavagemFinalFieldProps {
  value: LavagemFinalValor | undefined;
  onChange: (valor: LavagemFinalValor) => void;
  disabled?: boolean;
  prevAppointment?: LavagemFinalValor;
  carcacasAtual: ChillerCarcacasValor | undefined;
}

/** Vazão do Chuveiro Final de Lavagem de Carcaças — SEM gelo. Base: total de aves BRUTO e
 * carcaças totalmente condenadas vêm bloqueados, ao vivo, do SPR Carcaças da mesma ficha; as
 * carcaças parcialmente condenadas são digitadas AQUI (não vêm do SPR Carcaças). Meta: 1,5
 * L/carcaça. */
export function LavagemFinalField({ value, onChange, disabled, prevAppointment, carcacasAtual }: LavagemFinalFieldProps) {
  const [condenacoesParciais, setCondenacoesParciais] = useState(value?.condenacoesParciais ?? "");
  const [chuveiro, setChuveiro] = useState<{ prev: string; cur: string }>({
    prev: value?.chuveiro?.prev ?? leituraHerdada(prevAppointment?.chuveiro),
    cur: value?.chuveiro.cur ?? "",
  });
  const [prevTravado, setPrevTravado] = useState(!!(value?.chuveiro?.prev || leituraHerdada(prevAppointment?.chuveiro)));

  useEffect(() => {
    if (!prevAppointment) return;
    setChuveiro((atual) => ({ ...atual, prev: atual.prev || leituraHerdada(prevAppointment?.chuveiro) }));
    if (leituraHerdada(prevAppointment?.chuveiro)) setPrevTravado(true);
  }, [prevAppointment]);

  const totalAvesBruto = carcacasAtual?.totalAvesBruto ?? 0;
  const condenasTotalSPR = parseFloat(carcacasAtual?.condenasTotal ?? "") || 0;
  const condenacoesParciaisNum = parseFloat(condenacoesParciais) || 0;
  const totalAves = avesNoChuveiro(totalAvesBruto, condenasTotalSPR, condenacoesParciaisNum);
  // Só bloqueia fora do 1º monitoramento do dia.
  const avesIndisponivel = prevTravado && !totalAvesBruto;

  const valorApurado = apurar(chuveiro.prev, chuveiro.cur, 0, totalAves); // sem gelo
  const hasCurData = !!chuveiro.cur;
  const confChuveiro = !chuveiro.cur ? true : totalAves === 0 ? true : (valorApurado ?? 0) >= META_L_CARCACA;
  const isConforme = !hasCurData || confChuveiro;
  const naoConforme = !!chuveiro.cur && totalAves > 0 && (valorApurado ?? 0) < META_L_CARCACA;
  const implausivel = !!chuveiro.cur && totalAves > 0 && (valorApurado ?? 0) > META_L_CARCACA * LIMIAR_IMPLAUSIVEL;
  const temResultado = totalAves > 0 && !!chuveiro.cur;

  useEffect(() => {
    const detalhes: string[] = [];
    if (!confChuveiro && totalAves > 0) {
      detalhes.push(detalheDesvio("Chuveiro Final", valorApurado ?? 0, META_L_CARCACA, "L/carcaça"));
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
            <CampoBloqueado rotulo="Total de Aves" valor={totalAvesBruto.toLocaleString("pt-BR")} />
            <CampoBloqueado rotulo="Carcaças Totalmente Condenadas" valor={condenasTotalSPR.toLocaleString("pt-BR")} />
            <div className="min-w-[140px] flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Parcialmente Condenadas (Un)</Label>
              <Input
                inputMode="numeric"
                disabled={disabled}
                value={condenacoesParciais}
                onChange={(e) => setCondenacoesParciais(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex: 30"
              />
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
        <AvisoPrimeiroDoDia />
      )}

      <div className="overflow-hidden rounded-lg border-2" style={{ borderColor: naoConforme ? "#dc2626" : "hsl(var(--primary) / 0.25)" }}>
        <div className="flex flex-wrap gap-2 items-center justify-between bg-primary px-3 py-2 text-sm font-black text-primary-foreground">
          CHUVEIRO FINAL
          {totalAves > 0 && <span className="text-xs opacity-90">Meta: {formatMaskedValue(META_L_CARCACA.toFixed(3))} L/carcaça</span>}
        </div>
        <div className="space-y-3 p-4">
          <div className={`grid gap-3 ${!prevTravado ? "grid-cols-1" : "sm:grid-cols-2"}`}>
            {prevTravado && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Hidr. Anterior (m³) <Lock className="h-3 w-3" />
                </Label>
                <Input disabled readOnly title={TOOLTIP_HIDR_ANTERIOR} value={formatHidrometro(chuveiro.prev)} className="font-mono" placeholder="Ex: 3718,72" />
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
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <span className="text-xs font-bold" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                VAZÃO APURADA
              </span>
              <span className="text-lg font-black" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                {temResultado ? `${formatMaskedValue((valorApurado ?? 0).toFixed(3))} L/carcaça` : "—"}
              </span>
            </div>
            {naoConforme && temResultado && (
              <p className="mt-1 text-xs font-bold text-destructive">ABAIXO DO MÍNIMO ({formatMaskedValue(META_L_CARCACA.toFixed(3))} L/carcaça)</p>
            )}
          </div>

          {implausivel && <AvisoImplausivel apurado={valorApurado ?? 0} meta={META_L_CARCACA} />}
        </div>
      </div>

      <LogicaCalculo titulo="Chuveiro Final">
        <li>Aves no Chuveiro Final = total de aves bruto (SPR Carcaças) − (carcaças totalmente condenadas (SPR Carcaças) + carcaças parcialmente condenadas informadas aqui).</li>
        <li>Água usada (L) = (Hidr. Atual − Hidr. Anterior) × 1000. Não há gelo neste ponto.</li>
        <li>Vazão apurada (L/carcaça) = água usada ÷ Aves no Chuveiro Final. Meta fixa: maior ou igual a 1,5 L/carcaça.</li>
      </LogicaCalculo>
    </div>
  );
}
