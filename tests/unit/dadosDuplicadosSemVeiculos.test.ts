import { describe, expect, it } from "vitest";
import { montarValorEspera, esperaVazia, boxVazio } from "@/modules/fichas/fields/esperaAves";
import { assinaturaDosDados, repeteOAnterior, type RegistroComHora } from "@/modules/fichas/utils/dadosDuplicados";

const HORA_1 = "2026-10-13T10:00:00Z";
const reg = (dados: Record<string, unknown>): RegistroComHora => ({ dados, hora: HORA_1 });
const semVeiculos = () => ({ campo_espera: montarValorEspera({ ...esperaVazia(), semVeiculos: true }), hora_monitoramento: "2026-10-13T11:00:00Z" });

describe("área de espera 'sem veículos nos boxes' não é registro duplicado", () => {
  it("vários monitoramentos seguidos 'sem veículos' são aceitos (antes o segundo era recusado como repetido)", () => {
    expect(repeteOAnterior(semVeiculos(), [reg(semVeiculos())])).toBe(false);
  });

  it("o registro 'sem veículos' não tem dado medido", () => {
    expect(assinaturaDosDados(semVeiculos())).toBe("{}");
  });

  it("com veículos, a trava continua valendo: dois monitoramentos idênticos continuam sendo recusados", () => {
    const comCarga = (graus: string) => ({
      campo_espera: montarValorEspera({
        ...esperaVazia(),
        temperaturaC: graus,
        aspersoresLigados: true,
        ventiladoresLigados: true,
        boxes: [{ ...boxVazio(), box: "1", cargaId: "c1", gta: "123", comportamento: "normais" }],
      }),
    });
    expect(repeteOAnterior(comCarga("28"), [reg(comCarga("28"))])).toBe(true);
    expect(repeteOAnterior(comCarga("29"), [reg(comCarga("28"))])).toBe(false);
  });
});
