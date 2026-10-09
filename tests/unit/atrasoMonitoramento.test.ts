import { describe, expect, it } from "vitest";
import {
  calcularFichasAtrasadas,
  paradasVigentes,
  proximaCobrancaAposParada,
  referenciaDoProcessoParado,
  TOLERANCIA_ATRASO_MIN,
  urlNovaFicha,
  type FichaAtivaResumo,
} from "@/modules/bordo/api";

const ficha = (id: string, tipo: FichaAtivaResumo["tipo_apontamento"] = "Recorrente", cada: number | null = 60): FichaAtivaResumo => ({
  id,
  codigo: id.toUpperCase(),
  nome: `Ficha ${id}`,
  tipo_apontamento: tipo,
  tempo_entre_apontamentos_min: cada,
  locais_aplicacao: ["RECEPCAO"],
});

describe("atraso de monitoramento: alerta só 10 minutos depois da hora devida", () => {
  const ultimo = [{ ficha_template_id: "a", criado_em: "2026-09-30T11:00:00Z" }]; // devido às 12:00Z (60 min depois)

  it("a tolerância é de 10 minutos", () => {
    expect(TOLERANCIA_ATRASO_MIN).toBe(10);
  });

  it("até 10 min depois da hora devida ainda não está atrasado; passando disso, sim", () => {
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T12:10:00Z"))).toHaveLength(0); // +10 exatos
    const atrasadas = calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T12:11:00Z"));
    expect(atrasadas).toHaveLength(1);
    expect(atrasadas[0]!.atrasoMin).toBe(11);
    expect(atrasadas[0]!.motivo).toBe("Monitoramento atrasado há 11 min");
    expect(atrasadas[0]!.devidoEm).toBe("2026-09-30T12:00:00.000Z");
  });

  it("ficha de demanda nunca atrasa", () => {
    expect(calcularFichasAtrasadas([ficha("a", "Demanda")], ultimo, new Date("2026-09-30T20:00:00Z"))).toHaveLength(0);
  });

  it("sem nenhum monitoramento realizado não há aviso de atraso (só a partir do primeiro)", () => {
    expect(calcularFichasAtrasadas([ficha("b")], [], new Date("2026-09-30T12:01:00Z"))).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("b")], [], new Date("2026-09-30T23:59:00Z"))).toHaveLength(0);
  });

  it("intervalo 0 (ou ausente) nunca gera aviso de atraso", () => {
    expect(calcularFichasAtrasadas([ficha("a", "Recorrente", 0)], ultimo, new Date("2026-09-30T23:59:00Z"))).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("a", "Recorrente", null)], ultimo, new Date("2026-09-30T23:59:00Z"))).toHaveLength(0);
  });

  it("ficha encerrada no dia (Encerrar abate) não atrasa; as demais continuam", () => {
    const depois = new Date("2026-09-30T23:59:00Z");
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, depois, new Set(["A"]))).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, depois, new Set(["OUTRA"]))).toHaveLength(1);
  });

  it("urlNovaFicha abre a ficha no setor do inspetor", () => {
    expect(urlNovaFicha(ficha("a"), ["EXPEDICAO", "RECEPCAO"])).toBe("/fichas/nova?ficha=a&setor=RECEPCAO");
  });
});

describe("processo parado: justificar dispensa o período em atraso e a cobrança volta no seguinte", () => {
  const ultimo = [{ ficha_template_id: "a", criado_em: "2026-09-30T11:00:00Z" }]; // devido 12:00Z, alarme 12:10Z
  const devido = new Date("2026-09-30T12:00:00Z");

  it("a referência é o último horário devido que já passou", () => {
    expect(referenciaDoProcessoParado(devido, 60, new Date("2026-09-30T12:12:00Z")).toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(referenciaDoProcessoParado(devido, 60, new Date("2026-09-30T13:30:00Z")).toISOString()).toBe("2026-09-30T13:00:00.000Z");
    expect(proximaCobrancaAposParada("2026-09-30T12:00:00.000Z", 60).toISOString()).toBe("2026-09-30T13:00:00.000Z");
  });

  it("depois de justificada a ficha deixa de atrasar até o próximo período (+ tolerância)", () => {
    const paradas = [{ ficha_codigo: "A", referencia_em: "2026-09-30T12:00:00.000Z" }];
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T12:12:00Z"))).toHaveLength(1);
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T12:12:00Z"), new Set(), paradas)).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T13:10:00Z"), new Set(), paradas)).toHaveLength(0);
    const volta = calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T13:11:00Z"), new Set(), paradas);
    expect(volta).toHaveLength(1);
    expect(volta[0]!.devidoEm).toBe("2026-09-30T13:00:00.000Z");
  });

  it("a justificativa vale só para a ficha dela", () => {
    const paradas = [{ ficha_codigo: "OUTRA", referencia_em: "2026-09-30T12:00:00.000Z" }];
    expect(calcularFichasAtrasadas([ficha("a")], ultimo, new Date("2026-09-30T12:30:00Z"), new Set(), paradas)).toHaveLength(1);
  });

  it("um monitoramento feito depois da justificativa volta a mandar na contagem", () => {
    const paradas = [{ ficha_codigo: "A", referencia_em: "2026-09-30T12:00:00.000Z" }];
    const feitoDepois = [...ultimo, { ficha_template_id: "a", criado_em: "2026-09-30T12:20:00Z" }]; // devido 13:20Z
    expect(calcularFichasAtrasadas([ficha("a")], feitoDepois, new Date("2026-09-30T13:25:00Z"), new Set(), paradas)).toHaveLength(0);
    expect(calcularFichasAtrasadas([ficha("a")], feitoDepois, new Date("2026-09-30T13:31:00Z"), new Set(), paradas)).toHaveLength(1);
  });

  it("lista as paradas vigentes até a hora em que a cobrança volta", () => {
    const paradas = [{ ficha_codigo: "A", referencia_em: "2026-09-30T12:00:00.000Z", motivo: "Quebra" }];
    const vigentes = paradasVigentes([ficha("a")], paradas, new Date("2026-09-30T12:30:00Z"));
    expect(vigentes).toHaveLength(1);
    expect(vigentes[0]!.voltaEm.toISOString()).toBe("2026-09-30T13:00:00.000Z");
    expect(paradasVigentes([ficha("a")], paradas, new Date("2026-09-30T13:00:00Z"))).toHaveLength(0);
  });
});
