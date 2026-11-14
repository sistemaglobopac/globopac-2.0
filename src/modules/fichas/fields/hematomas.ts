// Hematomas nas carcaças — funções PURAS. O inspetor escolhe a carga, informa quantas carcaças avaliou e quantas
// contusões (asas, peito, coxa) e fraturas encontrou; o percentual é calculado aqui, POR TIPO DE LESÃO:
//   % do tipo = contagem do tipo ÷ carcaças avaliadas × 100
// A tolerância de 4% vale para CADA tipo separadamente (não para a soma): conforme até 4% (inclusive) em todos os
// tipos; basta um tipo acima disso para a carga ser NÃO CONFORME, e a RNC vai para o FOMENTO AVÍCOLA. O total de
// lesões e o seu % são só informativos (não entram no veredito).
// Testadas em tests/unit/hematomas.test.ts.
import { SETOR_FOMENTO_AVICOLA } from "@/shared/setor-rnc";
import type { CargaHematomas, HematomasCarcacasValor } from "./tiposCompostos";

export const LIMITE_HEMATOMAS_PCT = 4;
/** Setor que recebe a RNC quando alguma carga passa do limite. */
export const SETOR_RNC_HEMATOMAS = SETOR_FOMENTO_AVICOLA;

/** As quatro lesões contadas, na ordem da tela. */
export const LESOES_HEMATOMAS = [
  { chave: "contusoesAsas", rotulo: "Contusões nas asas" },
  { chave: "contusoesPeito", rotulo: "Contusões no peito" },
  { chave: "contusoesCoxa", rotulo: "Contusões na coxa" },
  { chave: "fraturas", rotulo: "Fraturas" },
] as const;

export type ChaveLesao = (typeof LESOES_HEMATOMAS)[number]["chave"];

export function cargaHematomasVazia(): CargaHematomas {
  return {
    cargaId: "",
    gta: "",
    integrado: "",
    aviario: "",
    nucleo: "",
    qtdAves: 0,
    carcacasAvaliadas: "",
    contusoesAsas: "",
    contusoesPeito: "",
    contusoesCoxa: "",
    fraturas: "",
    totalLesoes: null,
    hematomasPct: null,
  };
}

export function hematomasVazio(): HematomasCarcacasValor {
  return { cargas: [cargaHematomasVazia()], limitePct: LIMITE_HEMATOMAS_PCT, setorRnc: SETOR_RNC_HEMATOMAS, conformidade: true, detalhesRNC: null };
}

