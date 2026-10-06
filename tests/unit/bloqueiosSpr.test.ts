import { describe, expect, it } from "vitest";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import { turnoAlvoHeranca, turnoParaHeranca } from "@/modules/fichas/utils/turnoUtils";
import type { CampoTemplate } from "@/shared/schema-campos";

const campos = [
  { chave: "carcacas", tipo: "chiller_carcacas" },
  { chave: "partes", tipo: "chiller_partes" },
  { chave: "miudos", tipo: "mini_chillers" },
  { chave: "chuveiro", tipo: "lavagem_final" },
] as unknown as CampoTemplate[];

// Widgets 100% preenchidos (1º monitoramento do dia: só leitura atual): isolam as flags de bloqueio
// dos motivos de campo em branco (ver preenchimentoSpr.test.ts).
const t = (cur: string) => ({ prev: "", cur, ice: "" });
const completos = {
  carcacas: { cargas: [], tanques: { preChiller: t("1"), chiller1: t("1"), chiller2: t("1") }, condenasParcial: "", condenasTotal: "" },
  partes: { tanques: { chiller1: t("1"), chiller2: t("1") }, pesoCarcacaIndisponivel: false },
  miudos: { tanques: { coracao: t("1"), moela: t("1"), figado: t("1"), cabeca: t("1"), pes: t("1") }, avesIndisponivel: false, pesoMiudoIndisponivel: false },
  chuveiro: { chuveiro: { prev: "", cur: "1" }, condenacoesParciais: "", avesIndisponivel: false },
};
const com = (parcial: Record<string, Record<string, unknown>>) => ({
  ...completos,
  ...Object.fromEntries(Object.entries(parcial).map(([k, v]) => [k, { ...(completos as Record<string, object>)[k], ...v }])),
});

describe("bloqueio de assinatura pelas flags dos widgets", () => {
  it("sem flags, não bloqueia", () => {
    expect(motivosDeBloqueioSpr(campos, completos)).toEqual([]);
  });

  it("Partes bloqueia por peso de carcaça ausente", () => {
    expect(motivosDeBloqueioSpr(campos, com({ partes: { pesoCarcacaIndisponivel: true } }))).toHaveLength(1);
  });

  it("Miúdos tem 2 alertas independentes (aves e peso)", () => {
    expect(motivosDeBloqueioSpr(campos, com({ miudos: { avesIndisponivel: true } }))).toHaveLength(1);
    expect(motivosDeBloqueioSpr(campos, com({ miudos: { avesIndisponivel: true, pesoMiudoIndisponivel: true } }))).toHaveLength(2);
  });

  it("Chuveiro bloqueia por total de aves (bruto) ausente", () => {
    expect(motivosDeBloqueioSpr(campos, com({ chuveiro: { avesIndisponivel: true } }))).toHaveLength(1);
  });

  it("widgets SPR em branco bloqueiam", () => {
    expect(motivosDeBloqueioSpr(campos, {}).length).toBeGreaterThanOrEqual(4);
  });
});

describe("turno para herdar a leitura anterior", () => {
  // America/Manaus = UTC−4. 04h–17h (Manaus) = 1º Turno; caso contrário 2º Turno.
  const manaus = (hora: number, minuto = 0) => new Date(Date.UTC(2026, 8, 29, hora + 4, minuto));

  it("deduz o turno pelo horário de Manaus", () => {
    expect(turnoParaHeranca(manaus(3, 59))).toBe("2º Turno");
    expect(turnoParaHeranca(manaus(4))).toBe("1º Turno");
    expect(turnoParaHeranca(manaus(5))).toBe("1º Turno");
    expect(turnoParaHeranca(manaus(16, 59))).toBe("1º Turno");
    expect(turnoParaHeranca(manaus(17))).toBe("2º Turno");
    expect(turnoParaHeranca(manaus(23))).toBe("2º Turno");
    expect(turnoParaHeranca(manaus(2))).toBe("2º Turno");
    expect(turnoParaHeranca(manaus(4, 59))).toBe("1º Turno");
  });

  it("turno fixo do usuário vale; 'Ambos' deduz pelo horário", () => {
    expect(turnoAlvoHeranca("Turno 1", manaus(20))).toBe("1º Turno");
    expect(turnoAlvoHeranca("Turno 2", manaus(9))).toBe("2º Turno");
    expect(turnoAlvoHeranca("Ambos", manaus(9))).toBe("1º Turno");
    expect(turnoAlvoHeranca(undefined, manaus(20))).toBe("2º Turno");
  });
});
