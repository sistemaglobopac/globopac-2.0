import { describe, expect, it } from "vitest";
import { gtasRepetidasNoLote, mensagemGtaJaCadastrada, normalizarGta } from "@/modules/recepcao/api";

describe("GTA não se repete na mesma data de abate", () => {
  it("normaliza maiúsculas, espaços e pontuação; zeros à esquerda continuam valendo", () => {
    expect(normalizarGta("  gta-001 ")).toBe("GTA001");
    expect(normalizarGta("GTA 001")).toBe("GTA001");
    expect(normalizarGta("gta001")).toBe("GTA001");
    expect(normalizarGta("GTA-0001")).not.toBe(normalizarGta("GTA-001"));
    expect(normalizarGta("---")).toBe("");
  });

  it("no mesmo lote: repetida na mesma data é apontada; a mesma GTA em outra data é permitida", () => {
    const c = (gta: string, data_abate: string) => ({ gta, data_abate });
    expect(gtasRepetidasNoLote([c("GTA-1", "2026-10-06"), c("gta 1", "2026-10-06"), c("GTA-2", "2026-10-06")])).toEqual(["gta 1"]);
    expect(gtasRepetidasNoLote([c("GTA-1", "2026-10-06"), c("GTA-1", "2026-10-07")])).toEqual([]);
    expect(gtasRepetidasNoLote([])).toEqual([]);
  });

  it("a mensagem diz onde a GTA já está cadastrada", () => {
    const m = mensagemGtaJaCadastrada(" GTA-1 ", { data_abate: "2026-10-06", integrado: "Integrado A", aviario: "3" });
    expect(m).toContain("GTA-1");
    expect(m).toContain("06/10/2026");
    expect(m).toContain("Integrado A");
    expect(m).toContain("mesma data");
    expect(mensagemGtaJaCadastrada("X1", null)).toContain("esta data de abate");
  });
});
