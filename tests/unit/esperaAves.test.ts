import { describe, expect, it } from "vitest";
import { acaoCorretivaPendente, avaliarEspera, boxVazio, esperaVazia, lerTemperatura, montarValorEspera, motivosBloqueioEspera } from "@/modules/fichas/fields/esperaAves";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { BoxEsperaAves, EsperaAvesValor } from "@/modules/fichas/fields/tiposCompostos";

function box(parcial: Partial<BoxEsperaAves> = {}): BoxEsperaAves {
  return { ...boxVazio(), box: "1", cargaId: "c1", gta: "123", integrado: "João", aviario: "12", qtdAves: 9000, comportamento: "normais", ...parcial };
}

function completo(parcial: Partial<EsperaAvesValor> = {}): EsperaAvesValor {
  return { ...esperaVazia(), boxes: [box()], temperaturaC: "28,5", aspersoresLigados: false, ventiladoresLigados: false, ...parcial };
}

describe("espera de aves — bem-estar animal", () => {
  it("lê temperatura com vírgula ou ponto", () => {
    expect(lerTemperatura("28,5")).toBe(28.5);
    expect(lerTemperatura("30.1")).toBe(30.1);
    expect(lerTemperatura("")).toBeNull();
    expect(lerTemperatura("abc")).toBeNull();
  });

  it("aves normais com equipamentos desligados é conforme e pode assinar", () => {
    const v = completo();
    expect(avaliarEspera(v).conformidade).toBe(true);
    expect(motivosBloqueioEspera(montarValorEspera(v))).toEqual([]);
  });

  it("ofegantes com aspersores/ventiladores desligados: não conforme, exige ação corretiva e bloqueia a assinatura", () => {
    const v = completo({ boxes: [box({ comportamento: "ofegantes" })] });
    expect(acaoCorretivaPendente(v)).toBe(true);
    const r = avaliarEspera(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos[0]).toContain("Box 1");
    expect(r.motivos[0]).toContain("aspersores e ventiladores");
    expect(motivosBloqueioEspera(v).some((m) => m.includes("ação corretiva"))).toBe(true);
  });

  it("só um equipamento ligado ainda é pendente e nomeia o que falta", () => {
    const v = completo({ boxes: [box({ comportamento: "ofegantes" })], aspersoresLigados: true });
    expect(avaliarEspera(v).motivos[0]).toContain("ventiladores desligados");
  });

  it("depois da ação corretiva (ambos ligados) volta a ser conforme e grava a ação", () => {
    const v = completo({
      boxes: [box({ comportamento: "ofegantes" })],
      aspersoresLigados: true,
      ventiladoresLigados: true,
      acaoCorretiva: true,
      acaoCorretivaEm: "2026-09-30T10:15",
    });
    const m = montarValorEspera(v);
    expect(m.conformidade).toBe(true);
    expect(m.houveOfegantes).toBe(true);
    expect(m.acaoCorretiva).toBe(true);
    expect(m.acaoCorretivaEm).toBe("2026-09-30T10:15");
    expect(motivosBloqueioEspera(m)).toEqual([]);
  });

  it("descarta a ação corretiva quando não há mais aves ofegantes", () => {
    const m = montarValorEspera(completo({ acaoCorretiva: true, acaoCorretivaEm: "2026-09-30T10:15" }));
    expect(m.houveOfegantes).toBe(false);
    expect(m.acaoCorretiva).toBe(false);
    expect(m.acaoCorretivaEm).toBe("");
  });

  it("bloqueia campos obrigatórios ausentes", () => {
    const motivos = motivosBloqueioEspera(esperaVazia()).join("|");
    expect(motivos).toContain("ao menos um box");
    expect(motivos).toContain("temperatura");
    expect(motivos).toContain("aspersores");
    expect(motivos).toContain("ventiladores");
    expect(motivosBloqueioEspera(null)).toHaveLength(1);
  });

  it("exige box, GTA, comportamento e descrição de 'outras' em cada linha", () => {
    const v = completo({ boxes: [box({ box: "", cargaId: "c1", comportamento: "" }), box({ box: "3", cargaId: "", comportamento: "" }), box({ box: "2", comportamento: "outras" })] });
    const m = motivosBloqueioEspera(v).join("|");
    expect(m).toContain("número do box");
    expect(m).toContain("selecione a GTA");
    expect(m).toContain("comportamento das aves");
    expect(m).toContain('"Outras"');
  });

  it("integra com bloqueios e desvios do formulário", () => {
    const campos = [{ chave: "esp", tipo: "espera_aves", obrigatorio: true, label: "Área de espera" }] as CampoTemplate[];
    const v = montarValorEspera(completo({ boxes: [box({ comportamento: "ofegantes" })] }));
    expect(motivosDeBloqueioSpr(campos, { esp: v }).length).toBeGreaterThan(0);
    expect(desviosEspeciais(campos, { esp: v })[0]).toContain("Aves ofegantes");
    expect(desviosEspeciais(campos, { esp: montarValorEspera(completo()) })).toEqual([]);
  });
});
