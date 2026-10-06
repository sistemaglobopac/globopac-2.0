import { describe, expect, it } from "vitest";
import { vereditoAntecipado, vereditoGeral } from "@/modules/fichas/fields/vereditoVazao";
import { baseDeCargasAnteriores, baseDeCargasJaUsadas, calcularPeriodo, penduraParaIso, type CargaDoDia } from "@/modules/fichas/fields/cargasDoPeriodo";
import { metaTanqueCarcacas } from "@/modules/fichas/fields/calculosSpr";

describe("veredito antecipado da vazão (sem o peso)", () => {
  it("abaixo da meta da faixa mais branda: NÃO CONFORME em qualquer peso (pré-chiller < 1,5)", () => {
    expect(vereditoAntecipado("preChiller", 1.4)?.estado).toBe("nao_conforme_certo");
    // consistente com a regra real: nenhuma faixa aceita 1,4 no pré-chiller
    for (const peso of [1.5, 2.5, 3, 5, 6]) expect(1.4 >= metaTanqueCarcacas("preChiller", peso)).toBe(false);
  });

  it("na meta da faixa mais exigente ou acima: CONFORME em qualquer peso (pré-chiller ≥ 2,2)", () => {
    expect(vereditoAntecipado("preChiller", 2.2)?.estado).toBe("conforme_certo");
    for (const peso of [1.5, 2.5, 3, 5, 6]) expect(2.2 >= metaTanqueCarcacas("preChiller", peso)).toBe(true);
  });

  it("no meio, depende do peso e informa o corte exato (1,6 no pré-chiller: só vale até 2,5 kg de carcaça)", () => {
    const v = vereditoAntecipado("preChiller", 1.6)!;
    expect(v.estado).toBe("depende_do_peso");
    expect(v.conformeSeCarcacaAteKg).toBe(2.5);
    expect(v.conformeSePesoVivoAteKg).toBe(2.976); // 2,5 ÷ 0,84
    // confere com a regra real nos dois lados do corte
    expect(1.6 >= metaTanqueCarcacas("preChiller", 2.5)).toBe(true);
    expect(1.6 >= metaTanqueCarcacas("preChiller", 2.51)).toBe(false);
  });

  it("1,8 no pré-chiller atende até a faixa de 5,0 kg", () => {
    const v = vereditoAntecipado("preChiller", 1.8)!;
    expect(v.estado).toBe("depende_do_peso");
    expect(v.conformeSeCarcacaAteKg).toBe(5.0);
    expect(v.conformeSePesoVivoAteKg).toBe(5.952);
  });

  it("vale para os três tanques com as suas metas (chiller 2: 1,0 / 1,5 / 2,0)", () => {
    expect(vereditoAntecipado("chiller2", 0.9)?.estado).toBe("nao_conforme_certo");
    expect(vereditoAntecipado("chiller2", 1.2)?.conformeSeCarcacaAteKg).toBe(2.5);
    expect(vereditoAntecipado("chiller2", 1.5)?.conformeSeCarcacaAteKg).toBe(5.0);
    expect(vereditoAntecipado("chiller2", 2.0)?.estado).toBe("conforme_certo");
  });

  it("sem leitura não há veredito", () => {
    expect(vereditoAntecipado("preChiller", null)).toBeNull();
    expect(vereditoGeral([null, null])).toBeNull();
  });

  it("veredito geral: não conforme certo vence; senão o corte mais restritivo; conforme só se todos forem", () => {
    const a = vereditoAntecipado("preChiller", 1.4);
    const b = vereditoAntecipado("chiller1", 1.7);
    const c = vereditoAntecipado("chiller2", 2.5);
    expect(vereditoGeral([b, c, a])?.estado).toBe("nao_conforme_certo");
    // chiller1 1,7: atende até 5,0 kg (meta 1,6); pré-chiller 1,6: só até 2,5 kg → corte mais restritivo
    expect(vereditoGeral([vereditoAntecipado("chiller1", 1.7), vereditoAntecipado("preChiller", 1.6)])?.conformeSeCarcacaAteKg).toBe(2.5);
    expect(vereditoGeral([vereditoAntecipado("preChiller", 2.3), c])?.estado).toBe("conforme_certo");
  });
});

