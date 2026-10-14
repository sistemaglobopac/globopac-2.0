// Correção de leitura por adendo que SEGUE para os monitoramentos seguintes.
//
// Os hidrômetros (chiller, partes, mini chillers, chuveiro) herdam a leitura do monitoramento anterior: a "leitura anterior"
// (`prev`) do monitoramento N é a leitura atual (`cur`) do N-1 — ou a `prev` dele, se aquele tanque não foi lido (ver
// leituraHerdada). Quando um adendo corrige a leitura atual de um monitoramento, os seguintes que já foram feitos continuam
// com a leitura antiga como "anterior" e a apuração deles sai errada. Aqui fica a regra pura de quem deve ser atualizado;
// quem grava (aditivos) é useAssinarAdendo. Testado em tests/unit/propagacaoCorrecao.test.ts.

import { aplicarNoCaminho } from "./adendoCampos";

/** Chave em dados_dinamicos que registra, no monitoramento seguinte, as leituras anteriores acertadas por propagação. */
export const CHAVE_CORRECOES_PROPAGADAS = "correcoes_propagadas";

export interface CorrecaoPropagada {
  /** Monitoramento (original) cuja correção originou esta. */
  origemId: string;
  adendoId: string;
  /** Caminho da leitura anterior que foi acertada (ex.: "campo_1.tanques.chiller1.prev"). */
  caminho: string;
  de: string;
  para: string;
  em: string;
}

export interface RegistroSeguinte {
  /** Id do registro vigente (o que será corrigido). */
  id: string;
  dados: Record<string, unknown>;
}

export interface RegistroAtualizado extends RegistroSeguinte {
  correcoes: CorrecaoPropagada[];
}

function ler(dados: unknown, caminho: string[]): unknown {
  let no: unknown = dados;
  for (const parte of caminho) {
    if (no === null || typeof no !== "object") return undefined;
    no = (no as Record<string, unknown>)[parte];
  }
  return no;
}

const texto = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

/** Leituras iguais (aceita vírgula decimal e zeros à direita). Vazio só é igual a vazio. */
export function mesmaLeitura(a: unknown, b: unknown): boolean {
  const x = texto(a).trim();
  const y = texto(b).trim();
  if (x === "" || y === "") return x === y;
  const nx = parseFloat(x.replace(",", "."));
  const ny = parseFloat(y.replace(",", "."));
  return Number.isNaN(nx) || Number.isNaN(ny) ? x === y : nx === ny;
}

/** Caminhos corrigidos que são a leitura atual de um hidrômetro (objeto com `cur` e `prev`): "…tanques.chiller1.cur". */
function leiturasAtuaisCorrigidas(dadosCorrigidos: Record<string, unknown>, correcoes: Record<string, { old: unknown; new: unknown }>) {
  const achadas: { base: string[]; antigo: unknown; novo: unknown; prevDoOrigem: unknown }[] = [];
  for (const [caminho, c] of Object.entries(correcoes)) {
    const partes = caminho.split(".");
    if (partes.length < 2 || partes[partes.length - 1] !== "cur") continue;
    const base = partes.slice(0, -1);
    const objeto = ler(dadosCorrigidos, base);
    if (objeto === null || typeof objeto !== "object" || !("prev" in (objeto as object))) continue;
    achadas.push({ base, antigo: c.old, novo: c.new, prevDoOrigem: (objeto as Record<string, unknown>).prev });
  }
  return achadas;
}

/**
 * Dado o que o adendo corrigiu no monitoramento de origem, devolve os monitoramentos SEGUINTES (já em ordem de hora, do
 * mesmo turno/dia da ficha+setor) que precisam ter a leitura anterior acertada. Só mexe onde a leitura anterior era
 * exatamente a antiga herdada; ao primeiro seguinte que leu o tanque (leitura atual preenchida) a cadeia termina, pois
 * dali em diante a herança parte da leitura dele.
 */
export function propagarLeituraNosSeguintes(args: {
  origemId: string;
  adendoId: string;
  /** Dados do origem JÁ com as correções aplicadas. */
  dadosCorrigidos: Record<string, unknown>;
  correcoes: Record<string, { old: unknown; new: unknown }>;
  seguintes: RegistroSeguinte[];
  agora: string;
}): RegistroAtualizado[] {
  const { origemId, adendoId, dadosCorrigidos, correcoes, seguintes, agora } = args;
  const porId = new Map<string, RegistroAtualizado>(seguintes.map((s) => [s.id, { ...s, correcoes: [] }]));

  for (const leitura of leiturasAtuaisCorrigidas(dadosCorrigidos, correcoes)) {
    // O que o seguinte herdava: a leitura atual do origem; se estava vazia, a anterior dele (leituraHerdada).
    const herdadoAntes = texto(leitura.antigo) || texto(leitura.prevDoOrigem);
    const herdadoAgora = texto(leitura.novo) || texto(leitura.prevDoOrigem);
    if (mesmaLeitura(herdadoAntes, herdadoAgora)) continue;

    for (const s of seguintes) {
      const atual = porId.get(s.id)!;
      const prevAtual = ler(atual.dados, [...leitura.base, "prev"]);
      if (!mesmaLeitura(prevAtual, herdadoAntes)) break;
      const caminho = [...leitura.base, "prev"].join(".");
      atual.dados = aplicarNoCaminho(atual.dados, caminho, herdadoAgora);
      atual.correcoes.push({ origemId, adendoId, caminho, de: texto(prevAtual), para: herdadoAgora, em: agora });
      if (texto(ler(atual.dados, [...leitura.base, "cur"])).trim() !== "") break;
    }
  }

  return [...porId.values()].filter((r) => r.correcoes.length > 0).map((r) => ({
    ...r,
    dados: {
      ...r.dados,
      [CHAVE_CORRECOES_PROPAGADAS]: [...(Array.isArray(r.dados[CHAVE_CORRECOES_PROPAGADAS]) ? (r.dados[CHAVE_CORRECOES_PROPAGADAS] as CorrecaoPropagada[]) : []), ...r.correcoes],
    },
  }));
}
