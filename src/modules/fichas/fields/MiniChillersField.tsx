import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { formatHidrometro, formatMaskedValue, leituraHerdada, LIMIAR_IMPLAUSIVEL, parseHidrometro } from "./hidrometro";
import { apurar, detalheDesvio, GELO_PADRAO_MIUDOS, META_L_KG, pesosMiudosPorCarcaca, type ChaveMiudo } from "./calculosSpr";
import { AvisoImplausivel, AvisoPrimeiroDoDia, CampoBloqueado, LogicaCalculo, TOOLTIP_HIDR_ANTERIOR } from "./componentesSpr";
import type { ChillerCarcacasValor, MiniChillersValor, TanqueHidrometro } from "./tiposCompostos";

const CONFIG_PARTE: Record<ChaveMiudo, { nome: string; cor: string }> = {
  coracao: { nome: "Coração", cor: "#dc2626" },
  moela: { nome: "Moela", cor: "#d97706" },
  figado: { nome: "Fígado", cor: "#db2777" },
  cabeca: { nome: "Cabeça", cor: "#002060" },
  pes: { nome: "Pés", cor: "#059669" },
};

function tanqueVazio(prev: string): TanqueHidrometro {
  return { prev, cur: "", ice: GELO_PADRAO_MIUDOS };
}

interface MiniChillersFieldProps {
  value: MiniChillersValor | undefined;
  onChange: (valor: MiniChillersValor) => void;
  disabled?: boolean;
  prevAppointment?: MiniChillersValor;
  carcacasAtual: ChillerCarcacasValor | undefined;
}

/** Renovação da Água dos Mini-Chillers de Miúdos (coração, moela, fígado, cabeça, pés). Aves no
 * período e peso médio de carcaça vêm BLOQUEADOS, ao vivo, do SPR Carcaças da mesma ficha; o peso
 * unitário de cada miúdo vem da Tabela DE-PARA (calculosSpr.ts). Meta: 1,5 L/kg em cada tanque. */
