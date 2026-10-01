import { describe, expect, it } from "vitest";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";

describe("ensureLocalTime (Manaus, UTC-4)", () => {
  it("timestamp em UTC (Z / +00:00) vira -4h", () => {
    expect(ensureLocalTime("2026-09-19T14:44:21+00:00").time).toBe("10:44");
    expect(ensureLocalTime("2026-09-19T14:44:21.123456Z").time).toBe("10:44");
  });

  it("timestamp já com offset de Manaus (-04:00) mantém a hora local", () => {
    const r = ensureLocalTime("2026-09-19T10:44:21.123456-04:00");
    expect(r.time).toBe("10:44");
    expect(r.datePt).toBe("19/09/2026");
    expect(r.isoLocal).toBe("2026-09-19");
  });

  it("vira o dia corretamente perto da meia-noite", () => {
    expect(ensureLocalTime("2026-09-20T02:30:00+00:00").isoLocal).toBe("2026-09-19");
    expect(ensureLocalTime("2026-09-19T23:30:00-04:00").isoLocal).toBe("2026-09-19");
  });

  it("sem offset é tratado como UTC", () => {
    expect(ensureLocalTime("2026-09-19T14:44:21").time).toBe("10:44");
  });
});
