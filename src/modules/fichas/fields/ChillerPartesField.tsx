import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, LIMIAR_IMPLAUSIVEL, parseHidrometro, parseNumeroHidrometro } from "./hidrometro";
import type { ChillerCarcacasValor, ChillerPartesValor, TanqueHidrometro } from "./tiposCompostos";

type ChaveTanque = "chiller1" | "chiller2";

const CONFIG_TANQUE: Record<ChaveTanque, { nome: string; cor: string }> = {
  chiller1: { nome: "Chiller 1 Partes", cor: "#059669" },
  chiller2: { nome: "Chiller 2 Partes", cor: "#002060" },
};

const META_L_KG = 1.5;

function tanqueVazio(prev: string): TanqueHidrometro {
  return { prev, cur: "", ice: "332" };
}

function apuracaoTanque(tanque: TanqueHidrometro, totalPesoPartes: number): number | null {
  const prev = parseNumeroHidrometro(tanque.prev);
  const cur = parseNumeroHidrometro(tanque.cur);
  const gelo = parseNumeroHidrometro(tanque.ice);
  if (cur === 0) return 0;
  const aguaUsada = (cur - prev) * 1000 + gelo;
  if (totalPesoPartes === 0) return null;
  return aguaUsada / totalPesoPartes;
}

interface ChillerPartesFieldProps {
  value: ChillerPartesValor | undefined;
  onChange: (valor: ChillerPartesValor) => void;
  disabled?: boolean;
  prevAppointment?: ChillerPartesValor;
  /** Valor ao vivo do campo "Renovação da Água do SPR Carcaças" desta mesma ficha (via
   * useWatch em FichaForm) — não é mais buscado no banco. */
  carcacasAtual: ChillerCarcacasValor | undefined;
}

/** Renovação da Água do Chiller de Partes — porte do v1 (PartsChillerField.jsx). Etapa 1:
 * quilos produzidos = carcaças parcialmente aproveitadas (do SPR Carcaças) × peso médio de
 * carcaça (do SPR Carcaças) × 70%. Etapa 2: renovação = consumo de água ÷ quilos produzidos,
 * meta 1,5 L/kg. */
