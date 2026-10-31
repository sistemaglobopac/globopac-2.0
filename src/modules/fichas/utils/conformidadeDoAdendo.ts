// Refaz o veredito (`conformidade` + `detalhesRNC`) dos campos que o adendo corrigiu. Os widgets gravam o veredito DENTRO do valor do
// campo, calculado no preenchimento; o adendo só troca o dado digitado (adendoCampos.aplicarNoCaminho), então sem este passo o campo
// seguia "não conforme" com o texto do valor antigo (ex.: Controle de Absorção, Chiller 2 de 4096 ºC corrigido para 2,3 ºC).
// Usa as MESMAS regras do widget (montarValor*) e copia só os dois campos do veredito: o resto do valor fica como o adendo deixou.
// A vazão de água (SPR) depende de dados de outros monitoramentos e é refeita pelo banco (refazer_conformidade_vazao).
// Funções puras, testadas em tests/unit/conformidadeDoAdendo.test.ts.
import { montarValorCaixasVazias } from "../fields/caixasVazias";
import { CHECKLISTS, montarValorChecklist, type TipoChecklist } from "../fields/checklistConformidade";
import { montarValorControleAbsorcao } from "../fields/controleAbsorcao";
import { montarValorEletronarcose } from "../fields/eletronarcoseAves";
import { montarValorEspera } from "../fields/esperaAves";
import { montarValorPendura } from "../fields/penduraAves";
import { montarValorPesoCaixa } from "../fields/pesoCaixa";
import { montarValorPotabilidade } from "../fields/potabilidadeAgua";
import { montarValorPotabilidadePontos } from "../fields/potabilidadePontos";
import { montarValorQualidadeMiudos } from "../fields/qualidadeMiudos";
import { montarValorRecebimentoEmbalagens } from "../fields/recebimentoEmbalagens";
import { montarValorRecepcao } from "../fields/recepcaoAves";
import { montarValorTemperatura } from "../fields/temperaturaResfriamento";

type Veredito = { conformidade?: boolean; detalhesRNC?: string | null };
type Montador = (valor: never) => Veredito;
const m = <T>(fn: (v: T) => Veredito) => fn as unknown as Montador;

const MONTADORES: Record<string, Montador> = {
  controle_absorcao: m(montarValorControleAbsorcao),
  temperatura_resfriamento: m(montarValorTemperatura),
  potabilidade_agua: m(montarValorPotabilidade),
  potabilidade_pontos: m(montarValorPotabilidadePontos),
  qualidade_miudos: m(montarValorQualidadeMiudos),
  peso_caixa: m(montarValorPesoCaixa),
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
      const { conformidade, detalhesRNC } = montar(valor as never);
      resultado = { ...resultado, [campo.chave]: { ...valor, conformidade, detalhesRNC: detalhesRNC ?? null } };
    } catch {
      // registro antigo com formato diferente: o veredito gravado é mantido
    }
  }
  return resultado;
}
