import { describe, expect, it } from "vitest";
import { cargasEmRascunhoPorTipo } from "@/modules/fichas/utils/rascunhosAnterior";
import type { Rascunho } from "@/lib/rascunhos";

const rascunho = (dados: Record<string, unknown>) => ({ codigo: "F", setor: "S", dadosDinamicos: dados }) as unknown as Rascunho;

describe("cargasEmRascunhoPorTipo: cargas já monitoradas em rascunhos (ainda não assinados)", () => {
  it("recepção: coleta a carga do campo que tem início da pendura", () => {
    const r = cargasEmRascunhoPorTipo([rascunho({ a: { cargaId: "c1", penduraInicioEm: "2026-10-06T06:00", placa: "ABC1D23" } })]);
    expect([...r.recepcao]).toEqual(["c1"]);
    expect(r.peso.size).toBe(0);
  });

  it("peso por caixa: coleta as cargas com aves por caixa (mesmo sem peso: aguardando a balança)", () => {
    const r = cargasEmRascunhoPorTipo([
      rascunho({ p: { cargas: [{ cargaId: "c2", avesPorCaixa: "10", pesoMedioKg: "" }, { cargaId: "c3", avesPorCaixa: "12", pesoMedioKg: "2,9" }] } }),
    ]);
    expect([...r.peso].sort()).toEqual(["c2", "c3"]);
    expect(r.recepcao.size).toBe(0);
  });

  it("DOA: devolve as linhas já preenchidas (para entrarem como já registradas); linha em branco não conta", () => {
    const r = cargasEmRascunhoPorTipo([
      rascunho({ d: { cargas: [{ cargaId: "c4", avesRecebidas: "5000", avesMortas: "10" }, { cargaId: "c5", avesRecebidas: "", avesMortas: "" }] } }),
    ]);
    expect(r.doa.map((c) => c.cargaId)).toEqual(["c4"]);
  });

  it("vale para qualquer ficha do usuário (a carga é monitorada uma vez por tipo, não por ficha); ignora o que não é widget de cargas", () => {
    const r = cargasEmRascunhoPorTipo([
      { codigo: "A", setor: "X", dadosDinamicos: { a: { cargaId: "c1", penduraInicioEm: "x" } } } as unknown as Rascunho,
      { codigo: "B", setor: "Y", dadosDinamicos: { texto: "x", nulo: null, n: 3, lista: [1] } } as unknown as Rascunho,
    ]);
    expect([...r.recepcao]).toEqual(["c1"]);
    expect(cargasEmRascunhoPorTipo(undefined)).toEqual({ recepcao: new Set(), peso: new Set(), doa: [] });
  });
});
