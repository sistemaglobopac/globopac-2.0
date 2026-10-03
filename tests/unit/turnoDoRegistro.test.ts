import { describe, expect, it } from "vitest";
import { turnoDoRegistro } from "@/modules/fichas/utils/turnoUtils";

// Manaus = UTC-4: 05:43 local = 09:43Z; 17:02 local = 21:02Z.
const KAUAN = "kauan";
const ADMIN = "admin";
const turnoAberto = { user_id: KAUAN, setor: "BEM-ESTAR ANIMAL", inicio: "2026-10-03T09:43:00Z", fim: null };

describe("turnoDoRegistro", () => {
  it("sem turno cobrindo o registro, vale o relógio", () => {
    expect(turnoDoRegistro({ user_id: ADMIN, setor: "X", criado_em: "2026-10-03T21:02:00Z" }, [])).toBe("2º Turno");
    expect(turnoDoRegistro({ user_id: ADMIN, setor: "X", criado_em: "2026-10-03T19:00:00Z" }, [])).toBe("1º Turno");
  });

  it("quem continua o turno aberto do colega no mesmo setor fica no turno em que ele começou, mesmo após as 17h", () => {
    const admin = { user_id: ADMIN, setor: "BEM-ESTAR ANIMAL", criado_em: "2026-10-03T21:02:00Z" }; // 17:02 Manaus
    expect(turnoDoRegistro(admin, [turnoAberto])).toBe("1º Turno");
  });

  it("turno de outro setor não puxa o registro", () => {
    const admin = { user_id: ADMIN, setor: "APPCC 01", criado_em: "2026-10-03T21:02:00Z" };
    expect(turnoDoRegistro(admin, [turnoAberto])).toBe("2º Turno");
  });

  it("turno já encerrado antes do registro não cobre", () => {
    const encerrado = { ...turnoAberto, fim: "2026-10-03T20:00:00Z" };
    expect(turnoDoRegistro({ user_id: ADMIN, setor: "BEM-ESTAR ANIMAL", criado_em: "2026-10-03T21:02:00Z" }, [encerrado])).toBe("2º Turno");
  });

  it("o turno do próprio usuário tem prioridade sobre o do colega", () => {
    const proprio = { user_id: ADMIN, setor: "BEM-ESTAR ANIMAL", inicio: "2026-10-03T21:00:00Z", fim: null }; // 17:00 = 2º
    expect(turnoDoRegistro({ user_id: ADMIN, setor: "BEM-ESTAR ANIMAL", criado_em: "2026-10-03T21:30:00Z" }, [turnoAberto, proprio])).toBe("2º Turno");
  });
});
