// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lerCsvOrdens } from "@/modules/bpf/importacao";

// Carga única do relatório manual "BPF diário" de 20/10/2026 (docs/legado). Protege o arquivo
// contra edições que quebrem a leitura pela tela de importação.
describe("CSV das OS já programadas (relatório manual de 20/10/2026)", () => {
  const { itens, erros } = lerCsvOrdens(readFileSync("docs/legado/bpf-os-programadas-2026-10-20.csv", "utf8"));

  it("lê as 54 OS sem erros", () => {
    expect(erros).toEqual([]);
    expect(itens).toHaveLength(54);
  });

  it("reprogramações viram a sequência de prazos (o último é o vigente)", () => {
    const solda = itens.find((i) => i.numero_os === "467367")!;
    expect(solda.prazos).toEqual(["2026-09-19", "2026-10-10", "2026-11-15"]);
    const popUp = itens.find((i) => i.numero_os === "467416")!;
    expect(popUp.prazos).toEqual(["2026-08-09", "2026-09-10", "2026-10-10", "2026-11-18"]);
  });

  it("os setores usados são os do relatório (ao importar, os que ainda não existem viram áreas)", () => {
    const setores = new Set(itens.map((i) => i.setor_area));
    expect(setores.has("Sangria")).toBe(true);
    expect(setores.has("Evisceração")).toBe(true);
    expect(setores.size).toBeLessThanOrEqual(22);
  });
});
