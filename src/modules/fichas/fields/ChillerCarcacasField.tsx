import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, Lock, Plus, Scale, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useCargasJaMonitoradas, useCargasRastreabilidade } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import { dataManaus, horaManaus, isoDeManaus } from "../utils/horaMonitoramento";
import { formatHidrometro, formatMaskedValue, leituraHerdada, LIMIAR_IMPLAUSIVEL, parseHidrometro } from "./hidrometro";
import {
  apurar,
  avesNoPeriodo,
  detalheDesvio,
  exibirPesoVivo,
  GELO_PADRAO_CARCACAS,
  mascararPesoVivo,
  pesoVivoCompleto,
  pesoVivoDeHerdado,
  metaTanqueCarcacas,
  pesoMedioCarcaca as calcularPesoMedioCarcaca,
  pesoMedioParcial,
  totalAvesBruto,
  type ChaveTanqueCarcacas as ChaveTanque,
} from "./calculosSpr";
import { AvisoImplausivel, AvisoPrimeiroDoDia, LogicaCalculo, TOOLTIP_HIDR_ANTERIOR } from "./componentesSpr";
import { baseDeCargasAnteriores, baseParaProximo, calcularPeriodo, type CargaDoDia } from "./cargasDoPeriodo";
import { vereditoAntecipado, vereditoGeral } from "./vereditoVazao";
import type { CargaProcessada, ChegadaRegistrada, ChillerCarcacasValor, ParadaLinha, TanqueHidrometro } from "./tiposCompostos";

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
  /** Dia (AAAA-MM-DD, Manaus) cujas cargas podem ser herdadas; sem ele, hoje. */
  diaMonitoramento?: string;
  /** Cargas já usadas em rascunhos locais desta ficha (ainda não assinados). */
  cargasEmRascunho?: ReadonlySet<string>;
  /** Hora do monitoramento (ISO) informada pelo inspetor: base do cálculo das cargas que já chegaram ao pré-resfriamento. */
  horaMonitoramento?: string;
  /** Etapa 2: o que foi assinado na etapa 1 fica travado; só o peso vivo dos lotes sem peso pode ser completado. */
  modoCompletarPeso?: boolean;
}

/** Renovação da Água do SPR Carcaças. Aves no período = cargas − condenas; peso médio da
 * carcaça = média ponderada do peso vivo × 0,84; meta por tanque em função desse peso. O widget
 * só EXIBE o desvio — quem decide `monitoramentos.conformidade` continua sendo o Verificador
 * (segregação de funções, `trg_segregacao_funcoes`). Todas as contas ficam em calculosSpr.ts. */
