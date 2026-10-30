/** Especialidades de manutenção com que o PCM classifica as SS e as OS (separa o trabalho por equipe e a impressão
 * das listas). Não confundir com a `categoria` da SS, que é o tipo da não conformidade escolhido pelo inspetor.
 * O banco guarda só o texto (até 40 caracteres): para incluir uma especialidade basta acrescentá-la aqui. */
export const ESPECIALIDADES_BPF = [
  "Manutenção Diária",
  "Manutenção Noturna",
  "Elétrica Diária",
  "Elétrica Noturna",
  "Lubrificação",
  "Obra civil",
  "Pintura",
  "Terceiros",
] as const;

export const SEM_ESPECIALIDADE = "Sem classificação";

/** Valor do filtro que mostra tudo (e imprime tudo, separado por especialidade). */
export const FILTRO_TODAS = "";
/** Valor do filtro que mostra só o que ainda não foi classificado. */
export const FILTRO_SEM_CLASSIFICACAO = "__sem__";

interface ComEspecialidade {
  especialidade: string | null;
}

export function rotuloEspecialidade(especialidade: string | null): string {
  return especialidade?.trim() || SEM_ESPECIALIDADE;
}

export function filtrarPorEspecialidade<T extends ComEspecialidade>(itens: T[], filtro: string): T[] {
  if (filtro === FILTRO_TODAS) return itens;
  if (filtro === FILTRO_SEM_CLASSIFICACAO) return itens.filter((i) => !i.especialidade?.trim());
  return itens.filter((i) => i.especialidade === filtro);
}

/** Separa os itens por especialidade, na ordem da lista (as não previstas em seguida, por nome; "Sem classificação" por último). */
export function agruparPorEspecialidade<T extends ComEspecialidade>(itens: T[]): { rotulo: string; itens: T[] }[] {
  const porRotulo = new Map<string, T[]>();
  for (const item of itens) {
    const rotulo = rotuloEspecialidade(item.especialidade);
    porRotulo.set(rotulo, [...(porRotulo.get(rotulo) ?? []), item]);
  }
  const posicao = (rotulo: string) => {
    if (rotulo === SEM_ESPECIALIDADE) return Number.MAX_SAFE_INTEGER;
    const i = (ESPECIALIDADES_BPF as readonly string[]).indexOf(rotulo);
    return i === -1 ? ESPECIALIDADES_BPF.length : i;
  };
  return [...porRotulo.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b, "pt-BR"))
    .map(([rotulo, grupo]) => ({ rotulo, itens: grupo }));
}

/** Quantos itens há em cada especialidade (para mostrar nas opções do filtro). */
export function contarPorEspecialidade<T extends ComEspecialidade>(itens: T[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const item of itens) {
    const rotulo = item.especialidade?.trim() ? item.especialidade : FILTRO_SEM_CLASSIFICACAO;
    contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
  }
  return contagem;
}
