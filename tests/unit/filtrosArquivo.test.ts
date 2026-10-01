import { describe, expect, it } from "vitest";
import { FILTROS_ARQUIVO_INICIAIS, FILTROS_ARQUIVO_VAZIOS, filtrarArquivo, filtrosAtivos, type ItemArquivo } from "@/modules/sif/filtrosArquivo";

const ctx = {
  pacsDoTemplate: (id: string) => (id.startsWith("t1") ? ["PAC 14"] : id === "t2" ? ["PAC 07", "PAC 08"] : []),
  tipoDaFicha: (id: string) => (id === "t1" || id === "t1v2" ? "RAC-001/014" : "RAC-002"),
};

// 2026-10-01 11:00 Manaus = 15:00Z (1º turno); 2026-10-01 20:00 Manaus = 2026-10-02T00:00Z (2º turno)
const item = (id: string, parcial: Partial<ItemArquivo> = {}): ItemArquivo => ({
  id,
  setor: "BEM-ESTAR ANIMAL",
  conformidade: true,
  situacao_conformidade: null,
  liberado_sif: false,
  criado_em: "2026-10-01T15:00:00Z",
  ficha_template_id: "t1",
  user_id: "u1",
  ...parcial,
});

const itens = [
  item("a"),
  item("b", { criado_em: "2026-10-02T00:00:00Z", liberado_sif: true, user_id: "u2" }),
  item("c", { criado_em: "2026-09-28T15:00:00Z", setor: "RECEPCAO", ficha_template_id: "t2", conformidade: false }),
  item("d", { ficha_template_id: "t1v2", situacao_conformidade: "TRATADO", conformidade: false }),
];

const ids = (f: Partial<typeof FILTROS_ARQUIVO_VAZIOS>) => filtrarArquivo(itens, { ...FILTROS_ARQUIVO_VAZIOS, ...f }, ctx).map((m) => m.id);

describe("filtros do Painel de Arquivo", () => {
  it("sem filtros devolve tudo", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
  });

  it("filtra por período usando o dia local de Manaus (inclusive nas pontas)", () => {
    expect(ids({ de: "2026-10-01", ate: "2026-10-01" })).toEqual(["a", "b", "d"]);
    expect(ids({ de: "2026-09-28", ate: "2026-09-28" })).toEqual(["c"]);
    expect(ids({ de: "2026-10-02" })).toEqual([]);
    expect(ids({ ate: "2026-09-30" })).toEqual(["c"]);
  });

  it("filtra por PAC (um template pode ter vários)", () => {
    expect(ids({ pac: "PAC 14" })).toEqual(["a", "b", "d"]);
    expect(ids({ pac: "PAC 08" })).toEqual(["c"]);
  });

  it("filtra por setor, turno, ficha (sem versão) e inspetor", () => {
    expect(ids({ setor: "RECEPCAO" })).toEqual(["c"]);
    expect(ids({ turno: "2º Turno" })).toEqual(["b"]);
    expect(ids({ ficha: "RAC-001/014" })).toEqual(["a", "b", "d"]);
    expect(ids({ inspetor: "u2" })).toEqual(["b"]);
  });

  it("filtra por situação (tratado vem da coluna situacao_conformidade)", () => {
    expect(ids({ situacao: "CONFORME" })).toEqual(["a", "b"]);
    expect(ids({ situacao: "NAO_CONFORME" })).toEqual(["c"]);
    expect(ids({ situacao: "TRATADO" })).toEqual(["d"]);
  });

  it("filtra por liberação ao SIF", () => {
    expect(ids({ liberacao: "pendentes" })).toEqual(["a", "c", "d"]);
    expect(ids({ liberacao: "liberadas" })).toEqual(["b"]);
  });

  it("combina filtros (E)", () => {
    expect(ids({ pac: "PAC 14", liberacao: "pendentes", situacao: "TRATADO" })).toEqual(["d"]);
  });

  it("conta filtros ativos", () => {
    expect(filtrosAtivos(FILTROS_ARQUIVO_INICIAIS)).toBe(0);
    expect(FILTROS_ARQUIVO_INICIAIS.liberacao).toBe("pendentes");
    expect(filtrosAtivos({ ...FILTROS_ARQUIVO_INICIAIS, pac: "PAC 14", liberacao: "todas" })).toBe(2);
  });
});
