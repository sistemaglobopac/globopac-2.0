// Onde está a não conformidade de um campo? Usado pelo adendo do relatório: ao pedir o adendo sobre um campo não
// conforme, o item e o dado a corrigir já vêm escolhidos (o verificador só informa o novo valor).
// Cada resolver devolve o caminho do dado DENTRO do campo (ex.: "tanques.chiller1.cur"), o mesmo formato gravado pelo
// adendo (adendoCampos.ts, que prefixa a chave do campo). Funções PURAS, testadas em tests/unit/alvoNaoConformidade.test.ts.
// Cada resolver segue a mesma regra que o widget usou para marcar o campo como não conforme. Sem resolver (ou sem
// certeza), devolve undefined e o verificador escolhe o dado como antes.
import { apuracaoCarcacas, apuracaoChuveiro, apuracaoMiudos, apuracaoPartes } from "../fields/apuracaoRelatorio";
import { absorcaoLinhaDripping, LIMITE_DRIPPING, linhaAbsorcaoValida, percentualIndividualAbsorcao, acimaDoLimite as mediaAcimaDoLimite } from "../fields/calculosAbsorcao";
import { CHECKLISTS, itensDaSala, respostaNaoConforme, salasDoChecklist, type TipoChecklist } from "../fields/checklistConformidade";
import { TANQUES_ABSORCAO, tanqueParado, temperaturaAbsorcaoAcimaDoLimite } from "../fields/controleAbsorcao";
import { FAIXA_CORRENTE_MA, FAIXA_FREQUENCIA_HZ, FAIXA_VOLTAGEM_V, foraDaFaixa, lerNumero, LIMITE_CONTENCAO_MAX_S, LIMITE_POSTURA_ESTACAO_MAX_S, LIMITE_SAIDA_SANGRIA_MAX_S, LIMITE_SANGRIA_MIN_S, SINAIS_INSENSIBILIZACAO } from "../fields/eletronarcoseAves";
import { acaoCorretivaPendente } from "../fields/esperaAves";
import { acimaDoLimite as pesoPorCaixaAcimaDoLimite } from "../fields/pesoCaixa";
import { cloroForaDoLimite, lerMedida, phForaDoLimite } from "../fields/potabilidadeAgua";
import { cloroPontoForaDoLimite, phPontoForaDoLimite } from "../fields/potabilidadePontos";
import { defeitoAcimaDoMaximo, lerContagem, PARTES_MIUDOS, parteExiste } from "../fields/qualidadeMiudos";
import { LIMITE_JEJUM_MAX_H, tempos } from "../fields/recepcaoAves";
import { SISTEMAS_POTABILIDADE } from "../fields/potabilidadeAgua";
import {
  LIMITE_AGUA_C,
  LIMITE_AMBIENTE_C,
  LIMITE_PRODUTO_C,
  lerTemperatura,
  PONTOS_AGUA,
  PONTOS_AMBIENTE,
  pontoParado,
  PRODUTOS,
} from "../fields/temperaturaResfriamento";
import type {
  AbsorcaoAguaValor,
  CaixasVaziasValor,
  ChecklistConformidadeValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  ControleAbsorcaoValor,
  DrippingTestValor,
  EletronarcoseAvesValor,
  EsperaAvesValor,
  LavagemFinalValor,
  MiniChillersValor,
  PenduraAvesValor,
  PesoCaixaValor,
  PotabilidadeAguaValor,
  PotabilidadePontosValor,
  QualidadeMiudosValor,
  RecepcaoAvesValor,
  TemperaturaResfriamentoValor,
} from "../fields/tiposCompostos";
import type { AlvoAdendo } from "./adendoCampos";

const CHAVES_CARCACAS = ["preChiller", "chiller1", "chiller2"] as const;
const CHAVES_PARTES = ["chiller1", "chiller2"] as const;
const CHAVES_MIUDOS = ["coracao", "moela", "figado", "cabeca", "pes"] as const;

/** Primeiro tanque cuja vazão ficou abaixo da meta: a leitura ATUAL do hidrômetro dele é o dado a corrigir. */
function primeiroTanqueAbaixoDaMeta(linhas: { conforme: boolean | null }[], chaves: readonly string[]): string | undefined {
  const i = linhas.findIndex((l) => l.conforme === false);
  return i >= 0 ? `tanques.${chaves[i]}.cur` : undefined;
}

/** Índice do maior valor (ignorando os nulos); -1 se não há nenhum. */
function indiceDoMaior(valores: (number | null)[]): number {
  let melhor = -1;
  valores.forEach((v, i) => {
    if (v !== null && (melhor < 0 || v > (valores[melhor] as number))) melhor = i;
  });
  return melhor;
}

type Resolvedor = (valor: never) => string | undefined;
const r = <T>(fn: (v: T) => string | undefined) => fn as unknown as Resolvedor;

