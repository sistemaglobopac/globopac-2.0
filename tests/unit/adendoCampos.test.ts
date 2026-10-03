import { describe, expect, it } from "vitest";
import { alvosDoCampo, aplicarNoCaminho } from "@/modules/fichas/utils/adendoCampos";

const doa = {
  dataAbate: "2026-10-03",
  totalMortas: 1,
  conformidade: true,
  cargas: [{ cargaId: "c1", gta: "46017", placa: "AYR8A56", avesRecebidas: "3078", avesMortas: "1", doaPct: 0.03 }],
};

describe("alvosDoCampo", () => {
  it("campo simples tem um único alvo com a chave", () => {
    expect(alvosDoCampo({ chave: "temp", label: "Temperatura" }, "28")).toEqual([{ caminho: "temp", rotulo: "Temperatura", valorAtual: "28" }]);
  });

  it("DOA: oferece o peso médio da carga mesmo ausente, e não oferece dados calculados", () => {
    const alvos = alvosDoCampo({ chave: "c_1", label: "DOA", tipo: "rastreabilidade_doa" }, doa);
    const caminhos = alvos.map((a) => a.caminho);
    expect(caminhos).toContain("c_1.cargas.0.pesoMedioKg");
    expect(caminhos).toContain("c_1.cargas.0.placa");
    expect(caminhos).not.toContain("c_1.cargas.0.doaPct");
    expect(alvos.find((a) => a.caminho === "c_1.cargas.0.pesoMedioKg")?.rotulo).toBe("DOA › GTA 46017 › Peso médio (kg)");
  });
});

describe("aplicarNoCaminho", () => {
  it("grava o novo valor no item da lista sem mutar o original", () => {
    const dados = { c_1: doa, outro: "x" };
    const novo = aplicarNoCaminho(dados, "c_1.cargas.0.pesoMedioKg", "2,85");
    expect((novo.c_1 as typeof doa).cargas[0]).toMatchObject({ gta: "46017", pesoMedioKg: "2,85" });
    expect(doa.cargas[0]).not.toHaveProperty("pesoMedioKg");
    expect(novo.outro).toBe("x");
  });

  it("caminho simples substitui o campo", () => {
    expect(aplicarNoCaminho({ a: "1" }, "a", "2")).toEqual({ a: "2" });
  });
});
