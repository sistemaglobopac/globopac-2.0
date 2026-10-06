// Veredito ANTECIPADO da vazão do SPR Carcaças, sem o peso médio das cargas. Funções PURAS.
//
// A meta de cada tanque depende só da FAIXA de peso da carcaça (≤ 2,5 kg / ≤ 5,0 kg / > 5,0 kg), não do peso
// exato. Com a renovação apurada (L/ave) — que não depende de peso — já dá para saber, exatamente:
//   • abaixo da meta da faixa mais branda (≤ 2,5 kg): NÃO CONFORME em qualquer peso → agir já;
//   • na meta da faixa mais exigente (> 5,0 kg) ou acima: CONFORME em qualquer peso;
//   • no meio: depende do peso; informa o corte (peso médio de carcaça / peso vivo) que decide.
// Nada aqui é peso estimado: é só a comparação da renovação apurada com as metas da tabela.
// Testadas em tests/unit/vereditoVazao.test.ts.
import { RENDIMENTO_CARCACA, metaTanqueCarcacas, type ChaveTanqueCarcacas } from "./calculosSpr";

/** Limites de peso de carcaça (kg) onde a meta muda. */
export const LIMITES_FAIXA_CARCACA_KG = [2.5, 5.0] as const;

export type EstadoVeredito = "nao_conforme_certo" | "conforme_certo" | "depende_do_peso";

export interface VereditoAntecipado {
  estado: EstadoVeredito;
  /** Só em "depende_do_peso": conforme se o peso médio de CARCAÇA for até este valor (kg). */
  conformeSeCarcacaAteKg?: number;
  /** Idem, em peso vivo médio (kg) = carcaça ÷ 0,84. */
  conformeSePesoVivoAteKg?: number;
  /** Metas (L/ave) das três faixas, para exibir. */
  metas: { ate2_5: number; ate5_0: number; acima5_0: number };
}

/** Veredito da renovação apurada (L/ave) de um tanque, sem conhecer o peso. `apurado` null = sem leitura. */
export function vereditoAntecipado(tanque: ChaveTanqueCarcacas, apurado: number | null): VereditoAntecipado | null {
  if (apurado === null || !Number.isFinite(apurado)) return null;
  const [limite1, limite2] = LIMITES_FAIXA_CARCACA_KG;
  // Pontos de prova dentro de cada faixa (a meta só muda nos limites).
  const metas = {
    ate2_5: metaTanqueCarcacas(tanque, limite1 - 0.1),
    ate5_0: metaTanqueCarcacas(tanque, limite2 - 0.1),
    acima5_0: metaTanqueCarcacas(tanque, limite2 + 0.1),
  };
  const mais = (maxCarcaca: number): VereditoAntecipado => ({
    estado: "depende_do_peso",
    conformeSeCarcacaAteKg: maxCarcaca,
    conformeSePesoVivoAteKg: Math.round((maxCarcaca / RENDIMENTO_CARCACA) * 1000) / 1000,
    metas,
  });

  if (apurado < metas.ate2_5) return { estado: "nao_conforme_certo", metas };
  if (apurado >= metas.acima5_0) return { estado: "conforme_certo", metas };
  if (apurado >= metas.ate5_0) return mais(limite2); // atende até a faixa de 5,0 kg
  return mais(limite1); // atende só a faixa mais branda
}

/** O pior veredito entre os tanques: um não conforme certo vence; depois o que depende do peso (com o corte mais
 * restritivo); só é conforme certo se todos forem. */
export function vereditoGeral(vereditos: (VereditoAntecipado | null)[]): VereditoAntecipado | null {
  const validos = vereditos.filter((v): v is VereditoAntecipado => v !== null);
  if (validos.length === 0) return null;
  const nc = validos.find((v) => v.estado === "nao_conforme_certo");
  if (nc) return nc;
  const dependentes = validos.filter((v) => v.estado === "depende_do_peso");
  if (dependentes.length > 0) {
    return dependentes.reduce((pior, v) => ((v.conformeSeCarcacaAteKg ?? Infinity) < (pior.conformeSeCarcacaAteKg ?? Infinity) ? v : pior));
  }
  return validos[0]!;
}
