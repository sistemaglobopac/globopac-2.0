// Marcar uma absorção de água em andamento como SUBSTITUÍDA por outro registro já finalizado (ex.: o inspetor do turno seguinte
// refez a amostra). Funções PURAS; testadas em tests/unit/substituicaoAbsorcao.test.ts.
import type { AmostraAbsorcaoAgua } from "./tiposCompostos";

/** Itens (lacre/peso inicial/peso final) do teste de absorção dentro de dados_dinamicos, qualquer que seja a chave do campo. */
export function itensDeAbsorcao(dados: Record<string, unknown> | null | undefined): AmostraAbsorcaoAgua[] {
  for (const valor of Object.values(dados ?? {})) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) continue;
    const itens = (valor as { items?: unknown }).items;
    if (Array.isArray(itens) && itens.some((i) => i && typeof i === "object" && "initial" in i && "seal" in i)) return itens as AmostraAbsorcaoAgua[];
  }
  return [];
}

function pesosIniciais(itens: AmostraAbsorcaoAgua[]): number[] {
  return itens.map((i) => parseFloat(i.initial)).filter((n) => !isNaN(n) && n > 0);
}

export interface CoincidenciaPesos {
  /** Pesos iniciais do registro pendente que aparecem também no candidato. */
  iguais: number;
  /** Pesos iniciais do registro pendente. */
  total: number;
}

/** Quantos pesos iniciais do registro pendente reaparecem no candidato (cada peso do candidato conta uma vez). */
export function coincidenciaDePesos(pendente: AmostraAbsorcaoAgua[], candidato: AmostraAbsorcaoAgua[]): CoincidenciaPesos {
  const doPendente = pesosIniciais(pendente);
  const sobra = new Map<number, number>();
  for (const p of pesosIniciais(candidato)) sobra.set(p, (sobra.get(p) ?? 0) + 1);
  let iguais = 0;
  for (const p of doPendente) {
    const n = sobra.get(p) ?? 0;
    if (n > 0) {
      iguais++;
      sobra.set(p, n - 1);
    }
  }
  return { iguais, total: doPendente.length };
}

export interface CandidatoSubstituicao {
  id: string;
  user_id: string;
  criado_em: string;
  hora_monitoramento: string | null;
  dados_dinamicos: Record<string, unknown>;
}

export interface CandidatoComCoincidencia extends CandidatoSubstituicao {
  coincidencia: CoincidenciaPesos;
}

/** Registros finalizados que podem ter substituído o pendente: só testes de absorção, com a maior coincidência de pesos
 * primeiro (empate: o mais próximo no tempo). */
export function ordenarCandidatos(pendente: Record<string, unknown>, candidatos: CandidatoSubstituicao[]): CandidatoComCoincidencia[] {
  const doPendente = itensDeAbsorcao(pendente);
  return candidatos
    .filter((c) => itensDeAbsorcao(c.dados_dinamicos).length > 0)
    .map((c) => ({ ...c, coincidencia: coincidenciaDePesos(doPendente, itensDeAbsorcao(c.dados_dinamicos)) }))
    .sort((a, b) => b.coincidencia.iguais - a.coincidencia.iguais || (a.criado_em < b.criado_em ? -1 : 1));
}
