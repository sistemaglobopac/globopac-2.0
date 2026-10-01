import { describe, expect, it } from "vitest";
import { calcularFichasAtrasadas, TOLERANCIA_ATRASO_MIN, urlNovaFicha, type FichaAtivaResumo } from "@/modules/bordo/api";

const ficha = (id: string, tipo: FichaAtivaResumo["tipo_apontamento"] = "Recorrente", cada: number | null = 60): FichaAtivaResumo => ({
  id,
  codigo: id.toUpperCase(),
  nome: `Ficha ${id}`,
  tipo_apontamento: tipo,
  tempo_entre_apontamentos_min: cada,
  locais_aplicacao: ["RECEPCAO"],
});

describe("atraso de monitoramento: alerta só 10 minutos depois da hora devida", () => {
  const turnoInicio = new Date("2026-09-30T10:00:00Z");
  const ultimo = [{ ficha_template_id: "a", criado_em: "2026-09-30T11:00:00Z" }]; // devido às 12:00Z (60 min depois)

  it("a tolerância é de 10 minutos", () => {
    expect(TOLERANCIA_ATRASO_MIN).toBe(10);
  });

  it("até 10 min depois da hora devida ainda não está atrasado; passando disso, sim", () => {
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, turnoInicio, new Date("2026-09-30T12:10:00Z"))).toHaveLength(0); // +10 exatos
    const atrasadas = calcularFichasAtrasadas([ficha("a")], ultimo, turnoInicio, new Date("2026-09-30T12:11:00Z"));
    expect(atrasadas).toHaveLength(1);
    expect(atrasadas[0]!.atrasoMin).toBe(11);
    expect(atrasadas[0]!.motivo).toBe("Monitoramento atrasado há 11 min");
    expect(atrasadas[0]!.devidoEm).toBe("2026-09-30T12:00:00.000Z");
  });

  it("ficha de demanda nunca atrasa; sem apontamento usa a regra das 2h do turno", () => {
    expect(calcularFichasAtrasadas([ficha("a", "Demanda")], ultimo, turnoInicio, new Date("2026-09-30T20:00:00Z"))).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("b")], [], turnoInicio, new Date("2026-09-30T11:59:00Z"))).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("b")], [], turnoInicio, new Date("2026-09-30T12:01:00Z"))).toHaveLength(1);
  });

  it("urlNovaFicha abre a ficha no setor do inspetor", () => {
    expect(urlNovaFicha(ficha("a"), ["EXPEDICAO", "RECEPCAO"])).toBe("/fichas/nova?ficha=a&setor=RECEPCAO");
  });
});