/** "12" → 12 (zero vale); vazio/inválido (decimal, negativo, texto) → null. */
export function lerContagem(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

type Contagens = Pick<CargaHematomas, "carcacasAvaliadas" | ChaveLesao>;

/** Carcaças avaliadas válidas (inteiro maior que zero). */
export function lerAvaliadas(c: Pick<CargaHematomas, "carcacasAvaliadas">): number | null {
  const n = lerContagem(c.carcacasAvaliadas);
  return n !== null && n > 0 ? n : null;
}

/** Soma das quatro lesões; null se alguma ainda não foi informada (zero informado conta). */
export function totalDeLesoes(c: Pick<CargaHematomas, ChaveLesao>): number | null {
  let total = 0;
  for (const l of LESOES_HEMATOMAS) {
    const n = lerContagem(c[l.chave]);
    if (n === null) return null;
    total += n;
  }
  return total;
}

/** Percentual de uma contagem sobre as carcaças avaliadas (sem arredondar); null sem base válida. */
export function percentualSobreAvaliadas(contagem: number | null, avaliadas: number | null): number | null {
  if (contagem === null || avaliadas === null || avaliadas <= 0) return null;
  return (contagem / avaliadas) * 100;
}

/** Percentual total de lesões da carga (soma ÷ avaliadas × 100). Só informativo: o limite vale por tipo de lesão. */
export function percentualHematomas(c: Contagens): number | null {
  return percentualSobreAvaliadas(totalDeLesoes(c), lerAvaliadas(c));
}

/** Percentual de UM tipo de lesão sobre as carcaças avaliadas; null enquanto faltar a contagem ou a base. */
export function percentualDaLesao(c: Contagens, chave: ChaveLesao): number | null {
  return percentualSobreAvaliadas(lerContagem(c[chave]), lerAvaliadas(c));
}

/** Este tipo de lesão passou do limite? Comparação em inteiros (contagem × 100 > limite × avaliadas): exatamente 4% é
 * conforme e a conta não sofre com arredondamento de ponto flutuante. Independe das outras contagens. */
export function lesaoAcimaDoLimite(c: Contagens, chave: ChaveLesao, limitePct: number = LIMITE_HEMATOMAS_PCT): boolean {
  const n = lerContagem(c[chave]);
  const avaliadas = lerAvaliadas(c);
  return n !== null && avaliadas !== null && n * 100 > limitePct * avaliadas;
}

/** Os tipos de lesão da carga que passaram do limite (na ordem da tela). */
export function lesoesAcimaDoLimite(c: Contagens, limitePct: number = LIMITE_HEMATOMAS_PCT): (typeof LESOES_HEMATOMAS)[number][] {
  return LESOES_HEMATOMAS.filter((l) => lesaoAcimaDoLimite(c, l.chave, limitePct));
}

/** A carga é não conforme? Sim quando QUALQUER tipo de lesão passa do limite (a tolerância é por tipo, não pela soma). */
export function acimaDoLimite(c: Contagens, limitePct: number = LIMITE_HEMATOMAS_PCT): boolean {
  return lesoesAcimaDoLimite(c, limitePct).length > 0;
}

/** "3,25%" — duas casas, vírgula decimal; "—" sem valor. */
export function formatarPctHematomas(pct: number | null): string {
  return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

const nomeDaCarga = (c: Pick<CargaHematomas, "gta">, i: number) => (c.gta ? `GTA ${c.gta}` : `Linha ${i + 1}`);

/** Cargas com algum tipo de lesão acima do limite, em texto (para o selo, a RNC e o relatório): uma entrada por carga,
 * listando cada tipo estourado com o seu percentual. */
export function avaliarHematomas(v: HematomasCarcacasValor): { conformidade: boolean; motivos: string[] } {
  const limite = v.limitePct ?? LIMITE_HEMATOMAS_PCT;
  const motivos = (v.cargas ?? [])
    .map((c, i) => ({ c, i, tipos: lesoesAcimaDoLimite(c, limite) }))
    .filter(({ tipos }) => tipos.length > 0)
    .map(
      ({ c, i, tipos }) =>
        `${nomeDaCarga(c, i)}: ${tipos.map((l) => `${l.rotulo.toLowerCase()} ${formatarPctHematomas(percentualDaLesao(c, l.chave))}`).join(", ")} (máx. ${limite}% por tipo; ${lerAvaliadas(c)} carcaças avaliadas)`
    );
  return { conformidade: motivos.length === 0, motivos };
}

/** Grava no valor o que o relatório e a RNC precisam: o total e o % total de cada carga (informativos), o veredito por tipo
 * de lesão, o limite e o setor da RNC. */
export function montarValorHematomas(v: HematomasCarcacasValor): HematomasCarcacasValor {
  const limitePct = LIMITE_HEMATOMAS_PCT;
  const cargas = (v.cargas ?? []).map((c) => ({ ...c, totalLesoes: totalDeLesoes(c), hematomasPct: percentualHematomas(c) }));
  const { conformidade, motivos } = avaliarHematomas({ ...v, cargas, limitePct });
  return {
    ...v,
    cargas,
    limitePct,
    setorRnc: SETOR_RNC_HEMATOMAS,
    conformidade,
    detalhesRNC: motivos.length ? `Hematomas acima de ${limitePct}% em algum tipo de lesão — ${motivos.join("; ")}. RNC para o setor ${SETOR_RNC_HEMATOMAS}` : null,
  };
}

/** Impede assinar com carga sem escolher, sem carcaças avaliadas ou com alguma das quatro contagens em branco
 * ("0" é uma resposta; em branco não — senão uma contagem esquecida passaria como zero hematomas). */
export function motivosBloqueioHematomas(v: HematomasCarcacasValor | undefined | null): string[] {
  const p = "Hematomas";
  if (!v) return [`${p}: selecione a carga e informe as carcaças avaliadas e as contagens.`];
  const preenchidas = (v.cargas ?? []).filter(
    (c) => c.cargaId || c.carcacasAvaliadas.trim() || LESOES_HEMATOMAS.some((l) => c[l.chave].trim())
  );
  if (preenchidas.length === 0) return [`${p}: informe ao menos uma carga.`];
  const m: string[] = [];
  preenchidas.forEach((c, i) => {
    const nome = nomeDaCarga(c, i);
    if (!c.cargaId) m.push(`${p}: selecione a carga (${nome}).`);
    if (lerAvaliadas(c) === null) m.push(`${p}: informe a quantidade de carcaças avaliadas (${nome}).`);
    for (const l of LESOES_HEMATOMAS) {
      if (lerContagem(c[l.chave]) === null) m.push(`${p}: informe ${l.rotulo.toLowerCase()} (${nome}) — use 0 quando não houver.`);
    }
  });
  return m;
}
