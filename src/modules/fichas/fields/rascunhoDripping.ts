// Rascunho da Fase 1 do Dripping Test no localStorage do dispositivo: o inspetor preenche Lote,
// Hora Início, Lacre, M0, M1 e M3 cedo e volta depois da drenagem para a Fase 2 (Retirada e M2).
import type { AmostraDrippingTest } from "./tiposCompostos";

export const CHAVE_RASCUNHO_DRIPPING = "@globopac:dripping_test_draft";

export interface RascunhoDripping {
  items: AmostraDrippingTest[];
  lote: string;
  horaInicio: string;
  /** ISO do momento em que a 1ª etapa foi salva. */
  primeiraEtapaSalvaEm?: string;
  date: string;
}

/** Data local do dispositivo no formato AAAA-MM-DD. */
export function hojeLocal(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA");
}

export function salvarRascunhoDripping(dados: Omit<RascunhoDripping, "date">, agora: Date = new Date()): void {
  const rascunho: RascunhoDripping = { ...dados, date: hojeLocal(agora) };
  localStorage.setItem(CHAVE_RASCUNHO_DRIPPING, JSON.stringify(rascunho));
}

/** Só devolve o rascunho DO MESMO DIA; o de outro dia é apagado e ignorado. */
export function carregarRascunhoDripping(agora: Date = new Date()): RascunhoDripping | null {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO_DRIPPING);
    if (!bruto) return null;
    const rascunho = JSON.parse(bruto) as RascunhoDripping;
    if (rascunho.date !== hojeLocal(agora)) {
      localStorage.removeItem(CHAVE_RASCUNHO_DRIPPING);
      return null;
    }
    return rascunho;
  } catch {
    return null;
  }
}

export function apagarRascunhoDripping(): void {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO_DRIPPING);
  } catch {
    // localStorage indisponível: nada a apagar.
  }
}
