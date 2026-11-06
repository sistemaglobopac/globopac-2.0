import { describe, expect, it } from "vitest";
import { inicioDoTurnoManaus } from "@/modules/bordo/api";

// Manaus é UTC-4: 04h local = 08:00Z e 17h local = 21:00Z.
describe("inicioDoTurnoManaus", () => {
  it("1º turno começa às 04h do próprio dia", () => {
    expect(inicioDoTurnoManaus(new Date("2026-11-06T08:00:00Z")).toISOString()).toBe("2026-11-06T08:00:00.000Z");
    expect(inicioDoTurnoManaus(new Date("2026-11-06T20:59:00Z")).toISOString()).toBe("2026-11-06T08:00:00.000Z");
  });

  it("2º turno antes da meia-noite começa às 17h do mesmo dia", () => {
    expect(inicioDoTurnoManaus(new Date("2026-11-06T21:00:00Z")).toISOString()).toBe("2026-11-06T21:00:00.000Z");
    expect(inicioDoTurnoManaus(new Date("2026-11-07T03:30:00Z")).toISOString()).toBe("2026-11-06T21:00:00.000Z");
  });

  it("2º turno depois da meia-noite continua contando desde as 17h do dia anterior", () => {
    // 01h30 em Manaus de 07/11 = 05:30Z: o turno é o que começou às 17h de 06/11.
    expect(inicioDoTurnoManaus(new Date("2026-11-07T05:30:00Z")).toISOString()).toBe("2026-11-06T21:00:00.000Z");
    expect(inicioDoTurnoManaus(new Date("2026-11-07T07:59:00Z")).toISOString()).toBe("2026-11-06T21:00:00.000Z");
  });
});
