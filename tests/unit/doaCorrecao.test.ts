import { describe, expect, it } from "vitest";
import { ajustesDeCargaDoa, ajustesQueSeAplicam, recalcularDoaNoRegistro } from "@/modules/fichas/utils/doaCorrecao";

const carga = (cargaId: string, recebidas: string, mortas: string, extra: Record<string, unknown> = {}) => ({
  cargaId, gta: `G-${cargaId}`, qtdPrevista: 1000, avesRecebidas: recebidas, avesMortas: mortas, doaPct: null, saldoDiferenca: null, notaSaldo: null, ...extra,
});
const registro = (cargas: unknown[]) => ({
  campo_1: { dataAbate: "2026-10-10", cargas, totalRecebidas: 0, totalMortas: 0, doaTotalPct: null, conformidade: true, detalhesRNC: null },
  outro: "x",
});

describe("recalcularDoaNoRegistro", () => {
  it("recalcula % de DOA, saldo, nota e a soma do dia depois da correção", () => {
    const r = recalcularDoaNoRegistro(registro([carga("a", "3744", "10"), carga("b", "1000", "0")])) as ReturnType<typeof registro>;
    const v = r.campo_1 as Record<string, unknown> & { cargas: Record<string, unknown>[] };
    expect(v.cargas[0]).toMatchObject({ doaPct: 0.27, saldoDiferenca: 2744 });
    expect(String(v.cargas[0]!.notaSaldo)).toContain("a mais");
    expect(v.cargas[1]).toMatchObject({ doaPct: 0, saldoDiferenca: 0, notaSaldo: null });
    expect(v).toMatchObject({ totalRecebidas: 4744, totalMortas: 10, doaTotalPct: 0.21 });
    expect(r.outro).toBe("x");
  });

  it("carga sem aves recebidas não entra na soma; dado antigo sem qtdPrevista não é recalculado mas conta na soma", () => {
    const antiga = { cargaId: "z", avesRecebidas: "5", avesMortas: "1" };
    const v = (recalcularDoaNoRegistro(registro([carga("a", "", ""), antiga])) as ReturnType<typeof registro>).campo_1 as Record<string, unknown> & { cargas: unknown[] };
    expect(v.cargas[1]).toEqual(antiga);
    expect(v).toMatchObject({ totalRecebidas: 5, totalMortas: 1, doaTotalPct: 20 });
  });
});

describe("ajustesDeCargaDoa / ajustesQueSeAplicam", () => {
  const corrigido = registro([carga("a", "3000", "1"), carga("b", "3072", "2")]);
  const correcoes = { "campo_1.cargas.1.avesRecebidas": { old: "3581", new: "3072" }, "campo_1.cargas.1.doaPct": { old: 1, new: 2 }, "outro.x": { old: 1, new: 2 } };

  it("identifica a carga pelo id (não pela posição) e ignora derivados e outros campos", () => {
    expect(ajustesDeCargaDoa(corrigido, correcoes)).toEqual([
      { campo: "campo_1", cargaId: "b", prop: "avesRecebidas", antigo: "3581", novo: "3072", dataAbate: "2026-10-10" },
    ]);
  });

  it("aplica ao seguinte onde a carga ainda tem o valor antigo, mesmo em outra posição", () => {
    const ajustes = ajustesDeCargaDoa(corrigido, correcoes);
    expect(ajustesQueSeAplicam(ajustes, registro([carga("b", "3581", "2"), carga("a", "3000", "1")]))).toHaveLength(1);
    expect(ajustesQueSeAplicam(ajustes, registro([carga("b", "3072", "2")]))).toHaveLength(0); // já corrigido
    expect(ajustesQueSeAplicam(ajustes, registro([carga("a", "3000", "1")]))).toHaveLength(0); // sem a carga
    expect(ajustesQueSeAplicam(ajustes, { campo_1: { ...registro([carga("b", "3581", "2")]).campo_1, dataAbate: "2026-10-11" } })).toHaveLength(0); // outro dia de abate
  });
});
