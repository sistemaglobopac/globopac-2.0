// Cálculos dos 4 monitoramentos de água do frigorífico (SPR Carcaças, SPR Partes, SPR Miúdos e
// Chuveiro de Lavagem Final) — funções PURAS, sem React, para que as regras fiquem num só lugar
// e possam ser testadas contra o exemplo numérico oficial (tests/unit/calculosSpr.test.ts).
// Os componentes em fields/*.tsx só chamam estas funções.
import { parseNumeroHidrometro } from "./hidrometro";

/** Rendimento fixo da carcaça: aves abatidas com 16% de perda de peso (despojos do abate). */
export const RENDIMENTO_CARCACA = 0.84;
/** Aproveitamento das carcaças parcialmente aproveitadas no SPR Partes (desconta 30%). */
export const APROVEITAMENTO_PARTES = 0.7;
/** Meta fixa (L/kg) do SPR Partes e do SPR Miúdos. */
export const META_L_KG = 1.5;
/** Meta fixa (L/carcaça) do Chuveiro Final. */
export const META_L_CARCACA = 1.5;

export type ChaveTanqueCarcacas = "preChiller" | "chiller1" | "chiller2";

/** Gelo padrão (kg) pré-preenchido por tanque — cada tanque tem o seu, nunca um valor único. */
export const GELO_PADRAO_CARCACAS: Record<ChaveTanqueCarcacas, string> = {
  preChiller: "1995",
  chiller1: "2394",
  chiller2: "1596",
};
export const GELO_PADRAO_PARTES = "332";
export const GELO_PADRAO_MIUDOS = "332";

export interface CargaParaCalculo {
  quantity: string;
  avgLiveWeight: string;
}

/** Número a partir do texto digitado (aceita vírgula ou ponto; vazio = 0). */
export const numero = parseNumeroHidrometro;

/** Σ aves das cargas (total bruto). */
export function totalAvesBruto(cargas: CargaParaCalculo[]): number {
  return cargas.reduce((soma, c) => soma + (parseFloat(c.quantity) || 0), 0);
}

/** Média PONDERADA do peso vivo: Σ(aves_lote × pesoVivo_lote) / totalAves. */
export function pesoMedioVivo(cargas: CargaParaCalculo[]): number {
  const total = totalAvesBruto(cargas);
  if (total === 0) return 0;
  const somaPeso = cargas.reduce((soma, c) => soma + (parseFloat(c.quantity) || 0) * numero(c.avgLiveWeight), 0);
  return somaPeso / total;
}

export function pesoMedioCarcaca(cargas: CargaParaCalculo[]): number {
  return pesoMedioVivo(cargas) * RENDIMENTO_CARCACA;
}

/** Aves no período = max(0, bruto − (parciais + totalmente condenadas)). */
export function avesNoPeriodo(bruto: number, parciais: number, totalmenteCondenadas: number): number {
  return Math.max(0, bruto - (parciais + totalmenteCondenadas));
}

/** Litros de água usados: (atual − anterior) × 1000 + gelo (1 kg de gelo = 1 L). */
export function aguaUsadaLitros(prev: string, cur: string, gelo: string | number = 0): number {
  const g = typeof gelo === "number" ? gelo : numero(gelo);
  // Arredonda a diferença de leitura (m³) antes de virar litros: 504,635 − 500 dá 4,63499999…
  // em ponto flutuante, o que derrubava a leitura exatamente no limite da meta para "abaixo".
  const diferencaM3 = Math.round((numero(cur) - numero(prev)) * 1e6) / 1e6;
  return Math.round(diferencaM3 * 1000 * 1e6) / 1e6 + g;
}

/** Litros divididos por uma base; `null` = sem apuração ("—"). Atual = 0 → apuração 0. */
export function apurar(prev: string, cur: string, gelo: string | number, base: number): number | null {
  if (numero(cur) === 0) return 0;
  if (base === 0) return null;
  return aguaUsadaLitros(prev, cur, gelo) / base;
}

// ---------------- SPR Carcaças ----------------

/** Meta (L/ave) por tanque em função do peso médio da CARCAÇA (já com os 84%). */
export function metaTanqueCarcacas(tanque: ChaveTanqueCarcacas, pesoCarcaca: number): number {
  if (pesoCarcaca === 0) return 0;
  if (tanque === "preChiller") return pesoCarcaca <= 2.5 ? 1.5 : pesoCarcaca <= 5.0 ? 1.7 : 2.2;
  if (tanque === "chiller1") return pesoCarcaca <= 2.5 ? 1.1 : pesoCarcaca <= 5.0 ? 1.6 : 2.1;
  return pesoCarcaca <= 2.5 ? 1.0 : pesoCarcaca <= 5.0 ? 1.5 : 2.0;
}

