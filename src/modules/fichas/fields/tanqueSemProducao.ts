// "Sem produção" nos widgets de vazão por tanque (SPR Carcaças, Partes e Miúdos): o tanque não processou nada no
// período, então não há vazão a apurar e não se lê o hidrômetro. Funções PURAS, testadas em
// tests/unit/tanqueSemProducao.test.ts.
//
// A leitura ATUAL e o gelo são descartados (a atual vazia já faz o tanque contar como "sem leitura" nos cálculos, no BI e
// na conformidade); a ANTERIOR é mantida: o próximo monitoramento a herda (leituraHerdada) e o consumo do tanque, quando
// voltar a produzir, é medido contra a última leitura real.
import type { TanqueHidrometro } from "./tiposCompostos";

export type MarcasSemProducao<K extends string> = Partial<Record<K, boolean>>;

export function tanqueSemProducao<K extends string>(marcas: MarcasSemProducao<K> | undefined | null, chave: K): boolean {
  return marcas?.[chave] === true;
}

/** Marca (ou desmarca) o tanque. Ao marcar, a leitura atual e o gelo são descartados; ao desmarcar, o gelo volta ao padrão. */
export function definirSemProducao<K extends string>(
  tanques: Record<K, TanqueHidrometro>,
  marcas: MarcasSemProducao<K>,
  chave: K,
  semProducao: boolean,
  geloPadrao: string
): { tanques: Record<K, TanqueHidrometro>; marcas: MarcasSemProducao<K> } {
  const novasMarcas = { ...marcas };
  if (semProducao) novasMarcas[chave] = true;
  else delete novasMarcas[chave];
  return {
    marcas: novasMarcas,
    tanques: { ...tanques, [chave]: { ...tanques[chave], cur: "", ice: semProducao ? "" : geloPadrao } },
  };
}

/** Só as marcas verdadeiras, para gravar no valor do campo (ausente quando nenhum tanque está sem produção). */
export function marcasParaGravar<K extends string>(marcas: MarcasSemProducao<K>): { tanquesSemProducao?: MarcasSemProducao<K> } {
  const ativas = (Object.keys(marcas) as K[]).filter((k) => marcas[k] === true);
  return ativas.length > 0 ? { tanquesSemProducao: Object.fromEntries(ativas.map((k) => [k, true])) as MarcasSemProducao<K> } : {};
}
