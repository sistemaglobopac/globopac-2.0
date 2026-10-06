import { describe, expect, it } from "vitest";
import { cargasEmRascunhos } from "@/modules/fichas/utils/rascunhosAnterior";
import type { Rascunho } from "@/lib/rascunhos";

const rascunho = (codigo: string, setor: string, dados: Record<string, unknown>) => ({ codigo, setor, dadosDinamicos: dados }) as unknown as Rascunho;

describe("cargasEmRascunhos", () => {
  const carcacas = { cargas: [{ id: "1", cargaId: "c-1", quantity: "5000", avgLiveWeight: "2.7" }, { id: "2", quantity: "10", avgLiveWeight: "2.5" }] };

  it("coleta as cargas herdadas dos lotes do SPR Carcaças de rascunhos da mesma ficha+setor", () => {
    const ids = cargasEmRascunhos([rascunho("F1", "PRE", { campo_x: carcacas })], "F1", "PRE");
    expect([...ids]).toEqual(["c-1"]);
  });

  it("ignora rascunhos de outra ficha ou setor e valores que não são widget de cargas", () => {
    const rs = [rascunho("F2", "PRE", { campo_x: carcacas }), rascunho("F1", "OUTRO", { campo_x: carcacas }), rascunho("F1", "PRE", { a: "texto", b: null, c: 3 })];
    expect(cargasEmRascunhos(rs, "F1", "PRE").size).toBe(0);
    expect(cargasEmRascunhos(undefined, "F1", "PRE").size).toBe(0);
  });
});
