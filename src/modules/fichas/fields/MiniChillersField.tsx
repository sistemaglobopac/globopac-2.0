import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, LIMIAR_IMPLAUSIVEL, parseHidrometro, parseNumeroHidrometro } from "./hidrometro";
import type { ChillerCarcacasValor, MiniChillersValor, TanqueHidrometro } from "./tiposCompostos";

type ChaveMiudo = "coracao" | "moela" | "figado" | "cabeca" | "pes";

/** Tabela de pesos (kg) por faixa de peso médio de carcaça — portada literalmente do v1
 * (MiniChillersField.jsx). Não é um limiar inventado por este projeto. */
const TABELA_PESO: { maxCarcaca: number; coracao: number; moela: number; figado: number; cabeca: number; pes: number }[] = [
  { maxCarcaca: 1.199, coracao: 0.006, moela: 0.023, figado: 0.03, cabeca: 0.037, pes: 0.065 },
  { maxCarcaca: 1.599, coracao: 0.007, moela: 0.025, figado: 0.032, cabeca: 0.039, pes: 0.066 },
  { maxCarcaca: 1.799, coracao: 0.007, moela: 0.028, figado: 0.034, cabeca: 0.04, pes: 0.068 },
  { maxCarcaca: 1.899, coracao: 0.008, moela: 0.028, figado: 0.035, cabeca: 0.044, pes: 0.07 },
  { maxCarcaca: 2.1, coracao: 0.01, moela: 0.028, figado: 0.035, cabeca: 0.048, pes: 0.07 },
  { maxCarcaca: 2.25, coracao: 0.01, moela: 0.03, figado: 0.036, cabeca: 0.05, pes: 0.075 },
  { maxCarcaca: 2.35, coracao: 0.011, moela: 0.03, figado: 0.038, cabeca: 0.051, pes: 0.077 },
  { maxCarcaca: 2.45, coracao: 0.011, moela: 0.031, figado: 0.039, cabeca: 0.053, pes: 0.082 },
  { maxCarcaca: 2.75, coracao: 0.011, moela: 0.032, figado: 0.041, cabeca: 0.054, pes: 0.084 },
  { maxCarcaca: Infinity, coracao: 0.012, moela: 0.033, figado: 0.042, cabeca: 0.058, pes: 0.097 },
];

function pesosPorCarcaca(pesoCarcaca: number) {
  for (const linha of TABELA_PESO) {
    if (pesoCarcaca <= linha.maxCarcaca) return linha;
  }
  return TABELA_PESO[TABELA_PESO.length - 1]!;
}

const CONFIG_PARTE: Record<ChaveMiudo, { nome: string; cor: string }> = {
  coracao: { nome: "Coração", cor: "#dc2626" },
  moela: { nome: "Moela", cor: "#d97706" },
  figado: { nome: "Fígado", cor: "#db2777" },
  cabeca: { nome: "Cabeça", cor: "#002060" },
  pes: { nome: "Pés", cor: "#059669" },
};

const META_L_KG = 1.5;

function tanqueVazio(prev: string): TanqueHidrometro {
  return { prev, cur: "", ice: "332" };
}

function apuracao(tanque: TanqueHidrometro, numAves: number, pesoCarcaca: number, pesoUnitario: number): number | null {
  const prev = parseNumeroHidrometro(tanque.prev);
  const cur = parseNumeroHidrometro(tanque.cur);
  const gelo = parseNumeroHidrometro(tanque.ice);
  if (cur === 0) return 0;
  if (numAves === 0 || pesoCarcaca === 0) return null;
  const aguaUsadaLitros = (cur - prev) * 1000 + gelo;
  const kgProduto = numAves * pesoUnitario;
  return aguaUsadaLitros / kgProduto;
}

interface MiniChillersFieldProps {
  value: MiniChillersValor | undefined;
  onChange: (valor: MiniChillersValor) => void;
  disabled?: boolean;
  prevAppointment?: MiniChillersValor;
  carcacasAtual: ChillerCarcacasValor | undefined;
}

/** Renovação da Água dos Mini-Chillers de Miúdos — porte do v1 (MiniChillersField.jsx). Aves
 * no período e peso médio de carcaça herdados ao vivo do SPR Carcaças da mesma ficha; peso
 * unitário de cada miúdo vem da Tabela DE-PARA. Meta: 1,5 L/kg em cada um dos 5 miúdos. */
