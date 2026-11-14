// Refaz o veredito (`conformidade` + `detalhesRNC`) dos campos que o adendo corrigiu. Os widgets gravam o veredito DENTRO do valor do
// campo, calculado no preenchimento; o adendo só troca o dado digitado (adendoCampos.aplicarNoCaminho), então sem este passo o campo
// seguia "não conforme" com o texto do valor antigo (ex.: Controle de Absorção, Chiller 2 de 4096 ºC corrigido para 2,3 ºC).
// Usa as MESMAS regras do widget (montarValor*) e copia só os dois campos do veredito: o resto do valor fica como o adendo deixou.
// Dripping Test e Absorção de Água guardam, além do status, a média e as contagens calculadas das linhas: essas são refeitas também
// (e a vírgula decimal digitada no adendo vira ponto, pois o cálculo lê "2,098" como 2).
// A vazão de água (SPR) depende de dados de outros monitoramentos e é refeita pelo banco (refazer_conformidade_vazao).
// Funções puras, testadas em tests/unit/conformidadeDoAdendo.test.ts.
import { calcularAbsorcaoAgua, calcularDrippingTest } from "../fields/calculosAbsorcao";
import { montarValorCaixasVazias } from "../fields/caixasVazias";
import { CHECKLISTS, montarValorChecklist, type TipoChecklist } from "../fields/checklistConformidade";
import { montarValorControleAbsorcao } from "../fields/controleAbsorcao";
import { montarValorEletronarcose } from "../fields/eletronarcoseAves";
import { montarValorEspera } from "../fields/esperaAves";
import { montarValorPendura } from "../fields/penduraAves";
import { montarValorEscaldagem } from "../fields/escaldagemDepenagem";
import { montarValorHematomas } from "../fields/hematomas";
import { montarValorPesoCaixa } from "../fields/pesoCaixa";
import { montarValorPotabilidade } from "../fields/potabilidadeAgua";
import { montarValorPotabilidadePontos } from "../fields/potabilidadePontos";
import { montarValorQualidadeMiudos } from "../fields/qualidadeMiudos";
import { montarValorRecebimentoEmbalagens } from "../fields/recebimentoEmbalagens";
import { montarValorRecepcao } from "../fields/recepcaoAves";
import { montarValorTemperatura } from "../fields/temperaturaResfriamento";
import type { AbsorcaoAguaValor, DrippingTestValor } from "../fields/tiposCompostos";

type Veredito = { conformidade?: boolean; detalhesRNC?: string | null };
/** Devolve o que passa a valer no valor do campo (mesclado por cima do que o adendo deixou). */
type Montador = (valor: never) => Record<string, unknown>;
const m = <T>(fn: (v: T) => Veredito) =>
  ((v: T) => {
    const { conformidade, detalhesRNC } = fn(v);
    return { conformidade, detalhesRNC: detalhesRNC ?? null };
  }) as unknown as Montador;

const DECIMAL_COM_VIRGULA = /^\s*\d+,\d+\s*$/;
const comPonto = (texto: unknown): unknown => (typeof texto === "string" && DECIMAL_COM_VIRGULA.test(texto) ? texto.trim().replace(",", ".") : texto);

/** Linhas com os pesos numéricos lidos com ponto decimal (o widget só aceita ponto; o adendo aceita o que o verificador digitar). */
function linhasComPonto<T extends object>(linhas: T[] | undefined, chaves: readonly string[]): T[] {
  return (linhas ?? []).map((linha) => {
    const copia = { ...linha } as Record<string, unknown>;
    for (const chave of chaves) if (chave in copia) copia[chave] = comPonto(copia[chave]);
    return copia as T;
  });
}

const MONTADORES: Record<string, Montador> = {
  dripping_test: ((v: DrippingTestValor) => {
    const items = linhasComPonto(v.items, ["m0", "m1", "m2", "m3"]);
    const { status, averagePercentage, validCount, timeNonConformity, items: comTempo } = calcularDrippingTest(items, v.horaInicio);
    return { items: comTempo, status, averagePercentage, validCount, timeNonConformity };
  }) as unknown as Montador,
  absorcao_agua: ((v: AbsorcaoAguaValor) => {
    const items = linhasComPonto(v.items, ["initial", "final"]);
    return { items, ...calcularAbsorcaoAgua(items) };
  }) as unknown as Montador,
  controle_absorcao: m(montarValorControleAbsorcao),
  temperatura_resfriamento: m(montarValorTemperatura),
  potabilidade_agua: m(montarValorPotabilidade),
  potabilidade_pontos: m(montarValorPotabilidadePontos),
  qualidade_miudos: m(montarValorQualidadeMiudos),
  peso_caixa: m(montarValorPesoCaixa),
  hematomas_carcacas: m(montarValorHematomas),
  escaldagem_depenagem: m(montarValorEscaldagem),
  recepcao_aves: m(montarValorRecepcao),
  espera_aves: m(montarValorEspera),
  pendura_aves: m(montarValorPendura),
  eletronarcose_aves: m(montarValorEletronarcose),
  caixas_vazias: m(montarValorCaixasVazias),
  recebimento_embalagens: m(montarValorRecebimentoEmbalagens),
  recebimento_sacos: m(montarValorRecebimentoEmbalagens),
  recebimento_secundarias: m(montarValorRecebimentoEmbalagens),
  ...(Object.fromEntries((Object.keys(CHECKLISTS) as TipoChecklist[]).map((tipo) => [tipo, m((v: never) => montarValorChecklist(tipo, v))])) as Record<string, Montador>),
};

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Refaz `conformidade` e `detalhesRNC` de cada campo que uma correção do adendo tocou (caminho "chave" ou "chave.…"). `campos` traz
 * chave e tipo do template; campo de outro tipo (ou sem regra aqui) e dado antigo de formato diferente ficam como estão. */
export function refazerConformidadeDosCamposCorrigidos(
  dados: Record<string, unknown>,
  correcoes: Record<string, unknown>,
  campos: readonly { chave: string; tipo?: string }[]
): Record<string, unknown> {
  const tocados = new Set(Object.keys(correcoes).map((caminho) => caminho.split(".")[0]!));
  let resultado = dados;
  for (const campo of campos) {
    const montar = campo.tipo ? MONTADORES[campo.tipo] : undefined;
    const valor = resultado[campo.chave];
    if (!montar || !tocados.has(campo.chave) || !ehObjeto(valor)) continue;
    try {
      resultado = { ...resultado, [campo.chave]: { ...valor, ...montar(valor as never) } };
    } catch {
      // registro antigo com formato diferente: o veredito gravado é mantido
    }
  }
  return resultado;
}