export function MiniChillersField({ value, onChange, disabled, prevAppointment, carcacasAtual }: MiniChillersFieldProps) {
  const [tanques, setTanques] = useState({
    coracao: value?.tanques?.coracao ?? tanqueVazio(leituraHerdada(prevAppointment?.tanques?.coracao)),
    moela: value?.tanques?.moela ?? tanqueVazio(leituraHerdada(prevAppointment?.tanques?.moela)),
    figado: value?.tanques?.figado ?? tanqueVazio(leituraHerdada(prevAppointment?.tanques?.figado)),
    cabeca: value?.tanques?.cabeca ?? tanqueVazio(leituraHerdada(prevAppointment?.tanques?.cabeca)),
    pes: value?.tanques?.pes ?? tanqueVazio(leituraHerdada(prevAppointment?.tanques?.pes)),
  });
  const [prevTravado, setPrevTravado] = useState({
    coracao: !!(value?.tanques?.coracao?.prev || leituraHerdada(prevAppointment?.tanques?.coracao)),
    moela: !!(value?.tanques?.moela?.prev || leituraHerdada(prevAppointment?.tanques?.moela)),
    figado: !!(value?.tanques?.figado?.prev || leituraHerdada(prevAppointment?.tanques?.figado)),
    cabeca: !!(value?.tanques?.cabeca?.prev || leituraHerdada(prevAppointment?.tanques?.cabeca)),
    pes: !!(value?.tanques?.pes?.prev || leituraHerdada(prevAppointment?.tanques?.pes)),
  });
  const isPrimeiroDoDia = !Object.values(prevTravado).some(Boolean);

  useEffect(() => {
    if (!prevAppointment) return;
    setTanques((atual) => {
      const novo = { ...atual };
      (Object.keys(novo) as ChaveMiudo[]).forEach((chave) => {
        novo[chave] = { ...novo[chave], prev: novo[chave].prev || leituraHerdada(prevAppointment?.tanques?.[chave]) };
      });
      return novo;
    });
    setPrevTravado((atual) => {
      const novo = { ...atual };
      (Object.keys(novo) as ChaveMiudo[]).forEach((chave) => {
        novo[chave] = novo[chave] || !!leituraHerdada(prevAppointment?.tanques?.[chave]);
      });
      return novo;
    });
  }, [prevAppointment]);

  const numAves = carcacasAtual?.totalAves ?? 0;
  const pesoCarcaca = carcacasAtual?.pesoMedioCarcaca ?? 0;
  const pesos = pesosMiudosPorCarcaca(pesoCarcaca);
  // Bloqueios (2 alertas independentes) só fora do 1º monitoramento do dia.
  const avesIndisponivel = !isPrimeiroDoDia && !numAves;
  const pesoMiudoIndisponivel = !isPrimeiroDoDia && !pesoCarcaca;

  const apuradoDe = (chave: ChaveMiudo) =>
    apurar(tanques[chave].prev, tanques[chave].cur, tanques[chave].ice, pesoCarcaca === 0 ? 0 : numAves * pesos[chave]);
  const apurado: Record<ChaveMiudo, number | null> = {
    coracao: apuradoDe("coracao"),
    moela: apuradoDe("moela"),
    figado: apuradoDe("figado"),
    cabeca: apuradoDe("cabeca"),
    pes: apuradoDe("pes"),
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
    const detalhes: string[] = [];
    (Object.keys(conf) as ChaveMiudo[]).forEach((chave) => {
      if (!conf[chave] && numAves > 0) detalhes.push(detalheDesvio(CONFIG_PARTE[chave].nome, apurado[chave] ?? 0, META_L_KG, "L/kg"));
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
        <div className="flex flex-wrap gap-2 items-center justify-between px-3 py-2 text-sm font-black text-white" style={{ background: cor }}>
          {nome.toUpperCase()}
          {numAves > 0 && <span className="text-xs opacity-90">Meta: {formatMaskedValue(META_L_KG.toFixed(3))} L/kg</span>}
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
            className="rounded-md border p-2"
            style={{
              background: !temResultado ? undefined : naoConforme ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)",
              borderColor: !temResultado ? undefined : naoConforme ? "#dc2626" : "#059669",
            }}
          >
            <div className="flex flex-wrap gap-2 items-center justify-between">
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

          {implausivel && <AvisoImplausivel apurado={valorApurado ?? 0} meta={META_L_KG} />}
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
            <strong>Preencha primeiro o "Renovação da Água do SPR Carcaças":</strong> o Peso do Miúdo (Tabela DE-PARA) depende do Peso médio da carcaça
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

      {isPrimeiroDoDia ? (
        <AvisoPrimeiroDoDia />
      ) : (
        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
          <h4 className="text-sm font-bold text-primary">Base de Cálculo — Aves e Peso da Carcaça</h4>
          <div className="flex flex-wrap items-end gap-4 rounded-md border bg-background p-3">
            <CampoBloqueado rotulo="Aves no Período" valor={`${numAves.toLocaleString("pt-BR")} aves`} />
            <CampoBloqueado rotulo="Peso Médio de Carcaça" valor={`${formatMaskedValue(pesoCarcaca.toFixed(3)) || "0,000"} kg`} />
          </div>
          {numAves > 0 && pesoCarcaca > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
              Aves no período e peso médio de carcaça usados ao vivo do "Renovação da Água do SPR Carcaças" desta mesma ficha.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        {(Object.keys(CONFIG_PARTE) as ChaveMiudo[]).map(renderParte)}
      </div>

      <LogicaCalculo titulo="Mini-Chillers">
        <li>Aves no Período e peso médio de carcaça vêm do SPR Carcaças desta mesma ficha.</li>
        <li>Peso do miúdo por carcaça (kg/un) = Tabela DE-PARA, pela faixa do peso médio de carcaça (coração, moela, fígado, cabeça e pés).</li>
        <li>Produto processado (kg) = Aves no Período × peso do miúdo por carcaça.</li>
        <li>Água usada (L) = (Hidr. Atual − Hidr. Anterior) × 1000 + Gelo Adicionado.</li>
        <li>Vazão apurada (L/kg) = água usada ÷ produto processado. Meta fixa: maior ou igual a 1,5 L/kg em cada mini-chiller.</li>
      </LogicaCalculo>
    </div>
  );
}