export function MiniChillersField({ value, onChange, disabled, prevAppointment, carcacasAtual }: MiniChillersFieldProps) {
  const [tanques, setTanques] = useState({
    coracao: value?.tanques.coracao ?? tanqueVazio(prevAppointment?.tanques.coracao.cur ?? ""),
    moela: value?.tanques.moela ?? tanqueVazio(prevAppointment?.tanques.moela.cur ?? ""),
    figado: value?.tanques.figado ?? tanqueVazio(prevAppointment?.tanques.figado.cur ?? ""),
    cabeca: value?.tanques.cabeca ?? tanqueVazio(prevAppointment?.tanques.cabeca.cur ?? ""),
    pes: value?.tanques.pes ?? tanqueVazio(prevAppointment?.tanques.pes.cur ?? ""),
  });
  const [prevTravado, setPrevTravado] = useState({
    coracao: !!(value?.tanques.coracao.prev || prevAppointment?.tanques.coracao.cur),
    moela: !!(value?.tanques.moela.prev || prevAppointment?.tanques.moela.cur),
    figado: !!(value?.tanques.figado.prev || prevAppointment?.tanques.figado.cur),
    cabeca: !!(value?.tanques.cabeca.prev || prevAppointment?.tanques.cabeca.cur),
    pes: !!(value?.tanques.pes.prev || prevAppointment?.tanques.pes.cur),
  });
  const isPrimeiroDoDia = !Object.values(prevTravado).some(Boolean);

  useEffect(() => {
    if (!prevAppointment) return;
    setTanques((atual) => {
      const novo = { ...atual };
      (Object.keys(novo) as ChaveMiudo[]).forEach((chave) => {
        novo[chave] = { ...novo[chave], prev: novo[chave].prev || prevAppointment.tanques[chave].cur };
      });
      return novo;
    });
    setPrevTravado((atual) => {
      const novo = { ...atual };
      (Object.keys(novo) as ChaveMiudo[]).forEach((chave) => {
        novo[chave] = novo[chave] || !!prevAppointment.tanques[chave].cur;
      });
      return novo;
    });
  }, [prevAppointment]);

  const numAves = carcacasAtual?.totalAves ?? 0;
  const pesoCarcaca = carcacasAtual?.pesoMedioCarcaca ?? 0;
  const pesos = pesosPorCarcaca(pesoCarcaca);
  const avesIndisponivel = !isPrimeiroDoDia && !numAves;
  const pesoMiudoIndisponivel = !isPrimeiroDoDia && !pesoCarcaca;

  const apurado: Record<ChaveMiudo, number | null> = {
    coracao: apuracao(tanques.coracao, numAves, pesoCarcaca, pesos.coracao),
    moela: apuracao(tanques.moela, numAves, pesoCarcaca, pesos.moela),
    figado: apuracao(tanques.figado, numAves, pesoCarcaca, pesos.figado),
    cabeca: apuracao(tanques.cabeca, numAves, pesoCarcaca, pesos.cabeca),
    pes: apuracao(tanques.pes, numAves, pesoCarcaca, pesos.pes),
  };
  const hasCurData = Object.values(tanques).some((t) => !!t.cur);
  const conformeParte = (chave: ChaveMiudo) => {
    if (!tanques[chave].cur) return true;
    if (numAves === 0 || pesoCarcaca === 0) return true;
    return (apurado[chave] ?? 0) >= META_L_KG;
  };
  const conf: Record<ChaveMiudo, boolean> = {
    coracao: conformeParte("coracao"),
    moela: conformeParte("moela"),
    figado: conformeParte("figado"),
    cabeca: conformeParte("cabeca"),
    pes: conformeParte("pes"),
  };
  const isConforme = !hasCurData || Object.values(conf).every(Boolean);

  useEffect(() => {
    const rotulos: Record<ChaveMiudo, string> = { coracao: "Coração", moela: "Moela", figado: "Fígado", cabeca: "Cabeça", pes: "Pés" };
    const detalhes: string[] = [];
    (Object.keys(conf) as ChaveMiudo[]).forEach((chave) => {
      if (!conf[chave] && numAves > 0) detalhes.push(`${rotulos[chave]} (Apurado: ${(apurado[chave] ?? 0).toFixed(3)}L/kg | Meta: ${META_L_KG}L/kg)`);
    });

    onChange({
      tanques,
      totalAves: numAves,
      pesoCarcaca,
      avesIndisponivel,
      pesoMiudoIndisponivel,
      conformidade: isConforme,
      detalhesRNC: detalhes.length > 0 ? `Vazão Insuficiente (Mini-Chillers): ${detalhes.join("; ")}` : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanques, numAves, pesoCarcaca, isConforme, avesIndisponivel, pesoMiudoIndisponivel]);

  function alterarTanque(chave: ChaveMiudo, campo: keyof TanqueHidrometro, valor: string) {
    setTanques((atual) => ({ ...atual, [chave]: { ...atual[chave], [campo]: valor } }));
  }

  function renderParte(chave: ChaveMiudo) {
    const { nome, cor } = CONFIG_PARTE[chave];
    const tanque = tanques[chave];
    const valorApurado = apurado[chave];
    const pesoUnitario = pesos[chave];
    const temResultado = numAves > 0 && pesoCarcaca > 0 && !!tanque.cur;
    const naoConforme = !!tanque.cur && numAves > 0 && pesoCarcaca > 0 && (valorApurado ?? 0) < META_L_KG;
    const implausivel = !!tanque.cur && numAves > 0 && pesoCarcaca > 0 && (valorApurado ?? 0) > META_L_KG * LIMIAR_IMPLAUSIVEL;
    const kgProduto = numAves * pesoUnitario;

    return (
      <div key={chave} className="overflow-hidden rounded-lg border-2" style={{ borderColor: naoConforme ? "#dc2626" : `${cor}40` }}>
        <div className="flex items-center justify-between px-3 py-2 text-sm font-black text-white" style={{ background: cor }}>
          {nome.toUpperCase()}
          {numAves > 0 && <span className="text-xs opacity-90">Meta: {META_L_KG.toFixed(3)} L/kg</span>}
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
            className="rounded-md border p-2"
            style={{
              background: !temResultado ? undefined : naoConforme ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)",
              borderColor: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                VAZÃO APURADA
              </span>
              <span className="text-sm font-black" style={{ color: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669" }}>
                {temResultado ? `${formatMaskedValue((valorApurado ?? 0).toFixed(3))} L/kg` : "—"}
              </span>
            </div>
            {temResultado && (
              <p className="mt-1 text-xs font-bold" style={{ color: naoConforme ? "#b91c1c" : "#059669" }}>
                Base: {kgProduto.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg ({pesoUnitario} kg/un)
              </p>
            )}
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
        <div className="flex gap-6 text-right">
          {numAves > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground">Aves no Período</p>
              <p className="text-lg font-black">{numAves.toLocaleString("pt-BR")} aves</p>
            </div>
          )}
          {pesoCarcaca > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground">Peso Médio (Est.)</p>
              <p className="text-lg font-black">{pesoCarcaca.toFixed(3)} kg</p>
            </div>
          )}
        </div>
      </div>

      {avesIndisponivel && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>Preencha primeiro o "Renovação da Água do SPR Carcaças":</strong> a Quantidade de Aves no Período vem de lá.
          </span>
        </div>
      )}
      {pesoMiudoIndisponivel && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>Preencha primeiro o "Renovação da Água do SPR Carcaças":</strong> o Peso do Miúdo (Tabela DE-PARA) depende da Média Carcaça
            calculada lá.
          </span>
        </div>
      )}
      {!isConforme && !disabled && (
        <div className="flex items-center gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-3">
          <AlertTriangle className="h-8 w-8 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-bold text-destructive">DESVIO DE VAZÃO REGISTRADO</p>
            <p className="text-xs text-muted-foreground">Consumo de água inferior a 1,5 L/kg de produto processado em um dos tanques.</p>
          </div>
        </div>
      )}
      {isPrimeiroDoDia && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong>Primeiro monitoramento do dia:</strong> informe apenas a leitura atual de cada hidrômetro.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(CONFIG_PARTE) as ChaveMiudo[]).map(renderParte)}
      </div>
    </div>
  );
}