/** Checklist (águas residuais, ventilação, higiene, PSO…): o primeiro item respondido como não conforme. */
function resolverChecklist(tipo: TipoChecklist) {
  return r((v: ChecklistConformidadeValor) => {
    for (const sala of salasDoChecklist(tipo)) {
      for (const item of itensDaSala(tipo, sala.chave)) {
        if (respostaNaoConforme(item.modo, v.salas?.[sala.chave]?.[item.chave])) return `salas.${sala.chave}.${item.chave}`;
      }
    }
    return undefined;
  });
}

const RESOLVEDORES: Record<string, Resolvedor> = {
  // ---- Vazão de água (SPR): a leitura atual do tanque abaixo da meta
  chiller_carcacas: r((v: ChillerCarcacasValor) => primeiroTanqueAbaixoDaMeta(apuracaoCarcacas(v), CHAVES_CARCACAS)),
  chiller_partes: r((v: ChillerPartesValor) => primeiroTanqueAbaixoDaMeta(apuracaoPartes(v), CHAVES_PARTES)),
  mini_chillers: r((v: MiniChillersValor) => primeiroTanqueAbaixoDaMeta(apuracaoMiudos(v), CHAVES_MIUDOS)),
  lavagem_final: r((v: LavagemFinalValor) => (apuracaoChuveiro(v)[0]?.conforme === false ? "chuveiro.cur" : undefined)),

  // ---- Temperaturas
  controle_absorcao: r((v: ControleAbsorcaoValor) => {
    const t = TANQUES_ABSORCAO.find((x) => !tanqueParado(v, x.chave) && temperaturaAbsorcaoAcimaDoLimite(x.chave, lerTemperatura(v.temperaturas?.[x.chave])));
    return t ? `temperaturas.${t.chave}` : undefined;
  }),
  temperatura_resfriamento: r((v: TemperaturaResfriamentoValor) => {
    for (const p of PONTOS_AGUA) {
      const limite = LIMITE_AGUA_C[p.chave];
      const t = lerTemperatura(v.agua?.[p.chave]);
      if (!pontoParado(v, p.chave) && limite !== null && t !== null && t > limite) return `agua.${p.chave}`;
    }
    for (const p of PONTOS_AMBIENTE) {
      const limite = LIMITE_AMBIENTE_C[p.chave];
      const t = lerTemperatura(v.ambiente?.[p.chave]);
      if (limite !== null && t !== null && t > limite) return `ambiente.${p.chave}`;
    }
    for (const p of PRODUTOS) {
      const limite = LIMITE_PRODUTO_C[p.chave];
      const produto = v.produtos?.[p.chave];
      if (limite === null || !produto || produto.semProduto) continue;
      for (const amostra of ["amostra1", "amostra2"] as const) {
        const t = lerTemperatura(produto[amostra]);
        if (t !== null && t > limite) return `produtos.${p.chave}.${amostra}`;
      }
    }
    return undefined;
  }),

  // ---- Potabilidade da água: o pH ou o cloro fora do limite
  potabilidade_agua: r((v: PotabilidadeAguaValor) => {
    for (const s of SISTEMAS_POTABILIDADE) {
      const t = v.sistemas?.[s.chave];
      if (!t || t.semTeste) continue;
      if (phForaDoLimite(lerMedida(t.ph))) return `sistemas.${s.chave}.ph`;
      if (cloroForaDoLimite(lerMedida(t.cloro))) return `sistemas.${s.chave}.cloro`;
    }
    return undefined;
  }),
  potabilidade_pontos: r((v: PotabilidadePontosValor) => {
    if (phPontoForaDoLimite(lerMedida(v.ph))) return "ph";
    if (cloroPontoForaDoLimite(lerMedida(v.cloro))) return "cloro";
    return undefined;
  }),

  // ---- Qualidade de miúdos: o primeiro defeito acima do máximo tolerado
  qualidade_miudos: r((v: QualidadeMiudosValor) => {
    for (const p of PARTES_MIUDOS) {
      const reg = v.partes?.[p.chave];
      if (parteExiste(reg) === false) continue;
      const amostra = lerContagem(reg?.amostra);
      for (const d of p.defeitos) {
        if (defeitoAcimaDoMaximo(lerContagem(reg?.defeitos?.[d.chave]), amostra, d.maximoPct)) return `partes.${p.chave}.defeitos.${d.chave}`;
      }
    }
    return undefined;
  }),

  // ---- Absorção e dripping: a amostra que mais pesa na média (ou a que estourou o tempo de drenagem)
  absorcao_agua: r((v: AbsorcaoAguaValor) => {
    const itens = v.items ?? [];
    const i = indiceDoMaior(itens.map((it) => (linhaAbsorcaoValida(it) ? percentualIndividualAbsorcao(it) : null)));
    return i >= 0 ? `items.${i}.final` : undefined;
  }),
  dripping_test: r((v: DrippingTestValor) => {
    const itens = v.items ?? [];
    if (v.timeNonConformity && !mediaAcimaDoLimite(v.averagePercentage, LIMITE_DRIPPING)) {
      const i = itens.findIndex((it) => it.timeNc === true);
      if (i >= 0) return `items.${i}.horaRetirada`;
    }
    const i = indiceDoMaior(itens.map((it) => absorcaoLinhaDripping(it)));
    return i >= 0 ? `items.${i}.m2` : undefined;
  }),

  // ---- Bem-estar animal
  peso_caixa: r((v: PesoCaixaValor) => {
    const i = (v.cargas ?? []).findIndex(pesoPorCaixaAcimaDoLimite);
    return i >= 0 ? `cargas.${i}.pesoMedioKg` : undefined;
  }),
  recepcao_aves: r((v: RecepcaoAvesValor) => {
    if (v.condicaoVeiculo === "NAO_CONFORME") return "condicaoVeiculo";
    const { jejumMin } = tempos(v);
    return jejumMin !== null && jejumMin > LIMITE_JEJUM_MAX_H * 60 ? "retiradaRacaoEm" : undefined;
  }),
  espera_aves: r((v: EsperaAvesValor) => {
    if (!acaoCorretivaPendente(v)) return undefined;
    return v.aspersoresLigados !== true ? "aspersoresLigados" : "ventiladoresLigados";
  }),
  pendura_aves: r((v: PenduraAvesValor) => (v.ruidosDesnecessarios === true ? "ruidosDesnecessarios" : v.auxiliaresConformes === false ? "auxiliaresConformes" : undefined)),
  eletronarcose_aves: r((v: EletronarcoseAvesValor) => {
    const faixas: [keyof EletronarcoseAvesValor, { min: number; max: number }][] = [
      ["voltagemV", FAIXA_VOLTAGEM_V],
      ["frequenciaHz", FAIXA_FREQUENCIA_HZ],
      ["correnteMa", FAIXA_CORRENTE_MA],
    ];
    for (const [chave, f] of faixas) if (foraDaFaixa(lerNumero(v[chave] as string), f)) return chave;
    const acima: [keyof EletronarcoseAvesValor, number][] = [
      ["posturaEstacaoS", LIMITE_POSTURA_ESTACAO_MAX_S],
      ["contencaoS", LIMITE_CONTENCAO_MAX_S],
      ["saidaSangriaS", LIMITE_SAIDA_SANGRIA_MAX_S],
    ];
    for (const [chave, limite] of acima) {
      const n = lerNumero(v[chave] as string);
      if (n !== null && n > limite) return chave;
    }
    const sangria = lerNumero(v.sangriaS);
    if (sangria !== null && sangria < LIMITE_SANGRIA_MIN_S) return "sangriaS";
    if (v.preChoque === true) return "preChoque";
    if (v.avesSemSangrar === true) return "avesSemSangrar";
    return SINAIS_INSENSIBILIZACAO.find((s) => v[s.chave] === !s.simConforme)?.chave;
  }),
  caixas_vazias: r((v: CaixasVaziasValor) => (v.todasVazias === false ? "todasVazias" : undefined)),

  // ---- Checklists
  ...(Object.fromEntries((Object.keys(CHECKLISTS) as TipoChecklist[]).map((tipo) => [tipo, resolverChecklist(tipo)])) as Record<string, Resolvedor>),
};

