// Renderizadores read-only, para o relatório impresso, dos 7 widgets "Especial SIF"
// (equivalente a ReportDetails.jsx do v1). Diferença deliberada em relação ao v1: aqui NÃO se
// recalcula limiar de conformidade nenhum — cada widget de preenchimento
// (src/modules/fichas/fields/*.tsx) já grava `conformidade`/`status` e `detalhesRNC` prontos
// dentro do próprio valor no momento do apontamento; o relatório só exibe as leituras brutas
// e esse veredito já persistido, nunca reproduz a fórmula (evita duas implementações da mesma
// regra de negócio divergindo entre si).
import { useCargasRastreabilidade } from "@/modules/recepcao/api";
import { absorcaoLinhaDripping, acimaDoLimite, formatarPercentual, LIMITE_DRIPPING, percentualIndividualAbsorcao } from "../../fields/calculosAbsorcao";
import type {
  AbsorcaoAguaValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  DrippingTestValor,
  EletronarcoseAvesValor,
  EsperaAvesValor,
  LavagemFinalValor,
  MiniChillersValor,
  OcorrenciaPragasValor,
  CaixasVaziasValor,
  ParadaEquipamentoValor,
  PenduraAvesValor,
  PesoCaixaValor,
  RastreabilidadeDoaValor,
  TemperaturaResfriamentoValor,
  PotabilidadeAguaValor,
  PotabilidadePontosValor,
  QualidadeMiudosValor,
  ControleAbsorcaoValor,
  ChecklistConformidadeValor,
  RecepcaoAvesValor,
  TanqueHidrometro,
} from "@/modules/fichas/fields/tiposCompostos";
import { formatMaskedValue } from "@/modules/fichas/fields/hidrometro";
import { pesoVivoMedioDaCarcaca, RENDIMENTO_CARCACA_PERCENTUAL } from "@/modules/fichas/fields/calculosSpr";
import { pragasPresentes, rotuloDaPraga } from "@/modules/fichas/fields/pragas";
import { COMPORTAMENTOS_AVES } from "@/modules/fichas/fields/esperaAves";
import { formatarPctDoa } from "@/modules/fichas/fields/rastreabilidadeDoa";
import { CHECKLISTS, respostaNaoConforme, rotuloResposta, salasDoChecklist, type TipoChecklist } from "@/modules/fichas/fields/checklistConformidade";
import { cloroForaDoLimite, lerMedida, phForaDoLimite, rotuloTanque, SISTEMAS_POTABILIDADE } from "@/modules/fichas/fields/potabilidadeAgua";
import { cloroPontoForaDoLimite, phPontoForaDoLimite, rotuloPonto } from "@/modules/fichas/fields/potabilidadePontos";
import { rotuloBorbulhamento, TANQUES_ABSORCAO, temperaturaAbsorcaoAcimaDoLimite } from "@/modules/fichas/fields/controleAbsorcao";
import { defeitoAcimaDoMaximo, formatarPct, lerContagem, PARTES_MIUDOS, percentualDefeito } from "@/modules/fichas/fields/qualidadeMiudos";
import { LIMITE_AGUA_C, LIMITE_AMBIENTE_C, LIMITE_PRODUTO_C, lerTemperatura, PONTOS_AGUA, PONTOS_AMBIENTE, PRODUTOS } from "@/modules/fichas/fields/temperaturaResfriamento";
import { CONDICOES_ANIMAIS, formatarDataHora, formatarDuracao, LIMITE_JEJUM_MAX_H } from "@/modules/fichas/fields/recepcaoAves";
import {
  apuracaoCarcacas,
  apuracaoChuveiro,
  apuracaoMiudos,
  apuracaoPartes,
  type LinhaApuracao,
} from "@/modules/fichas/fields/apuracaoRelatorio";

