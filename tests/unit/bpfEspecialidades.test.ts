import { describe, expect, it } from "vitest";
import {
  agruparPorEspecialidade,
  contarPorEspecialidade,
  FILTRO_SEM_CLASSIFICACAO,
  FILTRO_TODAS,
  filtrarPorEspecialidade,
  rotuloEspecialidade,
  SEM_ESPECIALIDADE,
} from "@/modules/bpf/especialidades";

const item = (id: string, especialidade: string | null) => ({ id, especialidade });
const lista = [
  item("a", "Pintura"),
  item("b", null),
  item("c", "Elétrica"),
  item("d", "Elétrica"),
  item("e", "  "),
  item("f", "Ar condicionado"),
];

describe("filtrarPorEspecialidade", () => {
  it("sem filtro devolve tudo", () => {
    expect(filtrarPorEspecialidade(lista, FILTRO_TODAS)).toHaveLength(6);
  });
  it("filtra por uma especialidade", () => {
    expect(filtrarPorEspecialidade(lista, "Elétrica").map((i) => i.id)).toEqual(["c", "d"]);
  });
  it("'sem classificação' pega nulos e textos em branco", () => {
    expect(filtrarPorEspecialidade(lista, FILTRO_SEM_CLASSIFICACAO).map((i) => i.id)).toEqual(["b", "e"]);
  });
});

describe("agruparPorEspecialidade", () => {
  it("segue a ordem da lista de especialidades, as não previstas depois e 'sem classificação' por último", () => {
    expect(agruparPorEspecialidade(lista).map((g) => g.rotulo)).toEqual(["Elétrica", "Pintura", "Ar condicionado", SEM_ESPECIALIDADE]);
  });
  it("mantém a ordem original dentro de cada grupo", () => {
    expect(agruparPorEspecialidade(lista)[0].itens.map((i) => i.id)).toEqual(["c", "d"]);
  });
  it("lista vazia não gera grupos", () => {
    expect(agruparPorEspecialidade([])).toEqual([]);
  });
});

describe("contagem e rótulo", () => {
  it("conta por especialidade e agrupa o que não foi classificado", () => {
    const c = contarPorEspecialidade(lista);
    expect(c.get("Elétrica")).toBe(2);
    expect(c.get(FILTRO_SEM_CLASSIFICACAO)).toBe(2);
  });
  it("rotula o nulo como sem classificação", () => {
    expect(rotuloEspecialidade(null)).toBe(SEM_ESPECIALIDADE);
    expect(rotuloEspecialidade("Pintura")).toBe("Pintura");
  });
});
