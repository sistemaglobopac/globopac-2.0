import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const is = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: () => ({ in: () => ({ is: () => ({ overrideTypes: () => is() }) }) }) }),
  },
}));

import { turnoAbertoParaRegistro, turnosBloqueadosMap, turnosPendentes } from "@/modules/fichas/utils/turnoUtils";

// Manaus = UTC-4. Hoje: a Leidiane abriu o turno às 08:59 (12:59Z) e ainda não fechou; a Diana fechou o de ontem.
const LEIDIANE = "leidiane";
const DIANA = "diana";
const turnoAbertoHoje = { user_id: LEIDIANE, setor: "BEM-ESTAR ANIMAL", inicio: "2026-10-06T12:59:46Z", fim: null };
const turnoEncerradoOntem = { user_id: DIANA, setor: "PRÉ-RESFRIAMENTO 02", inicio: "2026-10-05T11:12:00Z", fim: "2026-10-05T21:06:00Z" };

beforeEach(() => {
  rpc.mockReset();
  is.mockReset();
});

describe("turno aberto no painel de verificação (o verificador não lê turnos_inspetores)", () => {
  it("lê os turnos pela função do banco: monitoramento de hoje de quem ainda não fechou o turno fica bloqueado ('Turno em Aberto')", async () => {
    rpc.mockResolvedValue({ data: [turnoAbertoHoje, turnoEncerradoOntem], error: null });
    const bloqueados = await turnosBloqueadosMap([
      { id: "hoje", user_id: LEIDIANE, criado_em: "2026-10-06T16:40:00Z" }, // 12:40 Manaus
      { id: "ontem-diana", user_id: DIANA, criado_em: "2026-10-05T19:00:00Z" },
    ]);
    expect(rpc).toHaveBeenCalledWith("turnos_para_resolucao", expect.objectContaining({ p_desde: expect.any(String) }));
    expect([...bloqueados]).toEqual(["hoje"]); // o da Diana tem o turno encerrado: liberado ('Turno Finalizado')
  });

  it("monitoramento feito ANTES de o turno ser aberto no mesmo dia continua bloqueado", async () => {
    rpc.mockResolvedValue({ data: [turnoAbertoHoje], error: null });
    const b = await turnosBloqueadosMap([{ id: "cedo", user_id: LEIDIANE, criado_em: "2026-10-06T09:00:00Z" }]); // 05:00 Manaus
    expect(b.has("cedo")).toBe(true);
  });

  it("2º turno: monitoramento depois das 20h de Manaus (já no dia UTC seguinte) com o turno ainda aberto fica bloqueado", async () => {
    const segundoTurno = { user_id: DIANA, setor: "X", inicio: "2026-10-06T21:00:00Z", fim: null }; // 17:00 Manaus
    rpc.mockResolvedValue({ data: [segundoTurno], error: null });
    const b = await turnosBloqueadosMap([{ id: "noite", user_id: DIANA, criado_em: "2026-10-07T00:30:00Z" }]); // 20:30 Manaus
    expect(b.has("noite")).toBe(true);
  });

  it("turno aberto de OUTRO inspetor não bloqueia; turno aberto que começou depois do registro de dias atrás também não", async () => {
    rpc.mockResolvedValue({ data: [turnoAbertoHoje], error: null });
    const b = await turnosBloqueadosMap([
      { id: "outra", user_id: "kauan", criado_em: "2026-10-06T16:00:00Z" },
      { id: "antiga", user_id: LEIDIANE, criado_em: "2026-10-04T16:00:00Z" }, // 2 dias antes de o turno de hoje abrir
    ]);
    expect(b.size).toBe(0);
  });

  it("turnosPendentes (antes da assinatura em lote) aponta quem ainda não fechou o turno", async () => {
    rpc.mockResolvedValue({ data: [turnoAbertoHoje], error: null });
    expect(await turnosPendentes([{ user_id: LEIDIANE, criado_em: "2026-10-06T16:40:00Z" }, { user_id: DIANA, criado_em: "2026-10-05T19:00:00Z" }])).toEqual([LEIDIANE]);
  });

  it("sem a função no banco, lê a tabela direto (ADMIN_MASTER e dono leem)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    is.mockResolvedValue({ data: [{ user_id: LEIDIANE, inicio: turnoAbertoHoje.inicio }], error: null });
    const b = await turnosBloqueadosMap([{ id: "hoje", user_id: LEIDIANE, criado_em: "2026-10-06T16:40:00Z" }]);
    expect(b.has("hoje")).toBe(true);
  });

  it("falha total na consulta libera (nunca trava o fluxo), como antes", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    is.mockResolvedValue({ data: null, error: { message: "y" } });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const b = await turnosBloqueadosMap([{ id: "hoje", user_id: LEIDIANE, criado_em: "2026-10-06T16:40:00Z" }]);
    expect(b.size).toBe(0);
    aviso.mockRestore();
  });

  it("turnoAbertoParaRegistro: função pura", () => {
    expect(turnoAbertoParaRegistro("2026-10-06T16:40:00Z", LEIDIANE, [turnoAbertoHoje])).toBe(true);
    expect(turnoAbertoParaRegistro("2026-10-06T16:40:00Z", DIANA, [turnoAbertoHoje])).toBe(false);
    expect(turnoAbertoParaRegistro("2026-10-06T16:40:00Z", LEIDIANE, [])).toBe(false);
  });
});
