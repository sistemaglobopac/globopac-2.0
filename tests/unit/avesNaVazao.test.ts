import { describe, expect, it } from "vitest";
import { avesContadas, conferirAvesNaVazao, type CargaProgramada, type RegistroVazao } from "@/modules/bordo/avesNaVazao";

const carga = (id: string, gta: string, qtd: number): CargaProgramada => ({ carga_id: id, gta, integrado: "Integrado X", aviario: "Aviário 1", qtd_aves: qtd, placa: null });
const lote = (cargaId: string, quantity: string) => ({ id: cargaId, quantity, avgLiveWeight: "", cargaId });
const registro = (cargas: ReturnType<typeof lote>[], acumulado?: Record<string, number>): RegistroVazao => ({
  carcacas: { cargas, ...(acumulado ? { chegada: { corteEm: "", velocidadeAvesH: 0, origemVelocidade: "nominal" as const, transitoSegundos: 0, acumulado } } : {}) },
});

describe("conferirAvesNaVazao", () => {
  it("soma as aves de cada carga ao longo dos monitoramentos e aponta o que falta", () => {
    const cargas = [carga("a", "111", 3000), carga("b", "222", 2000), carga("c", "333", 1000)];
    const resumo = conferirAvesNaVazao(cargas, [
      registro([lote("a", "3.000"), lote("b", "500")]),
      registro([lote("b", "700")]),
    ]);
    expect(resumo.linhas.map((l) => [l.gta, l.contadas, l.situacao])).toEqual([
      ["111", 3000, "completa"],
      ["222", 1200, "parcial"],
      ["333", 0, "nao_iniciada"],
    ]);
    expect(resumo.totalProgramadas).toBe(6000);
    expect(resumo.totalContadas).toBe(4200);
    expect(resumo.incompletas).toBe(2);
  });

  it("nunca passa das aves programadas da carga", () => {
    const resumo = conferirAvesNaVazao([carga("a", "111", 1000)], [registro([lote("a", "800")]), registro([lote("a", "800")])]);
    expect(resumo.linhas[0]).toMatchObject({ contadas: 1000, situacao: "completa" });
  });

  it("registros antigos sem lotes ligados à carga usam o acumulado guardado", () => {
    const m = avesContadas([registro([], { a: 400 }), registro([], { a: 900 })]);
    expect(m.porCarga.get("a")).toBe(900);
  });

  it("aves digitadas à mão enchem as cargas pela ordem recebida e dizem de quais cargas são", () => {
    const cargas = [carga("a", "111", 3000), carga("b", "222", 2000), carga("c", "333", 1000)];
    const resumo = conferirAvesNaVazao(cargas, [{ carcacas: { cargas: [{ id: "x", quantity: "4.000", avgLiveWeight: "" }] } }]);
    expect(resumo.linhas.map((l) => [l.gta, l.contadas, l.aMao, l.situacao])).toEqual([
      ["111", 3000, 3000, "completa"],
      ["222", 1000, 1000, "parcial"],
      ["333", 0, 0, "nao_iniciada"],
    ]);
    expect(resumo.totalAMao).toBe(4000);
    expect(resumo.aMaoExcedente).toBe(0);
  });

  it("se a pendura é registrada depois, a atribuição se corrige sozinha com a nova ordem das cargas", () => {
    const registros: RegistroVazao[] = [{ carcacas: { cargas: [{ id: "x", quantity: "3000", avgLiveWeight: "" }] } }];
    const antes = conferirAvesNaVazao([carga("a", "111", 3000), carga("b", "222", 2000)], registros);
    expect(antes.linhas.map((l) => [l.gta, l.aMao])).toEqual([["111", 3000], ["222", 0]]);
    // o Bem-Estar Animal registrou a pendura da carga 222 primeiro: ela passa a ser a primeira da linha
    const depois = conferirAvesNaVazao([carga("b", "222", 2000), carga("a", "111", 3000)], registros);
    expect(depois.linhas.map((l) => [l.gta, l.aMao])).toEqual([["222", 2000], ["111", 1000]]);
  });

  it("as aves à mão só ocupam o que falta de cada carga depois dos lotes já ligados a ela", () => {
    const resumo = conferirAvesNaVazao(
      [carga("a", "111", 3000), carga("b", "222", 2000)],
      [registro([lote("a", "1000")]), { carcacas: { cargas: [{ id: "x", quantity: "2500", avgLiveWeight: "" }] } }]
    );
    expect(resumo.linhas.map((l) => [l.gta, l.contadas, l.aMao])).toEqual([["111", 3000, 2000], ["222", 500, 500]]);
  });

  it("aves à mão além do total programado ficam como excedente", () => {
    const resumo = conferirAvesNaVazao([carga("a", "111", 1000)], [{ carcacas: { cargas: [{ id: "x", quantity: "1500", avgLiveWeight: "" }] } }]);
    expect(resumo.totalContadas).toBe(1000);
    expect(resumo.aMaoExcedente).toBe(500);
  });

  it("monitoramento sem o campo de vazão é ignorado", () => {
    expect(conferirAvesNaVazao([carga("a", "111", 1000)], [{ carcacas: undefined }]).totalContadas).toBe(0);
  });
});