// Dia de exemplo: pendura começa às 06:00 de Manaus. Carga = 5.000 aves a 6.960 aves/h (43,1 min cada).
const inicio = (minutos: number) => {
  const total = 6 * 60 + minutos;
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(Math.floor(total % 60)).padStart(2, "0");
  return `2026-10-06T${h}:${m}`;
};
const carga = (n: number, minutos: number, peso: string | null): CargaDoDia => ({ carga_id: `c${n}`, gta: `GTA${n}`, qtd_aves: 5000, pendura_inicio_em: inicio(minutos), peso_medio_kg: peso });
const dia: CargaDoDia[] = [carga(1, 0, "2,900"), carga(2, 43.1, "3,050"), carga(3, 86.2, null)];

describe("cargas do período (pela chegada ao pré-resfriamento)", () => {
  it("pendura de Manaus sem fuso vira ISO com -04:00", () => {
    expect(penduraParaIso("2026-10-06T06:00")).toBe("2026-10-06T06:00:00-04:00");
    expect(penduraParaIso("2026-10-06T06:00:00Z")).toBe("2026-10-06T06:00:00Z");
    expect(penduraParaIso("")).toBe("");
  });

  it("exemplo: monitoramento às 08:10 → cargas 1 e 2 inteiras e parte da 3, com peso pendente na 3", () => {
    const r = calcularPeriodo(dia, new Date("2026-10-06T08:10:00-04:00"), null);
    expect(r.lotes.map((l) => [l.gta, l.completa])).toEqual([
      ["GTA1", true],
      ["GTA2", true],
      ["GTA3", false],
    ]);
    expect(r.totalAves).toBeGreaterThan(13500);
    expect(r.totalAves).toBeLessThan(13700);
    expect(r.lotes[0]!.pesoVivo).toBe("2.900");
    expect(r.lotes[1]!.pesoVivo).toBe("3.050");
    // a carga 3 ainda não tem peso da balança: aguardando
    expect(r.semPeso.map((l) => l.gta)).toEqual(["GTA3"]);
    expect(r.lotes[2]!.pesoVivo).toBe("");
  });

  it("o 2º monitoramento só recebe o que chegou depois (base = acumulado do anterior)", () => {
    const m1 = calcularPeriodo(dia, new Date("2026-10-06T07:00:00-04:00"), null);
    const base = Object.fromEntries(m1.chegada.porCarga.map((c) => [c.cargaId, c.aves]));
    const m2 = calcularPeriodo(dia, new Date("2026-10-06T08:10:00-04:00"), base);
    const total2 = calcularPeriodo(dia, new Date("2026-10-06T08:10:00-04:00"), null).totalAves;
    expect(m2.totalAves).toBe(total2 - m1.totalAves);
    // soma dos dois períodos = tudo que chegou até as 08:10 (nenhuma ave contada duas vezes)
    expect(m1.totalAves + m2.totalAves).toBe(total2);
  });

  it("sem acumulado guardado, cargas já usadas em apurações anteriores contam inteiras", () => {
    const base = baseDeCargasJaUsadas(dia, new Set(["c1"]));
    expect(base).toEqual({ c1: 5000 });
    const r = calcularPeriodo(dia, new Date("2026-10-06T08:10:00-04:00"), base);
    expect(r.lotes.some((l) => l.gta === "GTA1")).toBe(false);
  });

  it("carga sem pendura registrada não entra", () => {
    const r = calcularPeriodo([...dia, { carga_id: "c4", gta: "GTA4", qtd_aves: 5000, pendura_inicio_em: null, peso_medio_kg: "2,9" }], new Date("2026-10-06T08:10:00-04:00"), null);
    expect(r.lotes.some((l) => l.gta === "GTA4")).toBe(false);
  });

  it("base quando o anterior foi digitado à mão: vale a quantidade que entrou no lote, não a carga inteira", () => {
    const base = baseDeCargasAnteriores(dia, new Set(["c1", "c2"]), [{ cargaId: "c2", quantity: "1200" }, { quantity: "50" }]);
    expect(base).toEqual({ c1: 5000, c2: 1200 }); // c1 já apurada inteira; c2 só 1.200 entraram
    // o período seguinte ainda recebe o resto da carga 2
    const r = calcularPeriodo(dia, new Date("2026-10-06T08:10:00-04:00"), base);
    expect(r.lotes.find((l) => l.gta === "GTA2")!.aves).toBe(5000 - 1200);
    expect(r.lotes.some((l) => l.gta === "GTA1")).toBe(false);
  });
});