function SeloConformidade({ conforme }: { conforme: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider print:text-[8px] ${
        conforme ? "bg-success/15 text-success" : "bg-down-soft text-down"
      }`}
    >
      {conforme ? "Conforme" : "Não Conforme"}
    </span>
  );
}

function NotaDesvio({ detalhes }: { detalhes: string | null }) {
  if (!detalhes) return null;
  return (
    <p className="rounded-md border border-down/30 bg-down-soft/60 p-2 text-[10px] font-medium text-down print:text-[8px] print:p-1">
      {detalhes}
    </p>
  );
}

function TabelaTanques({ tanques }: { tanques: Record<string, Omit<TanqueHidrometro, "ice"> & { ice?: string; rotulo: string }> }) {
  // O Chuveiro Final não tem gelo: sem a coluna quando nenhuma linha traz esse campo.
  const temGelo = Object.values(tanques).some((t) => t.ice !== undefined);
  return (
    <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-[10px] print:text-[8px]">
      <thead>
        <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
          <th className="border border-hairline p-1.5 print:p-1">Ponto</th>
          <th className="border border-hairline p-1.5 print:p-1">Hidr. Anterior (m³)</th>
          <th className="border border-hairline p-1.5 print:p-1">Hidr. Atual (m³)</th>
          {temGelo && <th className="border border-hairline p-1.5 print:p-1">Gelo (kg)</th>}
        </tr>
      </thead>
      <tbody>
        {Object.entries(tanques).map(([chave, t]) => (
          <tr key={chave}>
            <td className="border border-hairline p-1.5 font-bold print:p-1">{t.rotulo}</td>
            <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.prev) || "—"}</td>
            <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.cur) || "—"}</td>
            {temGelo && <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.ice) || "—"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function horasCompletas(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus" });
}

const nf = (n: number | null, casas = 3) => (n === null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));

/** Resultado do monitoramento (litros por carcaça e por quilo de produto, por ponto) + memória de
 * cálculo com os números do registro + a lógica geral — para o auditor constatar a conformidade. */
function ApuracaoAgua({ linhas, logica, baseTitulo }: { linhas: LinhaApuracao[]; logica: string[]; baseTitulo: string }) {
  return (
    <div className="space-y-2">
      <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-[10px] print:text-[8px]">
        <thead>
          <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
            <th className="border border-hairline p-1.5 print:p-1">Ponto</th>
            <th className="border border-hairline p-1.5 print:p-1">Água usada (L)</th>
            <th className="border border-hairline p-1.5 print:p-1">{baseTitulo}</th>
            <th className="border border-hairline p-1.5 print:p-1">L / carcaça</th>
            <th className="border border-hairline p-1.5 print:p-1">L / kg de produto</th>
            <th className="border border-hairline p-1.5 print:p-1">Meta (mín.)</th>
            <th className="border border-hairline p-1.5 print:p-1">Situação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.ponto}>
              <td className="border border-hairline p-1.5 font-bold print:p-1">{l.ponto}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{l.apurada ? nf(l.aguaL, 0) : "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">
                {l.base > 0 ? `${nf(l.base, l.baseUnidade === "aves" ? 0 : 3)} ${l.baseUnidade}` : "—"}
              </td>
              <td className={`border border-hairline p-1.5 font-mono print:p-1 ${l.unidadeMeta === "L/carcaça" ? "font-black" : ""}`}>{nf(l.litrosPorCarcaca)}</td>
              <td className={`border border-hairline p-1.5 font-mono print:p-1 ${l.unidadeMeta === "L/kg" ? "font-black" : ""}`}>{nf(l.litrosPorKg)}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">
                {nf(l.meta)} {l.unidadeMeta}
              </td>
              <td className={`border border-hairline p-1.5 font-black uppercase print:p-1 ${l.conforme === null ? "text-muted-foreground" : l.conforme ? "text-success" : "text-down"}`}>
                {l.conforme === null ? "Sem apuração" : l.conforme ? "Conforme" : "Abaixo da meta"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9px] text-muted-foreground print:text-[7px]">Em negrito, o indicador que decide a conformidade (o outro é informativo).</p>

      <div className="rounded-md border border-hairline bg-white p-2 text-[10px] print:p-1 print:text-[8px]">
        <p className="mb-1 font-black uppercase tracking-wider text-primary">Memória de cálculo deste registro</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {linhas.map((l) => (
            <li key={l.ponto}>
              <strong>{l.ponto}:</strong> {l.memoria}
              {l.conforme !== null && <strong className={l.conforme ? " text-success" : " text-down"}> → {l.conforme ? "CONFORME" : "NÃO CONFORME"}</strong>}
            </li>
          ))}
        </ul>
        <p className="mb-1 mt-2 font-black uppercase tracking-wider text-primary">Lógica do cálculo</p>
        <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
          {logica.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const LOGICA_AGUA = "Água usada (L) = (Hidr. Atual − Hidr. Anterior) × 1000 + Gelo Adicionado (1 kg de gelo = 1 L).";

const LOGICA_CARCACAS = [
  "Aves no período = Σ aves das cargas − (carcaças parcialmente aproveitadas + totalmente condenadas).",
  "Peso médio da carcaça = 84% do peso vivo médio, em que o peso vivo médio é a média ponderada do peso vivo das cargas (pelas aves de cada lote); o rendimento de 84% é fixo (16% de perda no abate).",
  LOGICA_AGUA,
  "Renovação apurada (L/carcaça) = água usada ÷ aves no período; L/kg = água usada ÷ (aves no período × peso médio da carcaça). Conforme quando L/carcaça ≥ meta do tanque.",
  "Metas por faixa de peso da carcaça (≤ 2,5 kg / ≤ 5,0 kg / > 5,0 kg): Pré-chiller 1,5 / 1,7 / 2,2 · Chiller 01 1,1 / 1,6 / 2,1 · Chiller 02 1,0 / 1,5 / 2,0 L/carcaça.",
];
const LOGICA_PARTES = [
  "Massa processada (kg) = carcaças parcialmente aproveitadas (SPR Carcaças) × peso médio da carcaça (SPR Carcaças) × 0,70 (desconta 30% de aproveitamento).",
  LOGICA_AGUA,
  "Renovação apurada (L/kg) = água usada ÷ massa processada; L/carcaça = água usada ÷ carcaças parcialmente aproveitadas. Meta fixa: L/kg ≥ 1,5 em cada chiller.",
];
const LOGICA_MIUDOS = [
  "Aves no período e peso médio da carcaça vêm do SPR Carcaças desta mesma ficha.",
  "Peso unitário do miúdo (kg) = Tabela DE-PARA, pela faixa do peso médio da carcaça (coração, moela, fígado, cabeça e pés).",
  "Produto processado (kg) = aves no período × peso unitário do miúdo.",
  LOGICA_AGUA,
  "Vazão apurada (L/kg) = água usada ÷ produto processado; L/ave = água usada ÷ aves no período. Meta fixa: L/kg ≥ 1,5 em cada mini-chiller.",
];
const LOGICA_CHUVEIRO = [
  "Aves no chuveiro final = total de aves bruto (SPR Carcaças) − (carcaças totalmente condenadas (SPR Carcaças) + carcaças parcialmente condenadas informadas no chuveiro).",
  "Água usada (L) = (Hidr. Atual − Hidr. Anterior) × 1000. Não há gelo neste ponto.",
  "Vazão apurada (L/carcaça) = água usada ÷ aves no chuveiro final; L/kg = água usada ÷ (aves no chuveiro × peso médio da carcaça do SPR Carcaças). Meta fixa: L/carcaça ≥ 1,5.",
];

/** Explica de onde vem o peso médio da carcaça: é 84% do peso vivo médio (e quanto este vale). */
function baseDoPesoDeCarcaca(pesoCarcaca: number): string {
  if (!(pesoCarcaca > 0)) return `${RENDIMENTO_CARCACA_PERCENTUAL} do peso vivo médio (aguardando o peso das cargas)`;
  return `${RENDIMENTO_CARCACA_PERCENTUAL} do peso vivo médio de ${pesoVivoMedioDaCarcaca(pesoCarcaca).toFixed(3)} kg`;
}

function horaDeRelatorio(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit" });
}

function Cabecalho({ titulo, conforme }: { titulo: string; conforme: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between print:mb-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
      <SeloConformidade conforme={conforme} />
    </div>
  );
}

export function ChillerCarcacasRelatorio({ valor, titulo = "Renovação da Água — SPR Carcaças" }: { valor: ChillerCarcacasValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={valor.conformidade} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-4">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Aves bruto</span><br /><strong>{valor.totalAvesBruto.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Condenas</span><br /><strong>{valor.condenasParcial || 0} parcial / {valor.condenasTotal || 0} total</strong></div>
        <div>
          <span className="text-muted-foreground">Peso médio da carcaça</span>
          <br />
          <strong>{valor.pesoMedioCarcaca > 0 ? `${valor.pesoMedioCarcaca.toFixed(3)} kg` : "—"}</strong>
          <br />
          <span className="text-muted-foreground" data-testid="relatorio-peso-carcaca-base">{baseDoPesoDeCarcaca(valor.pesoMedioCarcaca)}</span>
        </div>
      </div>
      {valor.pesoParcial && (
        <p className="rounded border border-warning bg-warning/10 p-1.5 text-[10px] font-semibold print:p-1 print:text-[8px]" data-testid="relatorio-peso-parcial">
          Peso médio PARCIAL: calculado só com {valor.pesoParcial.avesComPeso.toLocaleString("pt-BR")} de{" "}
          {(valor.pesoParcial.avesComPeso + valor.pesoParcial.avesSemPeso).toLocaleString("pt-BR")} aves (peso informado); {valor.pesoParcial.lotesSemPeso} lote(s) sem
          peso da balança ficaram de fora da média, mas contam nas aves do período.
        </p>
      )}
      {valor.cargas.length > 0 && (
        <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-[10px] print:text-[8px]">
          <thead>
            <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
              <th className="border border-hairline p-1.5 print:p-1">Lote</th>
              <th className="border border-hairline p-1.5 print:p-1">Aves</th>
              <th className="border border-hairline p-1.5 print:p-1">Peso vivo médio (kg)</th>
            </tr>
          </thead>
          <tbody>
            {valor.cargas.map((c, i) => (
              <tr key={c.id}>
                <td className="border border-hairline p-1.5 print:p-1">Lote {i + 1}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{c.quantity || "—"}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{c.avgLiveWeight || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {valor.chegada && (
        <div className="rounded border border-hairline bg-white p-2 text-[10px] print:p-1 print:text-[8px]" data-testid="relatorio-chegada">
          <strong>Cargas do período pela chegada ao pré-resfriamento:</strong> corte às {horaDeRelatorio(valor.chegada.corteEm)}, trânsito de{" "}
          {Math.floor(valor.chegada.transitoSegundos / 60)} min {String(valor.chegada.transitoSegundos % 60).padStart(2, "0")} s a{" "}
          {valor.chegada.velocidadeAvesH.toLocaleString("pt-BR")} aves/h (
          {valor.chegada.origemVelocidade === "observada" ? "velocidade deduzida da pendura das cargas" : "velocidade nominal da linha"}). Houve pausa da
          linha neste período: {valor.pausaInformada === "sim" ? "sim" : valor.pausaInformada === "nao" ? "não" : "não informado"}.
          {valor.paradas && valor.paradas.length > 0 && (
            <>
              {" "}
              Pausas da linha descontadas:{" "}
              {valor.paradas.map((p) => `${horaDeRelatorio(p.inicio)} → ${p.fim ? horaDeRelatorio(p.fim) : "ainda parada"}`).join("; ")}.
            </>
          )}
        </div>
      )}
      <TabelaTanques
        tanques={{
          preChiller: { ...valor.tanques.preChiller, rotulo: "Pré-chiller" },
          chiller1: { ...valor.tanques.chiller1, rotulo: "Chiller 01" },
          chiller2: { ...valor.tanques.chiller2, rotulo: "Chiller 02" },
        }}
      />
      <ApuracaoAgua linhas={apuracaoCarcacas(valor)} logica={LOGICA_CARCACAS} baseTitulo="Aves no período" />
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export function ChillerPartesRelatorio({ valor, titulo = "Renovação da Água — Chiller de Partes" }: { valor: ChillerPartesValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={valor.conformidade} />
      <TabelaTanques
        tanques={{
          chiller1: { ...valor.tanques.chiller1, rotulo: "Chiller 01 Partes" },
          chiller2: { ...valor.tanques.chiller2, rotulo: "Chiller 02 Partes" },
        }}
      />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Condenações</span><br /><strong>{valor.totalCondenacoes.toLocaleString("pt-BR")}</strong></div>
        <div>
          <span className="text-muted-foreground">Peso médio da carcaça (herdado do SPR Carcaças)</span>
          <br />
          <strong>{valor.pesoMedioCarcaca.toFixed(3)} kg</strong>
          <br />
          <span className="text-muted-foreground">{baseDoPesoDeCarcaca(valor.pesoMedioCarcaca)}</span>
        </div>
      </div>
      <ApuracaoAgua linhas={apuracaoPartes(valor)} logica={LOGICA_PARTES} baseTitulo="Massa processada" />
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export function LavagemFinalRelatorio({
  valor,
  titulo = "Chuveiro de Lavagem Final",
  pesoCarcaca = 0,
}: {
  valor: LavagemFinalValor;
  titulo?: string;
  /** Peso médio da carcaça do SPR Carcaças da mesma ficha — só para informar o L/kg. */
  pesoCarcaca?: number;
}) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={valor.conformidade} />
      <TabelaTanques tanques={{ chuveiro: { ...valor.chuveiro, rotulo: "Chuveiro Final" } }} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Aves bruto (SPR)</span><br /><strong>{valor.totalAvesBruto.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Condenações</span><br /><strong>{valor.condenacoesParciais || 0} parcial / {valor.condenasTotalSPR || 0} total</strong></div>
      </div>
      <ApuracaoAgua linhas={apuracaoChuveiro(valor, pesoCarcaca)} logica={LOGICA_CHUVEIRO} baseTitulo="Aves no chuveiro" />
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

const ROTULO_MIUDO: Record<string, string> = { coracao: "Coração", moela: "Moela", figado: "Fígado", cabeca: "Cabeça", pes: "Pés" };

export function MiniChillersRelatorio({ valor, titulo = "Renovação da Água — Mini-Chillers de Miúdos" }: { valor: MiniChillersValor; titulo?: string }) {
  const tanques = Object.fromEntries(
    Object.entries(valor.tanques).map(([chave, t]) => [chave, { ...t, rotulo: ROTULO_MIUDO[chave] ?? chave }])
  );
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={valor.conformidade} />
      <TabelaTanques tanques={tanques} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Peso carcaça (herdado)</span><br /><strong>{valor.pesoCarcaca.toFixed(3)} kg</strong></div>
      </div>
      <ApuracaoAgua linhas={apuracaoMiudos(valor)} logica={LOGICA_MIUDOS} baseTitulo="Produto (aves × peso do miúdo)" />
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export interface HorasServidorAbsorcao {
  /** Pesagem inicial (criado_em, hora do servidor). */
  iniciadoEm: string;
  /** Pesagem final (finalizado_em, hora do servidor); null = ainda em andamento. */
  finalizadoEm: string | null;
}

export function AbsorcaoAguaRelatorio({
  valor,
  titulo = "Teste de Absorção de Água (Especial SIF)",
  horas,
}: {
  valor: AbsorcaoAguaValor;
  titulo?: string;
  horas?: HorasServidorAbsorcao;
}) {
  const conforme = valor.status === "conforme";
  // Só as linhas com lacre, inicial OU final preenchidos. O % individual é informativo; a média
  // oficial do cabeçalho segue a fórmula por SOMA (calculada no widget e gravada em `valor`).
  const linhas = valor.items.map((a, i) => ({ a, n: i + 1 })).filter(({ a }) => a.seal || a.initial || a.final);
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={conforme} />
      {horas && (
        <p className="text-[10px] print:text-[8px]" data-testid="horas-absorcao">
          <span className="text-muted-foreground">Pesagem inicial: </span>
          <strong>{horasCompletas(horas.iniciadoEm)}</strong>
          <span className="text-muted-foreground"> · Pesagem final: </span>
          <strong>{horas.finalizadoEm ? horasCompletas(horas.finalizadoEm) : "em andamento"}</strong>
          <span className="text-muted-foreground"> (hora do servidor)</span>
        </p>
      )}
      <p className="text-[10px] font-bold text-ink print:text-[9px]">
        Média de Absorção: {formatarPercentual(valor.averagePercentage)} ({valor.validCount} de {valor.items.length} carcaças válidas)
        {!conforme && <span className="ml-2 text-down">⚠️ ALERTA: &gt; 8%</span>}
      </p>
      <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-[10px] print:text-[8px]">
        <thead>
          <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
            <th className="border border-hairline p-1.5 print:p-1">Amostra</th>
            <th className="border border-hairline p-1.5 print:p-1">Lacre</th>
            <th className="border border-hairline p-1.5 print:p-1">Peso inicial (kg)</th>
            <th className="border border-hairline p-1.5 print:p-1">Peso final (kg)</th>
            <th className="border border-hairline p-1.5 print:p-1">Absorção</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ a, n }) => {
            const individual = percentualIndividualAbsorcao(a);
            return (
              <tr key={a.id}>
                <td className="border border-hairline p-1.5 print:p-1">{n}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{a.seal || "—"}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{a.initial || "—"}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{a.final || "—"}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">
                  {a.descartada ? `Descartada${a.motivoDescarte ? `: ${a.motivoDescarte}` : ""}` : individual !== null ? formatarPercentual(individual) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DrippingTestRelatorio({
  valor,
  titulo = "Dripping Test — Portaria 210/98 (Especial SIF)",
  assinadoEm,
}: {
  valor: DrippingTestValor;
  titulo?: string;
  /** Hora (servidor) da assinatura do inspetor — a "hora final" do teste. */
  assinadoEm?: string | null;
}) {
  const conforme = valor.status === "conforme";
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo={titulo} conforme={conforme} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Lote</span><br /><strong>{valor.lote || "—"}</strong></div>
        <div data-testid="dripping-hora-inicial">
          <span className="text-muted-foreground">Hora inicial (salvamento da 1ª etapa)</span>
          <br />
          <strong>{valor.primeiraEtapaSalvaEm ? horasCompletas(valor.primeiraEtapaSalvaEm) : valor.horaInicio || "—"}</strong>
        </div>
        <div data-testid="dripping-hora-final">
          <span className="text-muted-foreground">Hora final (assinatura do monitoramento)</span>
          <br />
          <strong>{assinadoEm ? horasCompletas(assinadoEm) : "—"}</strong>
        </div>
      </div>
      <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-[10px] print:text-[8px]">
        <thead>
          <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
            <th className="border border-hairline p-1.5 print:p-1">Amostra</th>
            <th className="border border-hairline p-1.5 print:p-1">Lacre</th>
            <th className="border border-hairline p-1.5 print:p-1">M0</th>
            <th className="border border-hairline p-1.5 print:p-1">M1</th>
            <th className="border border-hairline p-1.5 print:p-1">Retirada</th>
            <th className="border border-hairline p-1.5 print:p-1">M2</th>
            <th className="border border-hairline p-1.5 print:p-1">M3</th>
            <th className="border border-hairline p-1.5 print:p-1">Absorção (%)</th>
          </tr>
        </thead>
        <tbody>
          {valor.items.map((a, i) => (
            <tr key={a.id} className={a.timeNc ? "bg-down-soft/50" : undefined}>
              <td className="border border-hairline p-1.5 print:p-1">{i + 1}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.seal || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m0 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m1 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.horaRetirada || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m2 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m3 || "—"}</td>
              {/* % de absorção de CADA carcaça: (M0 − M1 − M2) / (M0 − M1 − M3) × 100. */}
              <td
                className={`border border-hairline p-1.5 font-mono font-bold print:p-1 ${
                  absorcaoLinhaDripping(a) === null ? "" : acimaDoLimite(absorcaoLinhaDripping(a) as number, LIMITE_DRIPPING) ? "text-down" : "text-success"
                }`}
                data-testid={`dripping-absorcao-${i}`}
              >
                {absorcaoLinhaDripping(a) !== null ? formatarPercentual(absorcaoLinhaDripping(a) as number) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Amostras válidas</span><br /><strong>{valor.validCount}</strong></div>
        <div><span className="text-muted-foreground">Absorção média</span><br /><strong>{formatarPercentual(valor.averagePercentage)}</strong></div>
        {valor.timeNonConformity && <div className="text-down"><span>⚠ Tempo de drenagem fora do padrão</span></div>}
      </div>
    </div>
  );
}

export function ParadaEquipamentoRelatorio({ valor, titulo = "Registro de Parada de Equipamento" }: { valor: ParadaEquipamentoValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
      <div className="grid grid-cols-3 gap-2 text-[10px] print:text-[8px]">
        <div><span className="text-muted-foreground">Parada</span><br /><strong>{valor.hora_parada || "—"}</strong></div>
        <div><span className="text-muted-foreground">Retomada</span><br /><strong>{valor.hora_retomada || "—"}</strong></div>
        <div><span className="text-muted-foreground">Tempo inativo</span><br /><strong>{valor.tempo_minutos} min</strong></div>
      </div>
    </div>
  );
}

export function OcorrenciaPragasRelatorio({ valor, titulo = "Ocorrência de Pragas" }: { valor: OcorrenciaPragasValor; titulo?: string }) {
  const presentes = pragasPresentes(valor);
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        {/* Pragas não geram não conformidade/RNC: selo informativo, nunca "Não Conforme". */}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider print:text-[8px] ${
            valor.houvePraga ? "bg-warning/20 text-warning-foreground" : "bg-success/15 text-success"
          }`}
        >
          {valor.houvePraga ? "Com ocorrência" : "Sem ocorrência"}
        </span>
      </div>
      <p className="text-[10px] print:text-[8px]">
        {presentes.length === 0 ? (
          <strong>Ausência de pragas.</strong>
        ) : (
          <>
            <span className="text-muted-foreground">Pragas identificadas: </span>
            <strong>{presentes.map((chave) => rotuloDaPraga(chave, valor.outrasPragas)).join(", ")}</strong>
          </>
        )}
      </p>
      {valor.houvePraga && (
        <p className="text-[10px] print:text-[8px]">
          <span className="text-muted-foreground">Ações corretivas: </span>
          {valor.acoesCorretivas ? valor.medidasCorretivas : <strong>não registradas</strong>}
        </p>
      )}
    </div>
  );
}

