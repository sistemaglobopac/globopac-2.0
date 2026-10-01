import { describe, expect, it } from "vitest";
import { avaliarCaixasVazias, caixasVaziasVazio, montarValorCaixasVazias, motivosBloqueioCaixasVazias } from "@/modules/fichas/fields/caixasVazias";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";

describe("caixas de transporte vazias antes da imersão", () => {
  it("todas vazias: conforme e pode assinar", () => {
    const v = montarValorCaixasVazias({ ...caixasVaziasVazio(), todasVazias: true });
    expect(v.conformidade).toBe(true);
    expect(motivosBloqueioCaixasVazias(v)).toEqual([]);
  });

  it("não respondido bloqueia", () => {
    expect(motivosBloqueioCaixasVazias(caixasVaziasVazio())).toHaveLength(1);
    expect(motivosBloqueioCaixasVazias(null)).toHaveLength(1);
  });

  it("caixas não vazias: não conforme, exige quantidade e ação corretiva", () => {
    const v = { ...caixasVaziasVazio(), todasVazias: false };
    expect(avaliarCaixasVazias(v).conformidade).toBe(false);
    expect(motivosBloqueioCaixasVazias(v)).toHaveLength(2);
    const ok = montarValorCaixasVazias({ ...v, caixasNaoVazias: "3", acaoCorretiva: "Esvaziadas" });
    expect(motivosBloqueioCaixasVazias(ok)).toEqual([]);
    expect(ok.detalhesRNC).toContain("3 caixas");
    expect(ok.detalhesRNC).toContain("Esvaziadas");
  });

  it("descarta quantidade/ação ao voltar para 'todas vazias'", () => {
    const v = montarValorCaixasVazias({ ...caixasVaziasVazio(), todasVazias: true, caixasNaoVazias: "2", acaoCorretiva: "x" });
    expect(v.caixasNaoVazias).toBe("");
    expect(v.acaoCorretiva).toBe("");
    expect(v.detalhesRNC).toBeNull();
  });

  it("integra com bloqueios e desvios do formulário", () => {
    const campos = [{ chave: "cx", tipo: "caixas_vazias", obrigatorio: true, label: "Caixas" }] as CampoTemplate[];
    const nc = montarValorCaixasVazias({ ...caixasVaziasVazio(), todasVazias: false, caixasNaoVazias: "1", acaoCorretiva: "x" });
    expect(motivosDeBloqueioSpr(campos, { cx: nc })).toEqual([]);
    expect(desviosEspeciais(campos, { cx: nc })[0]).toContain("Caixas de transporte");
  });
});
