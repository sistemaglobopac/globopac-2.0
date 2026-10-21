import { describe, expect, it } from "vitest";
import { horaMaisRecente, msAteMinutoLivre } from "../e2e/minuto";

describe("msAteMinutoLivre", () => {
  const hora = "2026-10-21T10:36:00.000Z";

  it("no mesmo minuto do último monitoramento espera o minuto virar (mais a margem)", () => {
    const agora = new Date("2026-10-21T10:36:20.000Z").getTime();
    expect(msAteMinutoLivre(hora, agora, 0)).toBe(40_000);
    expect(msAteMinutoLivre(hora, agora)).toBe(41_500);
  });

  it("o minuto seguinte já está livre", () => {
    expect(msAteMinutoLivre(hora, new Date("2026-10-21T10:37:00.000Z").getTime())).toBe(0);
    expect(msAteMinutoLivre(hora, new Date("2026-10-21T10:45:30.000Z").getTime())).toBe(0);
  });

  it("sem monitoramento anterior (ou hora inválida) não espera", () => {
    expect(msAteMinutoLivre(null, Date.now())).toBe(0);
    expect(msAteMinutoLivre("lixo", Date.now())).toBe(0);
  });

  it("não depende dos segundos da hora do monitoramento", () => {
    const agora = new Date("2026-10-21T10:36:50.000Z").getTime();
    expect(msAteMinutoLivre("2026-10-21T10:36:45.000Z", agora, 0)).toBe(10_000);
  });
});

describe("horaMaisRecente", () => {
  it("devolve a maior hora válida", () => {
    expect(horaMaisRecente(["2026-10-21T10:00:00Z", null, "lixo", "2026-10-21T11:00:00Z", undefined])).toBe("2026-10-21T11:00:00.000Z");
  });
  it("sem horas válidas devolve null", () => {
    expect(horaMaisRecente([null, undefined, "lixo"])).toBeNull();
  });
});
