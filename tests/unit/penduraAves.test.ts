import { describe, expect, it } from "vitest";
import { avaliarPendura, montarValorPendura, motivosBloqueioPendura, penduraVazia } from "@/modules/fichas/fields/penduraAves";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { PenduraAvesValor } from "@/modules/fichas/fields/tiposCompostos";

function completo(parcial: Partial<PenduraAvesValor> = {}): PenduraAvesValor {
  return {
    ...penduraVazia(),
    temperaturaC: "26,5",
    ventiladoresLigados: true,
    luzesAcesas: false,
    ruidosDesnecessarios: false,
    auxiliaresConformes: true,
    ...parcial,
  };
}

describe("sala de pendura — bem-estar animal", () => {
  it("tudo em ordem é conforme e pode assinar", () => {
    const v = completo();
    expect(avaliarPendura(v).conformidade).toBe(true);
    expect(motivosBloqueioPendura(montarValorPendura(v))).toEqual([]);
  });

  it("ventiladores desligados e luzes acesas não reprovam sozinhos", () => {
    expect(avaliarPendura(completo({ ventiladoresLigados: false, luzesAcesas: true })).conformidade).toBe(true);
  });

  it("ruído desnecessário é não conforme e exige descrição para assinar", () => {
    const v = completo({ ruidosDesnecessarios: true });
    expect(avaliarPendura(v).conformidade).toBe(false);
    expect(motivosBloqueioPendura(v).join("|")).toContain("descreva a ocorrência");
    expect(motivosBloqueioPendura({ ...v, descricaoDesvio: "Equipamento barulhento" })).toEqual([]);
  });

  it("auxiliares fora dos princípios de bem-estar: não conforme, com a ocorrência no detalhe", () => {
    const m = montarValorPendura(completo({ auxiliaresConformes: false, descricaoDesvio: "Aves seguras pelas asas" }));
    expect(m.conformidade).toBe(false);
    expect(m.detalhesRNC).toContain("bem-estar animal");
    expect(m.detalhesRNC).toContain("Aves seguras pelas asas");
  });

  it("descarta a descrição quando o desvio é corrigido", () => {
    const m = montarValorPendura(completo({ descricaoDesvio: "texto antigo" }));
    expect(m.conformidade).toBe(true);
    expect(m.descricaoDesvio).toBe("");
    expect(m.detalhesRNC).toBeNull();
  });

  it("bloqueia respostas ausentes", () => {
    const motivos = motivosBloqueioPendura(penduraVazia()).join("|");
    for (const parte of ["temperatura", "ventiladores", "luzes", "ruídos", "auxiliares"]) expect(motivos).toContain(parte);
    expect(motivosBloqueioPendura(null)).toHaveLength(1);
  });

  it("integra com bloqueios e desvios do formulário", () => {
    const campos = [{ chave: "pend", tipo: "pendura_aves", obrigatorio: true, label: "Sala de pendura" }] as CampoTemplate[];
    const nc = montarValorPendura(completo({ ruidosDesnecessarios: true, descricaoDesvio: "x" }));
    expect(motivosDeBloqueioSpr(campos, { pend: nc })).toEqual([]);
    expect(desviosEspeciais(campos, { pend: nc })[0]).toContain("Ruídos desnecessários");
    expect(desviosEspeciais(campos, { pend: montarValorPendura(completo()) })).toEqual([]);
  });
});