export function ChillerCarcacasField({ value, onChange, disabled, prevAppointment, diaMonitoramento, horaMonitoramento, modoCompletarPeso, cargasEmRascunho }: ChillerCarcacasFieldProps) {
  const disabledGeral = disabled || modoCompletarPeso;
  const [chegada, setChegada] = useState<ChegadaRegistrada | undefined>(value?.chegada);
  // Pausas da linha de abate (informadas pelo inspetor): a pendura para; as aves já penduradas seguem até o pré-resfriamento.
  // Herda as pausas já conhecidas do monitoramento anterior e acrescenta as novas.
  const [paradas, setParadas] = useState<ParadaLinha[]>(value?.paradas ?? prevAppointment?.paradas ?? []);
  // As pausas do monitoramento anterior podem chegar depois (consulta assíncrona): entram se ainda não há nenhuma.
  useEffect(() => {
    const anteriores = prevAppointment?.paradas;
    if (value?.paradas || !anteriores?.length) return;
    setParadas((atual) => (atual.length > 0 ? atual : anteriores));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevAppointment]);
  // "Houve pausa da linha neste período?" — responder ANTES de usar as cargas: a pausa muda quais aves entram.
  const [pausaInformada, setPausaInformada] = useState<"sim" | "nao" | undefined>(value?.pausaInformada);
  const paradasHerdadas = prevAppointment?.paradas?.length ?? 0;
  const novasParadas = Math.max(0, paradas.length - paradasHerdadas);
  const [novaParada, setNovaParada] = useState({ inicio: "", fim: "", aberta: false });
  const [erroParada, setErroParada] = useState<string | null>(null);
  const [cargas, setCargas] = useState<CargaProcessada[]>(value?.cargas ?? [{ id: crypto.randomUUID(), quantity: "", avgLiveWeight: "" }]);
  // Peso parcial: o inspetor escolhe calcular o peso médio só com os lotes que já têm peso (os demais ficam de fora da média).
  const [usarPesoParcial, setUsarPesoParcial] = useState(!!value?.pesoParcial);
  const [condenasParcial, setCondenasParcial] = useState(value?.condenasParcial ?? "");
  // Registros antigos só têm o campo `condenas`: ele entra como "totalmente condenadas".
  const [condenasTotal, setCondenasTotal] = useState(value?.condenasTotal ?? value?.condenas ?? "");
  const [tanques, setTanques] = useState({
    preChiller: value?.tanques?.preChiller ?? tanqueVazio("preChiller", leituraHerdada(prevAppointment?.tanques?.preChiller)),
    chiller1: value?.tanques?.chiller1 ?? tanqueVazio("chiller1", leituraHerdada(prevAppointment?.tanques?.chiller1)),
    chiller2: value?.tanques?.chiller2 ?? tanqueVazio("chiller2", leituraHerdada(prevAppointment?.tanques?.chiller2)),
  });
  const [prevTravado, setPrevTravado] = useState({
    preChiller: !!(value?.tanques?.preChiller?.prev || leituraHerdada(prevAppointment?.tanques?.preChiller)),
    chiller1: !!(value?.tanques?.chiller1?.prev || leituraHerdada(prevAppointment?.tanques?.chiller1)),
    chiller2: !!(value?.tanques?.chiller2?.prev || leituraHerdada(prevAppointment?.tanques?.chiller2)),
  });

  // Cargas do período: calculadas pela CHEGADA ao pré-resfriamento na hora do monitoramento (início da pendura de cada
  // carga + trânsito deduzido da velocidade da linha; ver chegadaPreResfriamento.ts). Substitui a escolha manual.
  const { data: cargasDoDia } = useCargasRastreabilidade(diaMonitoramento || ensureLocalTime(new Date().toISOString()).isoLocal);
  const { data: jaUsadas } = useCargasJaMonitoradas("spr");
  const periodo = useMemo(() => {
    if (!horaMonitoramento || !cargasDoDia) return null;
    const lista: CargaDoDia[] = cargasDoDia.map((c) => ({ carga_id: c.carga_id, gta: c.gta, qtd_aves: c.qtd_aves, pendura_inicio_em: c.pendura_inicio_em, peso_medio_kg: c.peso_medio_kg }));
    // Base: o acumulado guardado no monitoramento anterior; sem ele, as cargas já apuradas contam inteiras.
    const base = prevAppointment?.chegada?.acumulado ?? baseDeCargasAnteriores(lista, new Set([...(jaUsadas ?? []), ...(cargasEmRascunho ?? [])]), prevAppointment?.cargas);
    return calcularPeriodo(lista, new Date(horaMonitoramento), base, paradas);
  }, [horaMonitoramento, cargasDoDia, jaUsadas, cargasEmRascunho, prevAppointment, paradas]);

  // 1ª leitura do dia (ou do turno): não há aves a apurar, mas o que já chegou ao pré-resfriamento até agora é a BASE do
  // monitoramento seguinte — as aves que já passaram não podem ser contadas de novo. Guarda o acumulado por carga.
  const primeiroDoDiaGlobal = !prevAppointment?.tanques?.preChiller?.cur && !prevAppointment?.tanques?.chiller1?.cur && !prevAppointment?.tanques?.chiller2?.cur;
  useEffect(() => {
    if (modoCompletarPeso || !primeiroDoDiaGlobal || !periodo) return;
    const nova: ChegadaRegistrada = {
      corteEm: periodo.chegada.corteEm,
      velocidadeAvesH: periodo.chegada.velocidadeAvesH,
      origemVelocidade: periodo.chegada.origemVelocidade,
      transitoSegundos: periodo.chegada.transitoSegundos,
      acumulado: baseParaProximo(periodo.chegada),
    };
    setChegada((atual) => (atual && JSON.stringify(atual) === JSON.stringify(nova) ? atual : nova));
  }, [periodo, primeiroDoDiaGlobal, modoCompletarPeso]);

  // As cargas já usadas foram calculadas antes de uma pausa ser informada (ou removida): precisam ser recalculadas.
  const cargasDesatualizadas =
    !!chegada && !!periodo && JSON.stringify(chegada.acumulado) !== JSON.stringify(baseParaProximo(periodo.chegada));

  function registrarParada() {
    if (!horaMonitoramento) return;
    const dia = dataManaus(new Date(horaMonitoramento));
    const inicio = isoDeManaus(dia, novaParada.inicio);
    const fim = novaParada.aberta ? null : isoDeManaus(dia, novaParada.fim);
    const agoraMs = new Date(horaMonitoramento).getTime();
    if (!inicio || (!novaParada.aberta && !fim)) return setErroParada("Informe o horário de início e o de fim da pausa.");
    if (new Date(inicio).getTime() > agoraMs) return setErroParada("A pausa não pode começar depois da hora do monitoramento.");
    if (fim && new Date(fim).getTime() <= new Date(inicio).getTime()) return setErroParada("O fim da pausa deve ser depois do início.");
    if (fim && new Date(fim).getTime() > agoraMs + 5 * 60_000) return setErroParada("A pausa não pode terminar depois da hora do monitoramento (use \"linha ainda parada\").");
    setErroParada(null);
    setParadas((atual) => [...atual, { inicio, fim }].sort((a, b) => (a.inicio < b.inicio ? -1 : 1)));
    setPausaInformada("sim");
    setNovaParada({ inicio: "", fim: "", aberta: false });
  }

  function usarCargasCalculadas() {
    if (!periodo || periodo.lotes.length === 0 || !pausaInformada) return;
    setCargas(
      periodo.lotes.map((l) => ({ id: crypto.randomUUID(), quantity: String(l.aves), avgLiveWeight: l.pesoVivo, cargaId: l.cargaId, gta: l.gta, parcial: !l.completa }))
    );
    setChegada({
      corteEm: periodo.chegada.corteEm,
      velocidadeAvesH: periodo.chegada.velocidadeAvesH,
      origemVelocidade: periodo.chegada.origemVelocidade,
      transitoSegundos: periodo.chegada.transitoSegundos,
      acumulado: baseParaProximo(periodo.chegada),
    });
  }

  /** Peso vivo que o peso por caixa já informou para a carga ("" se a balança ainda não passou). */
  const pesoHerdadoDe = (cargaId: string) => pesoVivoDeHerdado(cargasDoDia?.find((x) => x.carga_id === cargaId)?.peso_medio_kg);

  // Etapa 2: o peso da carga chegou da balança → completa sozinho o peso vivo dos lotes que estavam em branco.
  useEffect(() => {
    if (!modoCompletarPeso || !cargasDoDia) return;
    setCargas((atual) => {
      let mudou = false;
      const novo = atual.map((c) => {
        if (c.avgLiveWeight || !c.cargaId) return c;
        const peso = pesoVivoDeHerdado(cargasDoDia.find((x) => x.carga_id === c.cargaId)?.peso_medio_kg);
        if (!peso) return c;
        mudou = true;
        return { ...c, avgLiveWeight: peso };
      });
      return mudou ? novo : atual;
    });
  }, [modoCompletarPeso, cargasDoDia]);

  // Primeiro monitoramento do dia (nenhum tanque tem leitura anterior para herdar): só a leitura
  // atual, que vira a base do próximo monitoramento comparar.
  const isPrimeiroDoDia = !prevTravado.preChiller && !prevTravado.chiller1 && !prevTravado.chiller2;

  // Atualiza leitura anterior quando prevAppointment chega depois (fetch assíncrono).
  useEffect(() => {
    if (!prevAppointment) return;
    setTanques((atual) => ({
      preChiller: { ...atual.preChiller, prev: atual.preChiller.prev || leituraHerdada(prevAppointment?.tanques?.preChiller) },
      chiller1: { ...atual.chiller1, prev: atual.chiller1.prev || leituraHerdada(prevAppointment?.tanques?.chiller1) },
      chiller2: { ...atual.chiller2, prev: atual.chiller2.prev || leituraHerdada(prevAppointment?.tanques?.chiller2) },
    }));
    setPrevTravado((atual) => ({
      preChiller: atual.preChiller || !!leituraHerdada(prevAppointment?.tanques?.preChiller),
      chiller1: atual.chiller1 || !!leituraHerdada(prevAppointment?.tanques?.chiller1),
      chiller2: atual.chiller2 || !!leituraHerdada(prevAppointment?.tanques?.chiller2),
    }));
  }, [prevAppointment]);

  const totalAves = totalAvesBruto(cargas);
  // Lote com aves e sem peso vivo: a balança ainda não passou o peso daquela carga. Enquanto isso o peso médio (e a meta) é
  // desconhecido e a conformidade só pode ser ANTECIPADA (vereditoVazao.ts). Nunca se usa peso estimado.
  const lotesPendentes = cargas.filter((c) => (parseFloat(c.quantity) || 0) > 0 && !pesoVivoCompleto(c.avgLiveWeight));
  const parcial = pesoMedioParcial(cargas);
  // Peso parcial só vale enquanto há lote sem peso E ao menos um lote com peso; se a balança completar tudo, volta ao cálculo normal.
  const pesoParcialAtivo = usarPesoParcial && !modoCompletarPeso && lotesPendentes.length > 0 && parcial.avesComPeso > 0;
  const pesoPendente = lotesPendentes.length > 0 && !pesoParcialAtivo;
  // já com o rendimento fixo de 84%
  const pesoMedioCarcaca = pesoPendente ? 0 : pesoParcialAtivo ? parcial.pesoMedioCarcaca : calcularPesoMedioCarcaca(cargas);
  const resumoParcial = pesoParcialAtivo
    ? `peso médio parcial: ${parcial.avesComPeso.toLocaleString("pt-BR")} de ${(parcial.avesComPeso + parcial.avesSemPeso).toLocaleString("pt-BR")} aves com peso (${parcial.lotesSemPeso} lote(s) sem peso ficaram de fora da média)`
    : null;

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
  // Veredito antecipado (peso pendente): só a renovação apurada, comparada com as metas das faixas de peso.
  const vereditoTanque = (chave: ChaveTanque) => (tanques[chave].cur && totalAvesPeriodo > 0 ? vereditoAntecipado(chave, apurado[chave]) : null);
  const vereditos = { preChiller: vereditoTanque("preChiller"), chiller1: vereditoTanque("chiller1"), chiller2: vereditoTanque("chiller2") };
  const veredito = pesoPendente ? vereditoGeral(Object.values(vereditos)) : null;
  const ncCerto = veredito?.estado === "nao_conforme_certo";
  const isConforme = pesoPendente ? !ncCerto : !hasCurData || (confPreChiller && confChiller1 && confChiller2);

  useEffect(() => {
    const detalhes: string[] = [];
    if (pesoPendente) {
      // Não conforme em QUALQUER peso: abaixo da meta da faixa mais branda.
      const nomes: [ChaveTanque, string][] = [["preChiller", "Pré-chiller"], ["chiller1", "Chiller 01"], ["chiller2", "Chiller 02"]];
      for (const [chave, nome] of nomes) {
        const v = vereditos[chave];
        if (v?.estado === "nao_conforme_certo") detalhes.push(detalheDesvio(nome, apurado[chave] ?? 0, v.metas.ate2_5, "L/c"));
      }
    } else {
      if (!confPreChiller && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Pré-chiller", apurado.preChiller ?? 0, metas.preChiller, "L/c"));
      if (!confChiller1 && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Chiller 01", apurado.chiller1 ?? 0, metas.chiller1, "L/c"));
      if (!confChiller2 && totalAvesPeriodo > 0) detalhes.push(detalheDesvio("Chiller 02", apurado.chiller2 ?? 0, metas.chiller2, "L/c"));
    }

    onChange({
      cargas,
      tanques,
      condenasParcial,
      condenasTotal,
      totalAves: totalAvesPeriodo,
      totalAvesBruto: totalAves,
      pesoMedioCarcaca,
      ...(pesoParcialAtivo ? { pesoParcial: { avesComPeso: parcial.avesComPeso, avesSemPeso: parcial.avesSemPeso, lotesSemPeso: parcial.lotesSemPeso } } : {}),
      ...(chegada ? { chegada } : {}),
      ...(paradas.length > 0 ? { paradas } : {}),
      ...(pausaInformada ? { pausaInformada } : {}),
      conformidade: isConforme,
      detalhesRNC:
        detalhes.length > 0
          ? pesoPendente
            ? `Vazão Insuficiente em qualquer faixa de peso (peso das cargas ainda não informado): ${detalhes.join("; ")}`
            : `Vazão Insuficiente${resumoParcial ? ` (${resumoParcial})` : ""}: ${detalhes.join("; ")}`
          : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargas, tanques, condenasParcial, condenasTotal, isConforme, chegada, pesoPendente, pesoParcialAtivo, paradas, pausaInformada]);

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
          {totalAves > 0 && (
            <span className="text-xs opacity-90">{pesoPendente ? "Meta: depende do peso das cargas" : `Meta: ${formatMaskedValue(meta.toFixed(3))} L/c`}</span>
          )}
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3">
            {!isPrimeiroDoDia && (
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Hidr. Anterior (m³) {prevTravado[chave] && <Lock className="h-3 w-3" />}
                </Label>
                <Input
                  disabled={disabledGeral || prevTravado[chave]}
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
                disabled={disabledGeral}
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
                  disabled={disabledGeral}
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

  const secaoParadas = horaMonitoramento && (
            <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-background p-3" data-testid="paradas-linha">
              <p className="flex items-center gap-2 text-xs font-bold text-primary">
                <Clock className="h-3.5 w-3.5" /> Houve pausa da linha neste período?{!modoCompletarPeso && <span className="text-destructive"> *</span>}
              </p>
              {!modoCompletarPeso && (
                <p className="text-xs text-muted-foreground">
                  Responda antes de usar as cargas. Na pausa a pendura para, mas as aves já penduradas seguem até o pré-resfriamento; os horários permitem ao cálculo das cargas descontar o
                  tempo parado.
                </p>
              )}
              {!disabledGeral ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Houve pausa da linha neste período?">
                  <Button
                    type="button"
                    size="sm"
                    variant={pausaInformada === "nao" ? "default" : "outline"}
                    aria-pressed={pausaInformada === "nao"}
                    disabled={novasParadas > 0}
                    title={novasParadas > 0 ? "Remova as pausas informadas para marcar que não houve pausa." : undefined}
                    onClick={() => setPausaInformada("nao")}
                  >
                    Não houve pausa
                  </Button>
                  <Button type="button" size="sm" variant={pausaInformada === "sim" ? "default" : "outline"} aria-pressed={pausaInformada === "sim"} onClick={() => setPausaInformada("sim")}>
                    Houve pausa
                  </Button>
                </div>
              ) : (
                pausaInformada && <p className="text-xs">Houve pausa da linha neste período: {pausaInformada === "sim" ? "sim" : "não"}.</p>
              )}
              {paradas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pausa informada.</p>
              ) : (
                <ul className="space-y-1">
                  {paradas.map((pa, i) => (
                    <li key={`${pa.inicio}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs">
                      <span>
                        {horaManaus(new Date(pa.inicio))} → {pa.fim ? horaManaus(new Date(pa.fim)) : "linha ainda parada"}
                      </span>
                      {!disabledGeral && (
                        <Button type="button" size="sm" variant="ghost" className="text-destructive" aria-label="Remover pausa" onClick={() => setParadas((a) => a.filter((_, j) => j !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!disabledGeral && pausaInformada === "sim" && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="parada-inicio" className="text-xs text-muted-foreground">
                      Início da pausa
                    </Label>
                    <Input id="parada-inicio" type="time" className="w-auto" value={novaParada.inicio} onChange={(e) => setNovaParada((a) => ({ ...a, inicio: e.target.value }))} />
                  </div>
                  {!novaParada.aberta && (
                    <div className="space-y-1">
                      <Label htmlFor="parada-fim" className="text-xs text-muted-foreground">
                        Fim da pausa
                      </Label>
                      <Input id="parada-fim" type="time" className="w-auto" value={novaParada.fim} onChange={(e) => setNovaParada((a) => ({ ...a, fim: e.target.value }))} />
                    </div>
                  )}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={novaParada.aberta} onChange={(e) => setNovaParada((a) => ({ ...a, aberta: e.target.checked }))} /> linha ainda parada
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={registrarParada}>
                    <Plus className="h-3.5 w-3.5" /> Informar pausa
                  </Button>
                </div>
              )}
              {erroParada && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {erroParada}
                </p>
              )}
              {cargasDesatualizadas && !modoCompletarPeso && (
                <p role="status" data-testid="cargas-desatualizadas" className="rounded border border-warning bg-warning/10 p-2 text-xs font-medium">
                  As cargas usadas foram calculadas antes desta alteração das pausas: toque em "Usar estas cargas" para atualizar.
                </p>
              )}
            </div>
          );

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-4">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Status de Conformidade</p>
          <p className={`mt-1 flex items-center gap-2 text-lg font-black ${!hasCurData || (pesoPendente && isConforme) ? "text-primary" : !isConforme ? "text-destructive" : "text-success"}`}>
            {!hasCurData ? (
              <>
                <Info className="h-5 w-5" /> AGUARDANDO LEITURA
              </>
            ) : pesoPendente && isConforme ? (
              <>
                <Scale className="h-5 w-5" /> AGUARDANDO O PESO DA BALANÇA
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
              {resumoParcial ? (
                <p className="max-w-[210px] text-xs font-semibold text-warning-foreground" data-testid="peso-parcial-resumo">PARCIAL — {parcial.avesComPeso.toLocaleString("pt-BR")} de {(parcial.avesComPeso + parcial.avesSemPeso).toLocaleString("pt-BR")} aves com peso</p>
              ) : (
                <p className="max-w-[210px] text-xs text-muted-foreground">carcaças = aves abatidas com 16% de perda de peso (despojos do abate)</p>
              )}
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

      {pesoPendente && hasCurData && veredito && (
        <div
          role="status"
          data-testid="veredito-antecipado"
          className={`space-y-1 rounded-md border-2 p-3 text-sm ${
            veredito.estado === "nao_conforme_certo"
              ? "border-destructive bg-destructive/10 text-destructive"
              : veredito.estado === "conforme_certo"
                ? "border-success bg-success/10 text-success"
                : "border-warning bg-warning/10 text-foreground"
          }`}
        >
          <p className="flex items-center gap-2 font-bold">
            <Scale className="h-4 w-4" />
            {veredito.estado === "nao_conforme_certo"
              ? "NÃO CONFORME em qualquer peso — aja agora"
              : veredito.estado === "conforme_certo"
                ? "CONFORME em qualquer peso"
                : "Depende do peso das cargas"}
          </p>
          <p className="text-xs">
            {veredito.estado === "nao_conforme_certo"
              ? "A renovação apurada está abaixo da meta da faixa de peso mais branda. Emita a RNC ou registre a ação corretiva imediata sem esperar a balança."
              : veredito.estado === "conforme_certo"
                ? "A renovação apurada atende a meta da faixa de peso mais exigente."
                : `Conforme se o peso médio da carcaça for até ${(veredito.conformeSeCarcacaAteKg ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} kg (peso vivo médio até ${(veredito.conformeSePesoVivoAteKg ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg). A meta final só é fechada quando a balança passar o peso.`}
          </p>
        </div>
      )}

      {!isPrimeiroDoDia ? (
        <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h4 className="text-sm font-bold text-primary">Cargas Processadas no Período</h4>
            <Button type="button" size="sm" variant="outline" onClick={adicionarCarga} disabled={disabledGeral}>
              <Plus className="h-3.5 w-3.5" /> Adicionar Lote
            </Button>
          </div>

          {secaoParadas}

          {!modoCompletarPeso && (
            <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-background p-3" data-testid="cargas-calculadas">
              <p className="flex items-center gap-2 text-xs font-bold text-primary">
                <Clock className="h-3.5 w-3.5" /> Cargas que já chegaram ao pré-resfriamento
              </p>
              {!horaMonitoramento ? (
                <p className="text-xs text-muted-foreground">Informe a hora do monitoramento (no topo da ficha) para calcular as cargas do período.</p>
              ) : !periodo ? (
                <p className="text-xs text-muted-foreground">Carregando as cargas do dia…</p>
              ) : periodo.lotes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma carga nova chegou ao pré-resfriamento até essa hora (ou a pendura ainda não foi registrada no Bem-Estar Animal). Você pode adicionar lotes manualmente.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Corte às {ensureLocalTime(periodo.chegada.corteEm).time}: trânsito de {Math.floor(periodo.chegada.transitoSegundos / 60)} min{" "}
                    {String(periodo.chegada.transitoSegundos % 60).padStart(2, "0")} s, a {periodo.chegada.velocidadeAvesH.toLocaleString("pt-BR")} aves/h
                    {periodo.chegada.origemVelocidade === "observada" ? " (velocidade deduzida da pendura das cargas)" : " (velocidade nominal da linha: ainda não há carga concluída para deduzir)"}.
                  </p>
                  <div className="space-y-1">
                    {periodo.lotes.map((l) => (
                      <div key={l.cargaId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-xs">
                        <span>
                          <strong>GTA {l.gta}</strong> · {l.aves.toLocaleString("pt-BR")} aves{!l.completa && " (parte da carga)"}
                          {l.penduraNaoRegistrada && " — pendura não registrada: estimada pelo andamento do abate"}
                        </span>
                        <span className={l.pesoVivo ? "text-muted-foreground" : "font-semibold text-warning-foreground"}>
                          {l.pesoVivo ? `peso ${exibirPesoVivo(l.pesoVivo)} kg` : "aguardando o peso da balança"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs">
                      Total: <strong>{periodo.totalAves.toLocaleString("pt-BR")} aves</strong>
                      {periodo.semPeso.length > 0 && ` · ${periodo.semPeso.length} carga(s) sem peso`}
                    </span>
                    <Button type="button" size="sm" disabled={disabledGeral || !pausaInformada} onClick={usarCargasCalculadas}>
                      Usar estas cargas
                    </Button>
                  </div>
                  {!pausaInformada && (
                    <p role="status" data-testid="falta-pausa" className="text-xs font-medium text-warning-foreground">
                      Responda acima se houve pausa da linha neste período para poder usar as cargas.
                    </p>
                  )}
                  {periodo.semPeso.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sem o peso você ainda pode salvar: a leitura vale agora e o peso é completado depois, quando a balança passar. A conformidade só é fechada com o peso real.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            {cargas.map((carga, indice) => (
              <div key={carga.id} className="flex flex-col gap-3 rounded-md border bg-background p-3 sm:flex-row sm:items-end">
                <span className="text-xs font-black text-muted-foreground sm:min-w-[60px]">
                  LOTE {indice + 1}
                  {carga.gta && <span className="block font-normal">GTA {carga.gta}</span>}
                  {carga.parcial && <span className="block font-normal text-warning-foreground">parte da carga</span>}
                </span>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Aves (un)</Label>
                  <Input
                    inputMode="numeric"
                    disabled={disabledGeral || !!(carga.cargaId && carga.quantity)}
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
                    // Só o peso HERDADO do peso por caixa fica travado. O que o inspetor está digitando (carga ainda sem peso da
                    // balança) nunca trava: senão o campo bloqueava no primeiro dígito.
                    disabled={disabled || (!!carga.cargaId && !!carga.avgLiveWeight && carga.avgLiveWeight === pesoHerdadoDe(carga.cargaId))}
                    value={exibirPesoVivo(carga.avgLiveWeight)}
                    onChange={(e) => alterarCarga(carga.id, "avgLiveWeight", mascararPesoVivo(e.target.value))}
                    placeholder="Ex: 2,850"
                  />
                  {!pesoVivoCompleto(carga.avgLiveWeight) && carga.cargaId && (
                    <p className="text-[0.65rem] font-semibold text-warning-foreground">
                      {carga.avgLiveWeight ? "digite o peso completo (ex.: 2,850)" : "aguardando o peso da balança"}
                    </p>
                  )}
                </div>
                {cargas.length > 1 && !disabledGeral && (
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => removerCarga(carga.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {lotesPendentes.length > 0 && !modoCompletarPeso && (
            <div className="space-y-2 rounded-md border border-dashed border-warning p-3 text-xs" data-testid="peso-parcial">
              {pesoParcialAtivo ? (
                <>
                  <p className="font-semibold text-warning-foreground">
                    Peso médio calculado só com os pesos informados: {parcial.avesComPeso.toLocaleString("pt-BR")} de {(parcial.avesComPeso + parcial.avesSemPeso).toLocaleString("pt-BR")} aves
                    ({parcial.lotesSemPeso} lote(s) sem peso ficam de fora da média, mas contam nas aves do período). O registro fecha como PARCIAL e isso aparece para o verificador.
                  </p>
                  {!disabledGeral && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setUsarPesoParcial(false)}>
                      Voltar a aguardar o peso das demais cargas
                    </Button>
                  )}
                </>
              ) : parcial.avesComPeso > 0 ? (
                <>
                  <p className="text-muted-foreground">
                    {lotesPendentes.length} lote(s) ainda sem o peso da balança. Você pode aguardar o peso (salva a 1ª etapa) ou calcular agora só com os pesos já informados ({parcial.avesComPeso.toLocaleString("pt-BR")} de{" "}
                    {(parcial.avesComPeso + parcial.avesSemPeso).toLocaleString("pt-BR")} aves).
                  </p>
                  {!disabledGeral && (
                    <Button type="button" size="sm" onClick={() => setUsarPesoParcial(true)}>
                      Calcular só com os pesos informados
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Nenhum lote tem peso ainda: não há como calcular o peso médio. Aguarde a balança ou informe o peso vivo do lote.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 border-t border-dashed pt-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Parcialmente Aproveitadas</Label>
              <Input inputMode="numeric" disabled={disabledGeral} value={condenasParcial} onChange={(e) => setCondenasParcial(somenteInteiro(e.target.value))} placeholder="Ex: 40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Carcaças Totalmente Condenadas</Label>
              <Input inputMode="numeric" disabled={disabledGeral} value={condenasTotal} onChange={(e) => setCondenasTotal(somenteInteiro(e.target.value))} placeholder="Ex: 80" />
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
        <>
          <AvisoPrimeiroDoDia />
          {secaoParadas}
          {periodo && !modoCompletarPeso && (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs" data-testid="base-chegada">
              <strong>Base para os próximos monitoramentos:</strong> até as {ensureLocalTime(periodo.chegada.corteEm).time} (corte de chegada) já passaram{" "}
              <strong>{periodo.chegada.total.toLocaleString("pt-BR")} aves</strong> pelo pré-resfriamento. Elas ficam gravadas aqui e não serão contadas de novo nos
              monitoramentos seguintes.
            </p>
          )}
        </>
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
        <li>
          Cargas do período = aves que já chegaram ao pré-resfriamento na hora do monitoramento: aves penduradas até (hora − trânsito), com o trânsito deduzido da velocidade da linha
          (aves da carga ÷ tempo andando até a pendura da seguinte, sem as pausas informadas), menos o que já entrou no monitoramento anterior.
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
