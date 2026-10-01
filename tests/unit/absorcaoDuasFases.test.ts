import { describe, expect, it } from "vitest";
import {
  calcularAbsorcaoAgua,
  linhaAbsorcaoValida,
  minutosAguardandoPesoFinal,
  validarFaseInicial,
  validarFinalizacao,
} from "@/modules/fichas/fields/calculosAbsorcao";
import type { AmostraAbsorcaoAgua } from "@/modules/fichas/fields/tiposCompostos";

const linha = (id: number, seal: string, initial: string, final = "", extra: Partial<AmostraAbsorcaoAgua> = {}): AmostraAbsorcaoAgua => ({
  id,
  seal,
  initial,
  final,
  ...extra,
});
const vazias = (de: number) => Array.from({ length: 10 - de }, (_, i) => linha(de + i, "", ""));

describe("fase 1 — pesagem inicial (Salvar e finalizar depois)", () => {
  it("exige ao menos 1 carcaça com lacre e peso inicial > 0", () => {
    expect(validarFaseInicial(vazias(0))).toHaveLength(1);
    expect(validarFaseInicial([linha(0, "A1", "0"), ...vazias(1)])).not.toEqual([]);
    expect(validarFaseInicial([linha(0, "A1", "2.5"), ...vazias(1)])).toEqual([]);
  });

  it("recusa peso final preenchido, peso sem lacre e lacres repetidos", () => {
    expect(validarFaseInicial([linha(0, "A1", "2.5", "2.6"), ...vazias(1)]).join(" ")).toContain("peso final em branco");
    expect(validarFaseInicial([linha(0, "", "2.5"), linha(1, "B2", "2.4"), ...vazias(2)]).join(" ")).toContain("precisa do lacre");
    expect(validarFaseInicial([linha(0, "A1", "2.5"), linha(1, "a1", "2.4"), ...vazias(2)]).join(" ")).toContain("repetidos");
  });
});

describe("fase 2 — finalização", () => {
  it("exige peso final em toda linha com peso inicial", () => {
    const motivos = validarFinalizacao([linha(0, "A1", "2.5", "2.6"), linha(1, "B2", "2.4"), ...vazias(2)]);
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("B2");
  });

  it("linha descartada sai do cálculo, mas exige motivo", () => {
    const itens = [linha(0, "A1", "2.5", "2.6"), linha(1, "B2", "2.4", "", { descartada: true }), ...vazias(2)];
    expect(validarFinalizacao(itens).join(" ")).toContain("motivo do descarte");
    itens[1] = { ...itens[1]!, motivoDescarte: "Caiu no chão" };
    expect(validarFinalizacao(itens)).toEqual([]);
    expect(linhaAbsorcaoValida(itens[1]!)).toBe(false);
  });

  it("a média por soma ignora a descartada e compara com 8%", () => {
    const itens = [
      linha(0, "A1", "10", "10.9"), // +0,9
      linha(1, "B2", "10", "12", { descartada: true }), // fora do cálculo
      ...vazias(2),
    ];
    const r = calcularAbsorcaoAgua(itens);
    expect(r.validCount).toBe(1);
    expect(r.averagePercentage).toBeCloseTo(9, 6);
    expect(r.status).toBe("nao-conforme");
    expect(calcularAbsorcaoAgua([linha(0, "A1", "10", "10.8"), ...vazias(1)]).status).toBe("conforme"); // exatamente 8% = conforme
  });

  it("sem nenhuma carcaça válida não finaliza", () => {
    expect(validarFinalizacao([linha(0, "A1", "2.5", "", { descartada: true, motivoDescarte: "x" }), ...vazias(1)])).toContain(
      "Nenhuma carcaça válida para calcular a média de absorção."
    );
  });
});

describe("tempo aguardando peso final", () => {
  it("conta minutos desde a pesagem inicial do servidor", () => {
    const inicio = "2026-09-30T10:00:00-04:00";
    expect(minutosAguardandoPesoFinal(inicio, new Date("2026-09-30T10:45:30-04:00"))).toBe(45);
    expect(minutosAguardandoPesoFinal(inicio, new Date("2026-09-30T09:00:00-04:00"))).toBe(0);
  });
});