/** Tipos de campo com resolvedor (todos os que podem ficar não conformes no preenchimento). */
export const TIPOS_COM_ALVO_DE_NC: readonly string[] = Object.keys(RESOLVEDORES);

/** Caminho (dentro do campo) do dado que causou a não conformidade, ou undefined quando não dá para saber. */
export function caminhoDaNaoConformidade(tipo: string | undefined, valor: unknown): string | undefined {
  const resolver = tipo ? RESOLVEDORES[tipo] : undefined;
  if (!resolver || !valor || typeof valor !== "object") return undefined;
  try {
    return resolver(valor as never);
  } catch {
    // registro antigo com formato diferente: o verificador escolhe o dado
    return undefined;
  }
}

/** O alvo do adendo (entre os oferecidos para o campo) onde está a não conformidade. Campo com um único alvo já o
 * tem escolhido; sem resolver ou sem correspondência, devolve undefined. */
export function alvoDaNaoConformidade(campo: { chave: string; tipo?: string }, valor: unknown, alvos: AlvoAdendo[]): AlvoAdendo | undefined {
  if (alvos.length === 1) return alvos[0];
  const sufixo = caminhoDaNaoConformidade(campo.tipo, valor);
  return sufixo ? alvos.find((a) => a.caminho === `${campo.chave}.${sufixo}`) : undefined;
}

/** Texto inicial da observação do adendo: o desvio detectado no preenchimento. */
export function observacaoInicialDoAdendo(valor: unknown): string {
  const detalhe = (valor as { detalhesRNC?: unknown } | null | undefined)?.detalhesRNC;
  return typeof detalhe === "string" && detalhe.trim() ? `Não conformidade identificada: ${detalhe.trim()}.` : "";
}
