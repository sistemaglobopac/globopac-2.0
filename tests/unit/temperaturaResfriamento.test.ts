import { describe, expect, it } from "vitest";
import {
  avaliarTemperaturas,
  lerTemperatura,
  montarValorTemperatura,
  motivosBloqueioTemperatura,
  temperaturaVazia,
} from "@/modules/fichas/fields/temperaturaResfriamento";
import type { TemperaturaResfriamentoValor } from "@/modules/fichas/fields/tiposCompostos";

function completo(): TemperaturaResfriamentoValor {
  const v = temperaturaVazia();
  v.agua = { preChiller: "15,5", chiller1: "3,8", chiller2: "2", chillerPartes1: "3", chillerPartes2: "3", miniFigado: "3", miniMoela: "3", miniCabeca: "3", miniCoracao: "3", miniPes: "3" };
  for (const k of Object.keys(v.produtos) as (keyof typeof v.produtos)[]) v.produtos[k] = { amostra1: "5", amostra2: "6,5" };
  v.ambiente = { salaCarcacas: "10", salaMiudos: "11,5" };
  v.tipoParte = "Asa";
  return v;
}

describe("temperaturas do pré-resfriamento", () => {
  it("lê temperatura com vírgula, ponto e negativa; vazio é null", () => {
    expect(lerTemperatura("3,5")).toBe(3.5);
    expect(lerTemperatura("-1.2")).toBe(-1.2);
    expect(lerTemperatura("")).toBeNull();
    expect(lerTemperatura("abc")).toBeNull();
  });

  it("tudo dentro dos limites é conforme", () => {
    expect(avaliarTemperaturas(completo())).toEqual({ conformidade: true, motivos: [] });
  });

  it("pré-chiller aceita até 16 ºC; acima disso não conforme", () => {
    const v = completo();
    v.agua.preChiller = "16";
    expect(avaliarTemperaturas(v).conformidade).toBe(true);
    v.agua.preChiller = "16,1";
    expect(avaliarTemperaturas(v).motivos[0]).toMatch(/Pré-chiller.*16,1 ºC \(limite 16 ºC\)/);
  });

  it("demais tanques aceitam até 4 ºC (inclusive o chiller 01 e mini-chillers)", () => {
    const v = completo();
    v.agua.chiller1 = "4";
    v.agua.miniPes = "4";
    expect(avaliarTemperaturas(v).conformidade).toBe(true);
    v.agua.chiller1 = "4,5";
    v.agua.miniPes = "5";
    const r = avaliarTemperaturas(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toHaveLength(2);
  });

  it("produtos aceitam até 7 ºC por amostra; informa a parte aferida", () => {
    const v = completo();
    v.produtos.parte.amostra2 = "7";
    expect(avaliarTemperaturas(v).conformidade).toBe(true);
    v.produtos.parte.amostra2 = "7,2";
    v.produtos.carcaca.amostra1 = "8";
    const r = avaliarTemperaturas(v);
    expect(r.motivos).toEqual(expect.arrayContaining([expect.stringContaining("Parte (Asa) 02: 7,2 ºC"), expect.stringContaining("Carcaça 01: 8 ºC")]));
  });

  it("temperatura ambiente das salas aceita até 12 ºC", () => {
    const v = completo();
    v.ambiente = { salaCarcacas: "12", salaMiudos: "12" };
    expect(avaliarTemperaturas(v).conformidade).toBe(true);
    v.ambiente = { salaCarcacas: "12,1", salaMiudos: "13" };
    const r = avaliarTemperaturas(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toEqual([
      expect.stringContaining("Sala de Pré-resfriamento de Carcaças: 12,1 ºC (limite 12 ºC)"),
      expect.stringContaining("Sala de Pré-resfriamento de Miúdos: 13 ºC (limite 12 ºC)"),
    ]);
  });

  it("monta o valor com conformidade e detalhes para a RNC", () => {
    const v = completo();
    v.agua.chiller2 = "6";
    const m = montarValorTemperatura(v);
    expect(m.conformidade).toBe(false);
    expect(m.detalhesRNC).toMatch(/^Temperatura acima do limite — /);
    expect(montarValorTemperatura(completo()).detalhesRNC).toBeNull();
  });

  it("bloqueia a assinatura enquanto faltar qualquer temperatura ou a parte", () => {
    expect(motivosBloqueioTemperatura(undefined)).toHaveLength(1);
    expect(motivosBloqueioTemperatura(completo())).toEqual([]);
    const v = completo();
    v.agua.miniFigado = "";
    v.tipoParte = "";
    v.produtos.pes.amostra2 = "";
    v.ambiente.salaMiudos = "";
    expect(motivosBloqueioTemperatura(v)).toHaveLength(4);
  });
});
