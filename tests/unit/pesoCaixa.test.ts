import { describe, expect, it } from "vitest";
import { avaliarPesoCaixa, cargaPesoVazia, montarValorPesoCaixa, motivosBloqueioPesoCaixa, pesoCaixaVazio, pesoPorCaixa } from "@/modules/fichas/fields/pesoCaixa";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { CargaPesoCaixa, PesoCaixaValor } from "@/modules/fichas/fields/tiposCompostos";

const carga = (p: Partial<CargaPesoCaixa> = {}): CargaPesoCaixa => ({ ...cargaPesoVazia(), cargaId: "c1", gta: "123", avesPorCaixa: "8", pesoMedioKg: "3", ...p });
const valor = (...cargas: CargaPesoCaixa[]): PesoCaixaValor => ({ ...pesoCaixaVazio(), cargas });

describe("peso vivo por caixa de transporte", () => {
  it("calcula aves por caixa × peso médio (vírgula ou ponto)", () => {
    expect(pesoPorCaixa({ avesPorCaixa: "8", pesoMedioKg: "2,85" })).toBe(22.8);
    expect(pesoPorCaixa({ avesPorCaixa: "8", pesoMedioKg: "2.85" })).toBe(22.8);
    expect(pesoPorCaixa({ avesPorCaixa: "", pesoMedioKg: "2,85" })).toBeNull();
  });

  it("até 25 kg (inclusive) é conforme", () => {
    expect(avaliarPesoCaixa(valor(carga({ avesPorCaixa: "10", pesoMedioKg: "2,5" }))).conformidade).toBe(true);
  });

  it("acima de 25 kg é não conforme e cita a GTA", () => {
    const m = montarValorPesoCaixa(valor(carga({ avesPorCaixa: "9", pesoMedioKg: "2,8" })));
    expect(m.conformidade).toBe(false);
    expect(m.detalhesRNC).toContain("GTA 123");
    expect(m.detalhesRNC).toContain("25.2".replace(".", ",") );
  });

  it("uma carga acima basta para reprovar o registro", () => {
    expect(avaliarPesoCaixa(valor(carga(), carga({ gta: "9", avesPorCaixa: "10", pesoMedioKg: "3" }))).conformidade).toBe(false);
  });

  it("bloqueia carga/aves/peso ausentes", () => {
    expect(motivosBloqueioPesoCaixa(pesoCaixaVazio())).toHaveLength(1);
    expect(motivosBloqueioPesoCaixa(null)).toHaveLength(1);
    expect(motivosBloqueioPesoCaixa(valor(carga({ cargaId: "", avesPorCaixa: "", pesoMedioKg: "2" })))).toHaveLength(2);
    expect(motivosBloqueioPesoCaixa(valor(carga({ pesoMedioKg: "" })))).toHaveLength(1);
    expect(motivosBloqueioPesoCaixa(valor(carga()))).toEqual([]);
  });

  it("integra com bloqueios e desvios do formulário", () => {
    const campos = [{ chave: "pc", tipo: "peso_caixa", obrigatorio: true, label: "Peso por caixa" }] as CampoTemplate[];
    const nc = montarValorPesoCaixa(valor(carga({ avesPorCaixa: "10", pesoMedioKg: "3" })));
    expect(motivosDeBloqueioSpr(campos, { pc: nc })).toEqual([]);
    expect(desviosEspeciais(campos, { pc: nc })[0]).toContain("Peso vivo");
    expect(desviosEspeciais(campos, { pc: montarValorPesoCaixa(valor(carga())) })).toEqual([]);
  });
});