export function EsperaAvesRelatorio({ valor, titulo = "Bem-Estar Animal — Área de Espera" }: { valor: EsperaAvesValor; titulo?: string }) {
  const estado = (b: boolean | null) => (b === null ? "—" : b ? "Ligados" : "Desligados");
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-espera-aves">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="max-sm:block max-sm:overflow-x-auto w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="font-normal">Box</th>
            <th className="font-normal">GTA</th>
            <th className="font-normal">Integrado</th>
            <th className="font-normal">Aviário / Núcleo</th>
            <th className="font-normal">Aves</th>
            <th className="font-normal">Comportamento</th>
          </tr>
        </thead>
        <tbody>
          {valor.boxes.map((b, i) => {
            const comp = COMPORTAMENTOS_AVES.find((c) => c.chave === b.comportamento);
            return (
              <tr key={`${b.box}-${i}`}>
                <td className="font-bold">{b.box || "—"}</td>
                <td>{b.gta || "—"}</td>
                <td>{b.integrado || "—"}</td>
                <td>
                  {b.aviario}
                  {b.nucleo ? ` / ${b.nucleo}` : ""}
                </td>
                <td>{b.qtdAves.toLocaleString("pt-BR")}</td>
                <td className={`font-bold ${b.comportamento === "ofegantes" ? "text-destructive" : ""}`}>
                  {!comp ? "—" : comp.chave === "outras" && b.outrasCondicoes ? `Outras: ${b.outrasCondicoes}` : comp.rotulo}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="grid grid-cols-3 gap-2 text-[10px] print:text-[8px]">
        <div><span className="text-muted-foreground">Temperatura ambiente</span><br /><strong>{valor.temperaturaC ? `${valor.temperaturaC} °C` : "—"}</strong></div>
        <div><span className="text-muted-foreground">Aspersores</span><br /><strong>{estado(valor.aspersoresLigados)}</strong></div>
        <div><span className="text-muted-foreground">Ventiladores</span><br /><strong>{estado(valor.ventiladoresLigados)}</strong></div>
      </div>
      {valor.houveOfegantes && (
        <p className="text-[10px] print:text-[8px]">
          <span className="text-muted-foreground">Ação corretiva (aves ofegantes): </span>
          {valor.acaoCorretiva ? (
            <strong>aspersores e ventiladores acionados{valor.acaoCorretivaEm ? ` em ${formatarDataHora(valor.acaoCorretivaEm)}` : ""}</strong>
          ) : (
            <strong>equipamentos já estavam ligados</strong>
          )}
        </p>
      )}
      {valor.conformidade === false && valor.detalhesRNC && (
        <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>
      )}
    </div>
  );
}

export function PesoCaixaRelatorio({ valor, titulo = "Peso Vivo por Caixa de Transporte" }: { valor: PesoCaixaValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-peso-caixa">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="max-sm:block max-sm:overflow-x-auto w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2">GTA</th>
            <th className="pr-2">Integrado</th>
            <th className="pr-2">Aves/caixa</th>
            <th className="pr-2">Peso médio (kg)</th>
            <th>Peso/caixa (kg)</th>
          </tr>
        </thead>
        <tbody>
          {(valor.cargas ?? []).map((c, i) => {
            const aves = Number.parseInt(c.avesPorCaixa, 10);
            const peso = Number(String(c.pesoMedioKg).replace(",", "."));
            const total = Number.isFinite(aves) && Number.isFinite(peso) ? Math.round(aves * peso * 1000) / 1000 : null;
            return (
              <tr key={i}>
                <td className="pr-2">{c.gta || "—"}</td>
                <td className="pr-2">{c.integrado || "—"}</td>
                <td className="pr-2">{c.avesPorCaixa || "—"}</td>
                <td className="pr-2">{c.pesoMedioKg || "—"}</td>
                <td className={total !== null && total > 25 ? "font-black text-destructive" : "font-black"}>{total === null ? "—" : total.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function RastreabilidadeDoaRelatorio({ valor, titulo = "Rastreabilidade e Controle de DOA" }: { valor: RastreabilidadeDoaValor; titulo?: string }) {
  // Peso médio vem do monitoramento de Densidade nas Caixas, que pode ser feito DEPOIS desta apuração:
  // se não ficou gravado, completa na exibição com o herdado atual (sem alterar o registro assinado).
  const { data: herdadas } = useCargasRastreabilidade(valor.dataAbate);
  const pesoHerdado = new Map((herdadas ?? []).map((h) => [h.carga_id, h.peso_medio_kg ?? ""]));
  const cargas = (valor.cargas ?? []).map((c) => ({ ...c, pesoMedioKg: c.pesoMedioKg || pesoHerdado.get(c.cargaId) || "" }));
  const comNota = cargas.filter((c) => c.notaSaldo);
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-rastreabilidade-doa">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <span className="text-[10px] font-black print:text-[8px]">DOA do dia: {formatarPctDoa(valor.doaTotalPct)}</span>
      </div>
      <table className="max-sm:block max-sm:overflow-x-auto w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Ordem</th>
            <th className="pr-2 font-normal">Início do abate</th>
            <th className="pr-2 font-normal">Veículo</th>
            <th className="pr-2 font-normal">GTA</th>
            <th className="pr-2 font-normal">Integrado / Aviário</th>
            <th className="pr-2 font-normal">Peso médio (kg)</th>
            <th className="pr-2 font-normal">Previstas</th>
            <th className="pr-2 font-normal">Recebidas</th>
            <th className="pr-2 font-normal">Mortas</th>
            <th className="font-normal">% DOA</th>
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => (
            <tr key={c.cargaId} className={c.notaSaldo ? "bg-amber-500/10" : ""}>
              <td className="pr-2 font-bold">{c.ordemPendura ?? "—"}</td>
              <td className="pr-2">{formatarDataHora(c.penduraInicioEm)}</td>
              <td className="pr-2">{c.placa || "—"}</td>
              <td className="pr-2">{c.gta || "—"}</td>
              <td className="pr-2">
                {c.integrado}
                {c.aviario ? ` / ${c.aviario}` : ""}
                {c.nucleo ? ` / ${c.nucleo}` : ""}
              </td>
              <td className="pr-2">{c.pesoMedioKg || "—"}</td>
              <td className="pr-2">{c.qtdPrevista.toLocaleString("pt-BR")}</td>
              <td className="pr-2">{c.avesRecebidas || "—"}</td>
              <td className="pr-2">{c.avesMortas || "—"}</td>
              <td className="font-black">{formatarPctDoa(c.doaPct)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-black">
            <td colSpan={7} className="pr-2 pt-1 text-right">Total</td>
            <td className="pr-2 pt-1">{valor.totalRecebidas.toLocaleString("pt-BR")}</td>
            <td className="pr-2 pt-1">{valor.totalMortas.toLocaleString("pt-BR")}</td>
            <td className="pt-1">{formatarPctDoa(valor.doaTotalPct)}</td>
          </tr>
        </tfoot>
      </table>
      {comNota.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] font-semibold print:p-1 print:text-[8px]">
          <p className="font-black uppercase tracking-wider">Correção de saldo necessária</p>
          {comNota.map((c) => (
            <p key={c.cargaId}>GTA {c.gta}: {c.notaSaldo}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function CaixasVaziasRelatorio({ valor, titulo = "Caixas de Transporte Vazias antes da Imersão" }: { valor: CaixasVaziasValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-caixas-vazias">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <p className="text-[10px] print:text-[8px]">
        <span className="text-muted-foreground">Todas as caixas vazias: </span>
        <strong className={valor.todasVazias === false ? "text-destructive" : ""}>{valor.todasVazias === null ? "—" : valor.todasVazias ? "Sim" : "Não"}</strong>
        {valor.todasVazias === false && valor.caixasNaoVazias && <span> · Caixas não vazias: <strong>{valor.caixasNaoVazias}</strong></span>}
      </p>
      {valor.acaoCorretiva && (
        <p className="text-[10px] print:text-[8px]">
          <span className="text-muted-foreground">Ação corretiva: </span>
          <strong>{valor.acaoCorretiva}</strong>
        </p>
      )}
    </div>
  );
}

export function PenduraAvesRelatorio({ valor, titulo = "Bem-Estar Animal — Sala de Pendura" }: { valor: PenduraAvesValor; titulo?: string }) {
  const simNao = (b: boolean | null, sim: string, nao: string) => (b === null ? "—" : b ? sim : nao);
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-pendura-aves">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-5 print:grid-cols-5 print:text-[8px]">
        <div><span className="text-muted-foreground">Temperatura</span><br /><strong>{valor.temperaturaC ? `${valor.temperaturaC} °C` : "—"}</strong></div>
        <div><span className="text-muted-foreground">Ventiladores</span><br /><strong>{simNao(valor.ventiladoresLigados, "Ligados", "Desligados")}</strong></div>
        <div><span className="text-muted-foreground">Luzes</span><br /><strong>{simNao(valor.luzesAcesas, "Acesas", "Apagadas")}</strong></div>
        <div>
          <span className="text-muted-foreground">Ruídos desnecessários</span><br />
          <strong className={valor.ruidosDesnecessarios ? "text-destructive" : ""}>{simNao(valor.ruidosDesnecessarios, "Sim", "Não")}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Pendura conforme bem-estar</span><br />
          <strong className={valor.auxiliaresConformes === false ? "text-destructive" : ""}>{simNao(valor.auxiliaresConformes, "Sim", "Não")}</strong>
        </div>
      </div>
      {valor.descricaoDesvio && (
        <p className="text-[10px] print:text-[8px]">
          <span className="text-muted-foreground">Ocorrência / ação corretiva: </span>
          <strong>{valor.descricaoDesvio}</strong>
        </p>
      )}
      {valor.conformidade === false && valor.detalhesRNC && (
        <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>
      )}
    </div>
  );
}

export function EletronarcoseAvesRelatorio({ valor, titulo = "Bem-Estar Animal — Eletronarcose" }: { valor: EletronarcoseAvesValor; titulo?: string }) {
  const num = (t: string, un: string) => (t ? `${t} ${un}` : "—");
  const n = (t: string) => Number(String(t).replace(",", "."));
  const fora = (t: string, min: number, max: number) => (t && (n(t) < min || n(t) > max) ? "text-destructive" : "");
  const sim = (b: boolean | null) => (b === null ? "—" : b ? "Sim" : "Não");
  const ruim = (b: boolean | null) => (b ? "text-destructive" : "");
  const Item = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
    <div><span className="text-muted-foreground">{rotulo}</span><br />{children}</div>
  );
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-eletronarcose-aves">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4 print:grid-cols-4 print:text-[8px]">
        <Item rotulo="Voltagem (30 a 150 V)"><strong className={fora(valor.voltagemV, 30, 150)}>{num(valor.voltagemV, "V")}</strong></Item>
        <Item rotulo="Frequência (20 a 1500 Hz)"><strong className={fora(valor.frequenciaHz, 20, 1500)}>{num(valor.frequenciaHz, "Hz")}</strong></Item>
        <Item rotulo="Corrente (25 a 200 mA/ave)"><strong className={fora(valor.correnteMa, 25, 200)}>{num(valor.correnteMa, "mA")}</strong></Item>
        <Item rotulo="Tempo na cuba"><strong>{num(valor.tempoCubaS, "s")}</strong></Item>
        <Item rotulo="Contenção até a cuba (máx. 60 s)"><strong className={valor.contencaoS && n(valor.contencaoS) > 60 ? "text-destructive" : ""}>{num(valor.contencaoS, "s")}</strong></Item>
        <Item rotulo="Saída da cuba até sangria (máx. 12 s)"><strong className={valor.saidaSangriaS && n(valor.saidaSangriaS) > 12 ? "text-destructive" : ""}>{num(valor.saidaSangriaS, "s")}</strong></Item>
        <Item rotulo="Sangria (mín. 180 s)"><strong className={valor.sangriaS && n(valor.sangriaS) < 180 ? "text-destructive" : ""}>{num(valor.sangriaS, "s")}</strong></Item>
        <Item rotulo={valor.posturaEstacaoS === undefined && valor.posturaEstacaoMin ? "Postura de estação (registrado em minutos)" : "Postura de estação (máx. 60 s)"}>
          {valor.posturaEstacaoS === undefined && valor.posturaEstacaoMin ? (
            <strong>{num(valor.posturaEstacaoMin, "min")}</strong>
          ) : (
            <strong className={valor.posturaEstacaoS && n(valor.posturaEstacaoS) > 60 ? "text-destructive" : ""}>{num(valor.posturaEstacaoS, "s")}</strong>
          )}
        </Item>
        <Item rotulo="Pré-choque"><strong className={ruim(valor.preChoque)}>{sim(valor.preChoque)}</strong></Item>
        <Item rotulo="Aves sem sangrar"><strong className={ruim(valor.avesSemSangrar)}>{sim(valor.avesSemSangrar)}</strong></Item>
        <Item rotulo="Vocalização"><strong className={ruim(valor.vocalizacao)}>{sim(valor.vocalizacao)}</strong></Item>
        <Item rotulo="Reflexos oculares"><strong className={ruim(valor.reflexosOculares)}>{sim(valor.reflexosOculares)}</strong></Item>
        <Item rotulo="Asas afastadas do corpo"><strong className={ruim(valor.asasAfastadas)}>{sim(valor.asasAfastadas)}</strong></Item>
        <Item rotulo="Respiração rítmica"><strong className={ruim(valor.respiracaoRitmica)}>{sim(valor.respiracaoRitmica)}</strong></Item>
        <Item rotulo="Tremores involuntários"><strong className={ruim(valor.tremores === false)}>{sim(valor.tremores)}</strong></Item>
      </div>
      {valor.descricaoDesvio && (
        <p className="text-[10px] print:text-[8px]">
          <span className="text-muted-foreground">Ocorrência / ação corretiva: </span>
          <strong>{valor.descricaoDesvio}</strong>
        </p>
      )}
      {valor.conformidade === false && valor.detalhesRNC && (
        <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>
      )}
    </div>
  );
}

export function RecepcaoAvesRelatorio({ valor, titulo = "Recepção de Aves / Bem-Estar Animal" }: { valor: RecepcaoAvesValor; titulo?: string }) {
  const condicao = CONDICOES_ANIMAIS.find((c) => c.chave === valor.condicaoAnimais);
  const jejumAcima = valor.jejumMin !== null && valor.jejumMin > LIMITE_JEJUM_MAX_H * 60;
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-recepcao-aves">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-5 print:grid-cols-5 print:text-[8px]">
        <div><span className="text-muted-foreground">GTA</span><br /><strong>{valor.gta}</strong></div>
        <div><span className="text-muted-foreground">Integrado</span><br /><strong>{valor.integrado}</strong></div>
        <div><span className="text-muted-foreground">Aviário / Núcleo</span><br /><strong>{valor.aviario}{valor.nucleo ? ` / ${valor.nucleo}` : ""}</strong></div>
        <div><span className="text-muted-foreground">Aves</span><br /><strong>{valor.qtdAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Veículo (placa)</span><br /><strong>{valor.placa || "—"}</strong></div>
      </div>
      <p className="text-[10px] print:text-[8px]">
        <span className="text-muted-foreground">Condições estruturais do veículo: </span>
        <strong className={valor.condicaoVeiculo === "NAO_CONFORME" ? "text-destructive" : ""}>
          {valor.condicaoVeiculo === "NAO_CONFORME" ? `Não conforme${valor.obsVeiculo ? ` — ${valor.obsVeiculo}` : ""}` : "Conforme"}
        </strong>
      </p>
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-5 print:grid-cols-5 print:text-[8px]">
        <div><span className="text-muted-foreground">Retirada da ração</span><br /><strong>{formatarDataHora(valor.retiradaRacaoEm)}</strong></div>
        <div><span className="text-muted-foreground">Início do embarque</span><br /><strong>{formatarDataHora(valor.embarqueInicioEm)}</strong></div>
        <div><span className="text-muted-foreground">Término do embarque</span><br /><strong>{formatarDataHora(valor.embarqueFimEm)}</strong></div>
        <div><span className="text-muted-foreground">Chegada ao abatedouro</span><br /><strong>{formatarDataHora(valor.chegadaEm)}</strong></div>
        <div><span className="text-muted-foreground">Início da pendura</span><br /><strong>{formatarDataHora(valor.penduraInicioEm)}</strong></div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4 print:grid-cols-4 print:text-[8px]">
        <div>
          <span className="text-muted-foreground">Jejum alimentar (ração → pendura)</span><br />
          <strong className={jejumAcima ? "text-destructive" : ""}>{formatarDuracao(valor.jejumMin)}</strong>
        </div>
        <div><span className="text-muted-foreground">Dieta hídrica (embarque → pendura)</span><br /><strong>{formatarDuracao(valor.dietaHidricaMin)}</strong></div>
        <div><span className="text-muted-foreground">Tempo total de viagem</span><br /><strong>{formatarDuracao(valor.viagemMin)}</strong></div>
        <div><span className="text-muted-foreground">Espera antes do abate</span><br /><strong>{formatarDuracao(valor.esperaMin)}</strong></div>
      </div>
      <p className="text-[10px] print:text-[8px]">
        <span className="text-muted-foreground">Condição dos animais na chegada: </span>
        <strong>{!condicao ? "—" : condicao.chave === "outras" && valor.outrasCondicoes ? `Outras: ${valor.outrasCondicoes}` : condicao.rotulo}</strong>
      </p>
      {valor.conformidade === false && valor.detalhesRNC && (
        <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>
      )}
    </div>
  );
}

const fmtTemp = (texto: string | undefined) => {
  const t = lerTemperatura(texto);
  return t === null ? "—" : `${t.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ºC`;
};

export function TemperaturaResfriamentoRelatorio({
  valor,
  titulo = "Temperaturas dos Sistemas de Pré-resfriamento",
}: {
  valor: TemperaturaResfriamentoValor;
  titulo?: string;
}) {
  const acima = (texto: string | undefined, limite: number | null) => {
    const t = lerTemperatura(texto);
    return limite !== null && t !== null && t > limite;
  };
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-temperatura-resfriamento">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>

      <p className="text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Temperatura da água</p>
      <table className="w-full text-[10px] print:text-[8px]">
        <tbody>
          {PONTOS_AGUA.map((p) => {
            const texto = valor.agua?.[p.chave];
            const nc = acima(texto, LIMITE_AGUA_C[p.chave]);
            return (
              <tr key={p.chave}>
                <td className="pr-2">{p.rotulo}</td>
                <td className={nc ? "font-black text-destructive" : "font-black"}>{fmtTemp(texto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Temperatura ambiente</p>
      <table className="w-full text-[10px] print:text-[8px]">
        <tbody>
          {PONTOS_AMBIENTE.map((p) => {
            const texto = valor.ambiente?.[p.chave];
            const nc = acima(texto, LIMITE_AMBIENTE_C[p.chave]);
            return (
              <tr key={p.chave}>
                <td className="pr-2">{p.rotulo}</td>
                <td className={nc ? "font-black text-destructive" : "font-black"}>{fmtTemp(texto)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Temperatura dos produtos na saída</p>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Produto</th>
            <th className="pr-2 font-normal">Amostra 01</th>
            <th className="font-normal">Amostra 02</th>
          </tr>
        </thead>
        <tbody>
          {PRODUTOS.map((p) => {
            const a = valor.produtos?.[p.chave];
            const limite = LIMITE_PRODUTO_C[p.chave];
            if (a?.semProduto) {
              return (
                <tr key={p.chave}>
                  <td className="pr-2">{p.rotulo}</td>
                  <td colSpan={2} className="italic text-muted-foreground">Sem produto no momento</td>
                </tr>
              );
            }
            return (
              <tr key={p.chave}>
                <td className="pr-2">{p.chave === "parte" && valor.tipoParte ? `${p.rotulo} (${valor.tipoParte})` : p.rotulo}</td>
                <td className={acima(a?.amostra1, limite) ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>{fmtTemp(a?.amostra1)}</td>
                <td className={acima(a?.amostra2, limite) ? "font-black text-destructive" : "font-black"}>{fmtTemp(a?.amostra2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function PotabilidadeAguaRelatorio({
  valor,
  titulo = "Potabilidade da Água dos Sistemas de Pré-resfriamento",
}: {
  valor: PotabilidadeAguaValor;
  titulo?: string;
}) {
  const fmt = (texto: string | undefined) => {
    const n = lerMedida(texto);
    return n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-potabilidade-agua">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Sistema</th>
            <th className="pr-2 font-normal">Tanque testado</th>
            <th className="pr-2 font-normal">pH</th>
            <th className="font-normal">Cloro (ppm)</th>
          </tr>
        </thead>
        <tbody>
          {SISTEMAS_POTABILIDADE.map((s) => {
            const t = valor.sistemas?.[s.chave];
            return (
              <tr key={s.chave}>
                <td className="pr-2">{s.rotulo.replace("Pré-resfriamento de ", "")}</td>
                <td className="pr-2">{t ? rotuloTanque(s.chave, t.tanque) : "—"}</td>
                <td className={phForaDoLimite(lerMedida(t?.ph)) ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>{fmt(t?.ph)}</td>
                <td className={cloroForaDoLimite(lerMedida(t?.cloro)) ? "font-black text-destructive" : "font-black"}>{fmt(t?.cloro)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function ControleAbsorcaoRelatorio({ valor, titulo = "Controle de Absorção" }: { valor: ControleAbsorcaoValor; titulo?: string }) {
  const fmtTemp = (texto: string | undefined) => {
    const n = lerTemperatura(texto);
    return n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ºC`;
  };
  const tempo = lerMedida(valor.tempoPermanenciaMin);
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-controle-absorcao">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <p className="text-[10px] print:text-[8px]">
        Tempo de permanência das carcaças no pré-chiller: <strong>{tempo === null ? "—" : `${tempo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} min`}</strong>
      </p>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Tanque</th>
            <th className="pr-2 font-normal">Temperatura da água</th>
            <th className="font-normal">Borbulhamento</th>
          </tr>
        </thead>
        <tbody>
          {TANQUES_ABSORCAO.map((t) => (
            <tr key={t.chave}>
              <td className="pr-2">{t.rotulo}</td>
              <td className={temperaturaAbsorcaoAcimaDoLimite(t.chave, lerTemperatura(valor.temperaturas?.[t.chave])) ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>
                {fmtTemp(valor.temperaturas?.[t.chave])}
              </td>
              <td className="font-black">{rotuloBorbulhamento(valor.borbulhamento?.[t.chave])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {valor.observacao?.trim() && <p className="text-[10px] italic text-ink print:text-[8px]">Observações: {valor.observacao}</p>}
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function QualidadeMiudosRelatorio({ valor, titulo = "Qualidade de Miúdos e Pertences" }: { valor: QualidadeMiudosValor; titulo?: string }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-qualidade-miudos">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Parte / defeito</th>
            <th className="pr-2 font-normal">Avaliadas</th>
            <th className="pr-2 font-normal">Com defeito</th>
            <th className="pr-2 font-normal">%</th>
            <th className="font-normal">Máx.</th>
          </tr>
        </thead>
        <tbody>
          {PARTES_MIUDOS.map((p) => {
            const reg = valor.partes?.[p.chave];
            const amostra = lerContagem(reg?.amostra);
            return p.defeitos.map((d, i) => {
              const defeitos = lerContagem(reg?.defeitos?.[d.chave]);
              const nc = defeitoAcimaDoMaximo(defeitos, amostra, d.maximoPct);
              return (
                <tr key={`${p.chave}-${d.chave}`}>
                  <td className="pr-2">
                    {i === 0 && <strong>{p.rotulo}: </strong>}
                    {d.rotulo}
                  </td>
                  <td className="pr-2">{i === 0 ? (amostra ?? "—") : ""}</td>
                  <td className="pr-2">{defeitos ?? "—"}</td>
                  <td className={nc ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>{formatarPct(percentualDefeito(defeitos, amostra))}</td>
                  <td>{d.maximoPct.toLocaleString("pt-BR")}%</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
      {valor.observacao?.trim() && <p className="text-[10px] italic text-ink print:text-[8px]">Observações: {valor.observacao}</p>}
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function PotabilidadePontosRelatorio({ valor, titulo = "Potabilidade da Água nos Pontos de Coleta" }: { valor: PotabilidadePontosValor; titulo?: string }) {
  const fmt = (texto: string | undefined) => {
    const n = lerMedida(texto);
    return n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  };
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid="relatorio-potabilidade-pontos">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Ponto de coleta</th>
            <th className="pr-2 font-normal">pH</th>
            <th className="font-normal">Cloro (ppm)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="pr-2">{rotuloPonto(valor.ponto)}</td>
            <td className={phPontoForaDoLimite(lerMedida(valor.ph)) ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>{fmt(valor.ph)}</td>
            <td className={cloroPontoForaDoLimite(lerMedida(valor.cloro)) ? "font-black text-destructive" : "font-black"}>{fmt(valor.cloro)}</td>
          </tr>
        </tbody>
      </table>
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}

export function ChecklistConformidadeRelatorio({ tipo, valor, titulo }: { tipo: TipoChecklist; valor: ChecklistConformidadeValor; titulo?: string }) {
  const def = CHECKLISTS[tipo];
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2" data-testid={`relatorio-checklist-${tipo}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo ?? def.titulo}</span>
        <SeloConformidade conforme={valor.conformidade !== false} />
      </div>
      <table className="w-full text-[10px] print:text-[8px]">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-2 font-normal">Item</th>
            {salasDoChecklist(tipo).map((sala) => (
              <th key={sala.chave} className="pr-2 font-normal">
                {sala.chave === "geral" ? "Resposta" : `Sala de ${sala.curto}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {def.itens.map((item) => (
            <tr key={item.chave}>
              <td className="pr-2">{item.rotulo}</td>
              {salasDoChecklist(tipo).map((sala) => {
                const resposta = valor.salas?.[sala.chave]?.[item.chave];
                return (
                  <td key={sala.chave} className={respostaNaoConforme(item.modo, resposta) ? "pr-2 font-black text-destructive" : "pr-2 font-black"}>
                    {rotuloResposta(item.modo, resposta)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {valor.observacao?.trim() && <p className="text-[10px] italic text-ink print:text-[8px]">Observações: {valor.observacao}</p>}
      {valor.conformidade === false && valor.detalhesRNC && <p className="text-[10px] font-semibold text-destructive print:text-[8px]">{valor.detalhesRNC}</p>}
    </div>
  );
}
