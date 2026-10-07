import { describe, expect, it } from "vitest";
import {
  avaliarPotabilidadePontos,
  montarValorPotabilidadePontos,
  motivosBloqueioPotabilidadePontos,
  PONTOS_COLETA,
  potabilidadePontosInicial,
  rotuloPonto,
  sortearPonto,
} from "@/modules/fichas/fields/potabilidadePontos";
import type { PotabilidadePontosValor } from "@/modules/fichas/fields/tiposCompostos";

const valor = (ph: string, cloro: string, ponto = "ponto03"): PotabilidadePontosValor => ({ ponto, ph, cloro, conformidade: true, detalhesRNC: null });

describe("potabilidade da água nos pontos de coleta", () => {
  it("tem os 7 pontos (03 a 09)", () => {
    expect(PONTOS_COLETA.map((p) => p.numero)).toEqual(["03", "04", "05", "06", "07", "08", "09"]);
    expect(rotuloPonto("ponto07")).toBe("Ponto 07 — Ponto de abastecimento do pré-chiller");
  });

  it("o sorteio nunca repete o ponto anterior e alcança todos os outros", () => {
    for (const p of PONTOS_COLETA) {
      const sorteados = new Set<string>();
      for (let i = 0; i < 6; i++) sorteados.add(sortearPonto(p.chave, () => i / 6));
      expect(sorteados.has(p.chave)).toBe(false);
      expect(sorteados.size).toBe(PONTOS_COLETA.length - 1);
    }
    for (let i = 0; i < 200; i++) expect(sortearPonto("ponto05")).not.toBe("ponto05");
    expect(PONTOS_COLETA.map((p) => p.chave)).toContain(sortearPonto(undefined, () => 0.9999));
  });

  it("monitoramento novo sorteia ponto com campos vazios", () => {
    expect(potabilidadePontosInicial(valor("7", "1", "ponto04"), () => 0)).toMatchObject({ ponto: "ponto03", ph: "", cloro: "", conformidade: true });
  });

  it("pH 6,0 a 9,0 e cloro 0,2 a 2,0 ppm são conformes, inclusive nos limites", () => {
    for (const [ph, cloro] of [
      ["6", "0,2"],
      ["9,0", "2.0"],
      ["7,5", "1"],
    ]) {
      expect(avaliarPotabilidadePontos(valor(ph!, cloro!)).conformidade).toBe(true);
    }
  });

  it("pH ou cloro fora do limite reprovam e entram na RNC", () => {
    expect(avaliarPotabilidadePontos(valor("5,9", "1")).conformidade).toBe(false);
    expect(avaliarPotabilidadePontos(valor("9,1", "1")).conformidade).toBe(false);
    expect(avaliarPotabilidadePontos(valor("7", "0,1")).conformidade).toBe(false);
    expect(avaliarPotabilidadePontos(valor("7", "2,5")).conformidade).toBe(false);
    const r = montarValorPotabilidadePontos(valor("5", "3", "ponto09"));
    expect(r.conformidade).toBe(false);
    expect(r.detalhesRNC).toContain("Ponto 09");
    expect(r.detalhesRNC).toContain("pH 5");
    expect(r.detalhesRNC).toContain("cloro 3 ppm");
  });

  it("bloqueia a assinatura sem pH e cloro", () => {
    expect(motivosBloqueioPotabilidadePontos(undefined)).toHaveLength(1);
    expect(motivosBloqueioPotabilidadePontos(valor("", ""))).toHaveLength(2);
    expect(motivosBloqueioPotabilidadePontos(valor("7", ""))).toHaveLength(1);
    expect(motivosBloqueioPotabilidadePontos(valor("7", "1"))).toEqual([]);
  });
});