// ---------------- SPR Partes ----------------

/** Massa processada (kg) = parciais (SPR Carcaças) × peso médio de carcaça × 0,70. */
export function massaPartes(parciais: number, pesoCarcaca: number): number {
  return parciais * pesoCarcaca * APROVEITAMENTO_PARTES;
}

// ---------------- SPR Miúdos ----------------

export type ChaveMiudo = "coracao" | "moela" | "figado" | "cabeca" | "pes";

/** Tabela DE-PARA (peso unitário do miúdo em kg) — usa a PRIMEIRA linha em que
 * pesoCarcaca ≤ maxCarcaca. */
export const TABELA_PESO_MIUDOS: ({ maxCarcaca: number } & Record<ChaveMiudo, number>)[] = [
  { maxCarcaca: 1.199, coracao: 0.006, moela: 0.023, figado: 0.03, cabeca: 0.037, pes: 0.065 },
  { maxCarcaca: 1.599, coracao: 0.007, moela: 0.025, figado: 0.032, cabeca: 0.039, pes: 0.066 },
  { maxCarcaca: 1.799, coracao: 0.007, moela: 0.028, figado: 0.034, cabeca: 0.04, pes: 0.068 },
  { maxCarcaca: 1.899, coracao: 0.008, moela: 0.028, figado: 0.035, cabeca: 0.044, pes: 0.07 },
  { maxCarcaca: 2.1, coracao: 0.01, moela: 0.028, figado: 0.035, cabeca: 0.048, pes: 0.07 },
  { maxCarcaca: 2.25, coracao: 0.01, moela: 0.03, figado: 0.036, cabeca: 0.05, pes: 0.075 },
  { maxCarcaca: 2.35, coracao: 0.011, moela: 0.03, figado: 0.038, cabeca: 0.051, pes: 0.077 },
  { maxCarcaca: 2.45, coracao: 0.011, moela: 0.031, figado: 0.039, cabeca: 0.053, pes: 0.082 },
  { maxCarcaca: 2.75, coracao: 0.011, moela: 0.032, figado: 0.041, cabeca: 0.054, pes: 0.084 },
  { maxCarcaca: Infinity, coracao: 0.012, moela: 0.033, figado: 0.042, cabeca: 0.058, pes: 0.097 },
];

export function pesosMiudosPorCarcaca(pesoCarcaca: number) {
  for (const linha of TABELA_PESO_MIUDOS) {
    if (pesoCarcaca <= linha.maxCarcaca) return linha;
  }
  return TABELA_PESO_MIUDOS[TABELA_PESO_MIUDOS.length - 1]!;
}

// ---------------- Chuveiro de Lavagem Final ----------------

/** Aves no chuveiro = max(0, bruto (SPR) − (totalmente condenadas (SPR) + parciais do chuveiro)).
 * A base é o total BRUTO, nunca "Aves no Período" do SPR Carcaças. */
export function avesNoChuveiro(bruto: number, totalmenteCondenadasSPR: number, parciaisChuveiro: number): number {
  return Math.max(0, bruto - (totalmenteCondenadasSPR + parciaisChuveiro));
}

// ---------------- Máscara do peso vivo ----------------

/** Máscara de 3 casas decimais: digitar 2850 → "2.850" (armazenado com ponto; exibido com
 * vírgula por `exibirPesoVivo`). Ignora tudo que não for dígito. */
export function mascararPesoVivo(digitado: string): string {
  const digitos = digitado.replace(/\D/g, "");
  if (digitos === "") return "";
  return (parseInt(digitos, 10) / 1000).toFixed(3);
}

export function exibirPesoVivo(armazenado: string): string {
  return armazenado.replace(".", ",");
}

// ---------------- Detalhes para a RNC ----------------

/** "<Tanque> (Apurado: X.XXXL/c | Meta: Y.YYYL/c)" — unidade conforme o monitoramento. */
export function detalheDesvio(nome: string, apurado: number, meta: number, unidade: string): string {
  return `${nome} (Apurado: ${apurado.toFixed(3)}${unidade} | Meta: ${meta.toFixed(3)}${unidade})`;
}
