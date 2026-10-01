import { describe, expect, it } from "vitest";
import {
  consolidarPragasMes,
  diasNoMes,
  MEDIDAS_CORRETIVAS,
  montarValorPragas,
  motivosBloqueioPragas,
  pragasVazias,
  PRAGAS,
  type RegistroPragaDia,
} from "@/modules/fichas/fields/pragas";

describe("montarValorPragas / bloqueio de assinatura", () => {
  it("nada marcado = ausência de pragas, sem ações corretivas e assinável", () => {
    const valor = montarValorPragas(pragasVazias(), "", false);
    expect(valor.houvePraga).toBe(false);
    expect(valor.medidasCorretivas).toBeNull();
    expect(motivosBloqueioPragas(valor)).toEqual([]);
  });

  it("com praga e sem ações corretivas bloqueia; marcando as ações libera e congela o texto", () => {
    const pragas = { ...pragasVazias(), moscas: true };
    expect(motivosBloqueioPragas(montarValorPragas(pragas, "", false))).toHaveLength(1);
    const ok = montarValorPragas(pragas, "", true);
    expect(motivosBloqueioPragas(ok)).toEqual([]);
    expect(ok.medidasCorretivas).toBe(MEDIDAS_CORRETIVAS);
  });

  it('"Outras Pragas" exige citar a praga', () => {
    const pragas = { ...pragasVazias(), outras: true };
    const motivos = motivosBloqueioPragas(montarValorPragas(pragas, "  ", true));
    expect(motivos.some((m) => m.includes("cite qual"))).toBe(true);
    expect(motivosBloqueioPragas(montarValorPragas(pragas, "Lagarta-rosca", true))).toEqual([]);
  });

  it("ações corretivas marcadas sem praga não são gravadas", () => {
    const valor = montarValorPragas(pragasVazias(), "", true);
    expect(valor.acoesCorretivas).toBe(false);
    expect(valor.medidasCorretivas).toBeNull();
  });

  it("tem as 16 pragas pedidas", () => {
    expect(PRAGAS).toHaveLength(16);
  });
});

describe("consolidarPragasMes", () => {
  const ausente = montarValorPragas(pragasVazias(), "", false);
  const comMoscas = montarValorPragas({ ...pragasVazias(), moscas: true }, "", true);
  const comOutra = montarValorPragas({ ...pragasVazias(), outras: true }, "Lagarta-rosca", true);

  it("diasNoMes considera fevereiro bissexto", () => {
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2028, 2)).toBe(29);
    expect(diasNoMes(2026, 9)).toBe(30);
  });

  it("sem nenhuma praga: todos os registrados ausentes, sem medidas corretivas, dias sem registro listados", () => {
    const registros: RegistroPragaDia[] = [
      { dia: "2026-09-01", setor: "A", valor: ausente },
      { dia: "2026-09-02", setor: "A", valor: ausente },
    ];
    const c = consolidarPragasMes(registros, 2026, 9);
    expect(c.houvePragaNoMes).toBe(false);
    expect(c.statusPorDia[1]).toBe("ausente");
    expect(c.statusPorDia[3]).toBe("sem-registro");
    expect(c.diasSemRegistro).toHaveLength(28);
  });

  it("presença em qualquer setor marca o dia como presente e gera a ocorrência", () => {
    const registros: RegistroPragaDia[] = [
      { dia: "2026-09-05", setor: "RECEPCAO", valor: ausente },
      { dia: "2026-09-05", setor: "EXPEDICAO", valor: comMoscas },
      { dia: "2026-09-06", setor: "RECEPCAO", valor: comOutra },
    ];
    const c = consolidarPragasMes(registros, 2026, 9);
    expect(c.houvePragaNoMes).toBe(true);
    expect(c.statusPorDia[5]).toBe("presente");
    expect(c.presencaPorPraga.moscas![5]).toBe(true);
    expect(c.presencaPorPraga.moscas![6]).toBe(false);
    expect(c.ocorrencias.map((o) => [o.dia, o.rotulo, o.setor])).toEqual([
      ["2026-09-05", "Moscas", "EXPEDICAO"],
      ["2026-09-06", "Outras: Lagarta-rosca", "RECEPCAO"],
    ]);
  });

  it("ignora registros de outros meses", () => {
    const c = consolidarPragasMes([{ dia: "2026-08-31", setor: "A", valor: comMoscas }], 2026, 9);
    expect(c.houvePragaNoMes).toBe(false);
    expect(c.diasMonitorados).toEqual([]);
  });
});
