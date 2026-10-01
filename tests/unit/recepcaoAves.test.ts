import { describe, expect, it } from "vitest";
import {
  avaliarRecepcao,
  formatarDuracao,
  inconsistenciasDeHorario,
  minutosEntre,
  montarValorRecepcao,
  motivosBloqueioRecepcao,
  recepcaoVazia,
  tempos,
} from "@/modules/fichas/fields/recepcaoAves";
import { desviosEspeciais, temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { RecepcaoAvesValor } from "@/modules/fichas/fields/tiposCompostos";

function completo(parcial: Partial<RecepcaoAvesValor> = {}): RecepcaoAvesValor {
  return {
    ...recepcaoVazia(),
    cargaId: "c1",
    gta: "123456",
    integrado: "João",
    aviario: "12",
    nucleo: "3",
    qtdAves: 12000,
    veiculoId: "v1",
    placa: "ABC1D23",
    condicaoVeiculo: "CONFORME",
    retiradaRacaoEm: "2026-09-30T02:00",
    embarqueInicioEm: "2026-09-30T05:00",
    embarqueFimEm: "2026-09-30T07:00",
    chegadaEm: "2026-09-30T09:30",
    penduraInicioEm: "2026-09-30T10:30",
    condicaoAnimais: "normais",
    ...parcial,
  };
}

describe("recepção de aves — tempos", () => {
  it("calcula jejum, dieta hídrica, viagem e espera", () => {
    expect(tempos(completo())).toEqual({
      jejumMin: 8.5 * 60, // 02:00 → 10:30
      dietaHidricaMin: 5.5 * 60, // 05:00 → 10:30
      viagemMin: 150, // 07:00 → 09:30
      esperaMin: 60, // 09:30 → 10:30
    });
  });

  it("atravessa a meia-noite", () => {
    expect(minutosEntre("2026-09-29T23:00", "2026-09-30T01:30")).toBe(150);
  });

  it("devolve null quando falta um horário", () => {
    expect(minutosEntre("", "2026-09-30T01:30")).toBeNull();
    expect(tempos(recepcaoVazia()).jejumMin).toBeNull();
  });

  it("formata a duração", () => {
    expect(formatarDuracao(510)).toBe("8 h 30 min");
    expect(formatarDuracao(45)).toBe("45 min");
    expect(formatarDuracao(null)).toBe("—");
  });

  it("aponta horários fora de ordem", () => {
    const erros = inconsistenciasDeHorario(completo({ chegadaEm: "2026-09-30T06:00" }));
    expect(erros.length).toBe(1);
    expect(erros[0]).toMatch(/"chegada ao abatedouro" está antes de "término do embarque"/);
  });
});

describe("recepção de aves — conformidade", () => {
  it("conforme com veículo conforme e jejum dentro do limite", () => {
    expect(avaliarRecepcao(completo())).toEqual({ conformidade: true, motivos: [] });
  });

  it("veículo não conforme reprova e cita a placa", () => {
    const a = avaliarRecepcao(completo({ condicaoVeiculo: "NAO_CONFORME", obsVeiculo: "piso quebrado" }));
    expect(a.conformidade).toBe(false);
    expect(a.motivos[0]).toContain("ABC1D23");
    expect(a.motivos[0]).toContain("piso quebrado");
  });

  it("jejum acima de 12 h reprova", () => {
    const a = avaliarRecepcao(completo({ retiradaRacaoEm: "2026-09-29T20:00" }));
    expect(a.conformidade).toBe(false);
    expect(a.motivos[0]).toMatch(/Jejum alimentar de 14 h 30 min/);
  });

  it("montarValorRecepcao grava tempos, conformidade e detalhesRNC", () => {
    const v = montarValorRecepcao(completo({ condicaoVeiculo: "NAO_CONFORME", obsVeiculo: "x" }));
    expect(v.jejumMin).toBe(510);
    expect(v.conformidade).toBe(false);
    expect(v.detalhesRNC).toContain("Veículo");
  });

  it("alimenta os avisos de desvio e a detecção de não conformidade", () => {
    const campos = [{ chave: "rec", tipo: "recepcao_aves", obrigatorio: true, label: "Recepção" }] as CampoTemplate[];
    const nc = montarValorRecepcao(completo({ condicaoVeiculo: "NAO_CONFORME", obsVeiculo: "x" }));
    expect(desviosEspeciais(campos, { rec: nc })).toHaveLength(1);
    expect(temNaoConformidade({ rec: nc })).toBe(true);
    expect(desviosEspeciais(campos, { rec: montarValorRecepcao(completo()) })).toHaveLength(0);
  });
});

describe("recepção de aves — bloqueios de assinatura", () => {
  it("completo não bloqueia", () => {
    expect(motivosBloqueioRecepcao(completo())).toEqual([]);
  });

  it("vazio bloqueia por GTA, veículo, horários e animais", () => {
    const m = motivosBloqueioRecepcao(recepcaoVazia()).join(" | ");
    expect(m).toMatch(/GTA/);
    expect(m).toMatch(/veículo \(placa\)/);
    expect(m).toMatch(/data e hora de: retirada da ração/);
    expect(m).toMatch(/condição dos animais/);
  });

  it("veículo não conforme exige descrição", () => {
    expect(motivosBloqueioRecepcao(completo({ condicaoVeiculo: "NAO_CONFORME" })).join()).toMatch(/descreva a não conformidade do veículo/);
  });

  it("'Outras' condições exige descrição", () => {
    expect(motivosBloqueioRecepcao(completo({ condicaoAnimais: "outras" })).join()).toMatch(/Outras/);
  });

  it("entra no bloqueio geral da ficha", () => {
    const campos = [{ chave: "rec", tipo: "recepcao_aves", obrigatorio: true }] as CampoTemplate[];
    expect(motivosDeBloqueioSpr(campos, { rec: recepcaoVazia() }).length).toBeGreaterThan(0);
    expect(motivosDeBloqueioSpr(campos, { rec: completo() })).toEqual([]);
  });
});
