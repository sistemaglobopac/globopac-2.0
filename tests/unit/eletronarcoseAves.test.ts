import { describe, expect, it } from "vitest";
import { avaliarEletronarcose, eletronarcoseVazia, montarValorEletronarcose, motivosBloqueioEletronarcose } from "@/modules/fichas/fields/eletronarcoseAves";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { EletronarcoseAvesValor } from "@/modules/fichas/fields/tiposCompostos";

function completo(p: Partial<EletronarcoseAvesValor> = {}): EletronarcoseAvesValor {
  return {
    ...eletronarcoseVazia(),
    voltagemV: "80",
    frequenciaHz: "600",
    correnteMa: "100",
    contencaoS: "45",
    tempoCubaS: "10",
    saidaSangriaS: "10",
    sangriaS: "190",
    preChoque: false,
    avesSemSangrar: false,
    vocalizacao: false,
    reflexosOculares: false,
    asasAfastadas: false,
    respiracaoRitmica: false,
    tremores: true,
    posturaEstacaoMin: "30",
    ...p,
  };
}

describe("eletronarcose — bem-estar animal", () => {
  it("tudo em ordem é conforme e pode assinar", () => {
    const v = completo();
    expect(avaliarEletronarcose(v).conformidade).toBe(true);
    expect(motivosBloqueioEletronarcose(montarValorEletronarcose(v))).toEqual([]);
  });

  it("limites exatos das faixas elétricas são conformes", () => {
    expect(avaliarEletronarcose(completo({ voltagemV: "30", frequenciaHz: "1500", correnteMa: "25" })).conformidade).toBe(true);
    expect(avaliarEletronarcose(completo({ voltagemV: "150", frequenciaHz: "20", correnteMa: "200" })).conformidade).toBe(true);
  });

  it("limites exatos são conformes (60 s, 12 s, 180 s)", () => {
    expect(avaliarEletronarcose(completo({ contencaoS: "60", saidaSangriaS: "12", sangriaS: "180" })).conformidade).toBe(true);
  });

  it.each([
    [{ voltagemV: "29" }, "Voltagem"],
    [{ voltagemV: "151" }, "Voltagem"],
    [{ frequenciaHz: "19" }, "Frequência"],
    [{ frequenciaHz: "1501" }, "Frequência"],
    [{ correnteMa: "24" }, "Corrente"],
    [{ correnteMa: "201" }, "Corrente"],
    [{ contencaoS: "61" }, "Contenção"],
    [{ saidaSangriaS: "12,5" }, "Saída da cuba"],
    [{ sangriaS: "179" }, "sangria"],
    [{ preChoque: true }, "pré-choque"],
    [{ avesSemSangrar: true }, "sem sangrar"],
    [{ vocalizacao: true }, "Vocalização"],
    [{ reflexosOculares: true }, "Reflexos oculares"],
    [{ asasAfastadas: true }, "Asas afastadas"],
    [{ respiracaoRitmica: true }, "Respiração rítmica"],
    [{ tremores: false }, "Ausência de tremores"],
    [{ posturaEstacaoMin: "61" }, "postura de estação"],
  ])("%j reprova", (parcial, trecho) => {
    const a = avaliarEletronarcose(completo(parcial as Partial<EletronarcoseAvesValor>));
    expect(a.conformidade).toBe(false);
    expect(a.motivos.join(" ").toLowerCase()).toContain(trecho.toLowerCase());
  });

  it("postura de estação aceita exatamente 60 min", () => {
    expect(avaliarEletronarcose(completo({ posturaEstacaoMin: "60" })).conformidade).toBe(true);
  });

  it("tempos sem limite não reprovam sozinhos", () => {
    expect(avaliarEletronarcose(completo({ tempoCubaS: "999" })).conformidade).toBe(true);
  });

  it("vazio bloqueia a assinatura; desvio exige descrição", () => {
    expect(motivosBloqueioEletronarcose(eletronarcoseVazia()).length).toBeGreaterThan(10);
    expect(motivosBloqueioEletronarcose(undefined)).toHaveLength(1);
    expect(motivosBloqueioEletronarcose(completo({ preChoque: true }))).toContain("Eletronarcose: descreva a ocorrência e a ação corretiva adotada.");
    expect(motivosBloqueioEletronarcose(completo({ preChoque: true, descricaoDesvio: "ajustado" }))).toEqual([]);
  });

  it("descrição é descartada quando o desvio some", () => {
    expect(montarValorEletronarcose(completo({ descricaoDesvio: "x" })).descricaoDesvio).toBe("");
  });

  it("integra com desvios e bloqueios da ficha", () => {
    const campos = [{ chave: "e", tipo: "eletronarcose_aves", obrigatorio: true, label: "Eletronarcose" }] as CampoTemplate[];
    expect(desviosEspeciais(campos, { e: montarValorEletronarcose(completo({ preChoque: true, descricaoDesvio: "x" })) })).toHaveLength(1);
    expect(motivosDeBloqueioSpr(campos, { e: eletronarcoseVazia() }).length).toBeGreaterThan(0);
  });
});