export function ChillerPartesField({ value, onChange, disabled, prevAppointment, carcacasAtual }: ChillerPartesFieldProps) {
  const [tanques, setTanques] = useState({
    chiller1: value?.tanques.chiller1 ?? tanqueVazio(prevAppointment?.tanques.chiller1.cur ?? ""),
    chiller2: value?.tanques.chiller2 ?? tanqueVazio(prevAppointment?.tanques.chiller2.cur ?? ""),
  });
  const [prevTravado, setPrevTravado] = useState({
    chiller1: !!(value?.tanques.chiller1.prev || prevAppointment?.tanques.chiller1.cur),
    chiller2: !!(value?.tanques.chiller2.prev || prevAppointment?.tanques.chiller2.cur),
  });
  const isPrimeiroDoDia = !prevTravado.chiller1 && !prevTravado.chiller2;

  useEffect(() => {
    if (!prevAppointment) return;
    setTanques((atual) => ({
      chiller1: { ...atual.chiller1, prev: atual.chiller1.prev || prevAppointment.tanques.chiller1.cur },
      chiller2: { ...atual.chiller2, prev: atual.chiller2.prev || prevAppointment.tanques.chiller2.cur },
    }));
    setPrevTravado((atual) => ({
      chiller1: atual.chiller1 || !!prevAppointment.tanques.chiller1.cur,
      chiller2: atual.chiller2 || !!prevAppointment.tanques.chiller2.cur,
    }));
  }, [prevAppointment]);

  const pesoMedioCarcacaAtual = carcacasAtual?.pesoMedioCarcaca || 0;
  const totalCondenacoes = parseFloat(carcacasAtual?.condenasParcial ?? "") || 0;
  const totalPesoPartes = totalCondenacoes * pesoMedioCarcacaAtual * 0.7;

  const apurado: Record<ChaveTanque, number | null> = {
    chiller1: apuracaoTanque(tanques.chiller1, totalPesoPartes),
    chiller2: apuracaoTanque(tanques.chiller2, totalPesoPartes),
  };
  const hasCurData = !!(tanques.chiller1.cur || tanques.chiller2.cur);
  const pesoCarcacaIndisponivel = !isPrimeiroDoDia && !pesoMedioCarcacaAtual;
  const conformeTanque = (chave: ChaveTanque) =>
    !tanques[chave].cur ? true : totalPesoPartes === 0 ? true : (apurado[chave] ?? 0) >= META_L_KG;
  const confChiller1 = conformeTanque("chiller1");
  const confChiller2 = conformeTanque("chiller2");
  const isConforme = !hasCurData || (confChiller1 && confChiller2);

  useEffect(() => {
    const detalhes: string[] = [];
    if (!confChiller1 && totalPesoPartes > 0) detalhes.push(`Chiller 1 Partes (Apurado: ${(apurado.chiller1 ?? 0).toFixed(3)}L/kg | Meta: ${META_L_KG}L/kg)`);
    if (!confChiller2 && totalPesoPartes > 0) detalhes.push(`Chiller 2 Partes (Apurado: ${(apurado.chiller2 ?? 0).toFixed(3)}L/kg | Meta: ${META_L_KG}L/kg)`);

    onChange({
      tanques,
      totalCondenacoes,
      pesoMedioCarcaca: pesoMedioCarcacaAtual,
      pesoCarcacaIndisponivel,
      conformidade: isConforme,
      detalhesRNC: detalhes.length > 0 ? `Vazão Insuficiente (Partes): ${detalhes.join("; ")}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanques, totalCondenacoes, pesoMedioCarcacaAtual, isConforme, pesoCarcacaIndisponivel]);

  function alterarTanque(chave: ChaveTanque, campo: keyof TanqueHidrometro, valor: string) {
    setTanques((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));
  }

  function renderTanque(chave: ChaveTanque) {
    const cor = CONFIG_TANQUE[chave].cor;
    const tanque = tanques[chave];
    const valorApurado = apurado[chave];
    const temResultado = totalPesoPartes > 0 && !!tanque.cur;
    const naoConforme = !!tanque.cur && totalPesoPartes > 0 && (valorApurado ?? 0) < META_L_KG;
    const implausivel = !!tanque.cur && totalPesoPartes > 0 && (valorApurado ?? 0) > META_L_KG * LIMIAR_IMPLAUSIVEL;

    return (
      <div key={chave} className="overflow-hidden rounded-lg border-2" style={{ borderColor: naoConforme ? "#dc2626" : `${cor}40` }}>
        <div className="flex items-center justify-between px-3 py-2 text-sm font-black text-white" style={{ background: cor }}>
          {CONFIG_TANQUE[chave].nome.toUpperCase()}
          <span className="text-xs opacity-90">Meta: {META_L_KG.toFixed(3)} L/kg</span>
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
            className="flex items-center justify-between rounded-md border p-2"
            style={{
              background: !temResultado ? undefined : naoConforme ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)",
              borderColor: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669",
            }}
          >
            <span className="text-xs font-bold" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
              APURADO
            </span>
            <span className="text-sm font-black" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
              {temResultado ? `${formatMaskedValue((valorApurado ?? 0).toFixed(3))} L/kg` : "—"}
            </span>
          </div>

          {implausivel && (
            <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-2 text-xs font-medium text-warning-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Valor {((valorApurado ?? 0) / META_L_KG).toFixed(0)}x acima da meta — confira a leitura do hidrômetro.</span>
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
          <p className="text-xs font-bold uppercase text-muted-foreground">Status de Conformidade — SPR Partes</p>
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
        {totalPesoPartes > 0 && (
          <div className="text-right">
            <p className="text-xs font-bold text-muted-foreground">Massa Processada (70%)</p>
            <p className="text-lg font-black">{totalPesoPartes.toFixed(3)} kg</p>
          </div>
        )}
      </div>

      {pesoCarcacaIndisponivel && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>Preencha primeiro o "Renovação da Água do SPR Carcaças":</strong> a Massa Processada depende do peso médio de carcaça calculado
            lá. A ficha não pode ser assinada até esse valor estar disponível.
          </span>
        </div>
      )}
      {!pesoCarcacaIndisponivel && pesoMedioCarcacaAtual > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Peso Médio de Carcaça ({pesoMedioCarcacaAtual.toFixed(3)} kg) usado ao vivo</strong> do "Renovação da Água do SPR Carcaças" desta
            mesma ficha.
          </span>
        </div>
      )}
      {!isConforme && !disabled && (
        <div className="flex items-center gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-3">
          <AlertTriangle className="h-8 w-8 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-destructive">DESVIO DE VAZÃO REGISTRADO</p>
            <p className="text-xs text-muted-foreground">Renovação de água fora dos padrões legais para o resfriamento de partes.</p>
          </div>
        </div>
      )}

      {isPrimeiroDoDia && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Primeiro monitoramento do dia:</strong> informe apenas a leitura atual de cada hidrômetro. Massa processada e apuração de vazão
            começam no próximo monitoramento.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {renderTanque("chiller1")}
        {renderTanque("chiller2")}
      </div>
    </div>
  );
}
