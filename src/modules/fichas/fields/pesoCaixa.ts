// Conformidade do peso vivo por caixa de transporte de aves — funções PURAS. Peso da caixa =
// aves por caixa × peso médio das aves da carga. Conforme até 25 kg; acima disso, não conforme.
// Testadas em tests/unit/pesoCaixa.test.ts.
import type { CargaPesoCaixa, PesoCaixaValor } from "./tiposCompostos";
import { lerTemperatura } from "./esperaAves";

export const LIMITE_PESO_CAIXA_KG = 25;

export function cargaPesoVazia(): CargaPesoCaixa {
  return { cargaId: "", gta: "", integrado: "", aviario: "", nucleo: "", qtdAves: 0, avesPorCaixa: "", pesoMedioKg: "" };
}

export function pesoCaixaVazio(): PesoCaixaValor {
  return { cargas: [cargaPesoVazia()], conformidade: true, detalhesRNC: null };
}

export function lerInteiroPositivo(texto: string): number | null {
  const n = Number.parseInt(texto.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function lerPesoKg(texto: string): number | null {
  const n = lerTemperatura(texto);
  return n !== null && n > 0 ? n : null;
}

/** Peso vivo por caixa (kg, 3 casas); null se faltar aves/caixa ou peso médio. */
export function pesoPorCaixa(c: Pick<CargaPesoCaixa, "avesPorCaixa" | "pesoMedioKg">): number | null {
  const aves = lerInteiroPositivo(c.avesPorCaixa);
  const peso = lerPesoKg(c.pesoMedioKg);
  return aves === null || peso === null ? null : Math.round(aves * peso * 1000) / 1000;
}

export function acimaDoLimite(c: Pick<CargaPesoCaixa, "avesPorCaixa" | "pesoMedioKg">): boolean {
  const p = pesoPorCaixa(c);
  return p !== null && p > LIMITE_PESO_CAIXA_KG;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export function avaliarPesoCaixa(v: PesoCaixaValor): { conformidade: boolean; motivos: string[] } {
  const motivos = v.cargas
    .filter(acimaDoLimite)
    .map((c) => `GTA ${c.gta || "?"}: ${fmt(pesoPorCaixa(c)!)} kg por caixa (limite ${LIMITE_PESO_CAIXA_KG} kg)`);
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorPesoCaixa(v: PesoCaixaValor): PesoCaixaValor {
  const { conformidade, motivos } = avaliarPesoCaixa(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Peso vivo acima do limite por caixa — ${motivos.join("; ")}` : null };
}

export function motivosBloqueioPesoCaixa(v: PesoCaixaValor | undefined | null): string[] {
  const p = "Peso por caixa";
  if (!v) return [`${p}: selecione a carga e informe aves por caixa e peso médio.`];
  const preenchidas = v.cargas.filter((c) => c.cargaId || c.avesPorCaixa.trim() || c.pesoMedioKg.trim());
  if (preenchidas.length === 0) return [`${p}: informe ao menos uma carga.`];
  const m: string[] = [];
  preenchidas.forEach((c, i) => {
    const nome = c.gta ? `GTA ${c.gta}` : `Linha ${i + 1}`;
    if (!c.cargaId) m.push(`${p}: selecione a carga (${nome}).`);
    if (lerInteiroPositivo(c.avesPorCaixa) === null) m.push(`${p}: informe a quantidade de aves por caixa (${nome}).`);
    if (lerPesoKg(c.pesoMedioKg) === null) m.push(`${p}: informe o peso médio das aves (${nome}).`);
  });
  return m;
}
