import { describe, expect, it } from "vitest";
import {
  INTERVALO_LEMBRETE_PRAGAS_MIN,
  inicioJanelaPragas,
  numeroDoLembretePragas,
  pragasPendentes,
  temCampoDePragas,
  type FichaAtivaResumo,
} from "@/modules/bordo/api";

const ficha = (over: Partial<FichaAtivaResumo> = {}): FichaAtivaResumo => ({
  id: "f-pragas",
  codigo: "PRG-01",
  nome: "Monitoramento de Pragas",
  tipo_apontamento: "Demanda",
  tempo_entre_apontamentos_min: null,
  locais_aplicacao: ["Pendura"],
  exigeDiaria: true,
  ...over,
});

// 10/10/2026 20:00 em Manaus (UTC-4) = 11/10 00:00 UTC. O turno começou às 17h de Manaus.
const inicioTurno = new Date("2026-10-10T21:00:00Z");
const agora = new Date("2026-10-11T01:00:00Z"); // 21h de Manaus (4 h de turno)

describe("monitoramento de pragas — detecção da ficha", () => {
  it("só a ficha com o campo de ocorrência de pragas é de pragas", () => {
    expect(temCampoDePragas([{ tipo: "texto" }, { tipo: "ocorrencia_pragas" }])).toBe(true);
    expect(temCampoDePragas([{ tipo: "texto" }])).toBe(false);
    expect(temCampoDePragas(null)).toBe(false);
  });
});

describe("monitoramento de pragas — pendente no dia", () => {
  it("sem monitoramento feito: pendente", () => {
    expect(pragasPendentes([ficha()], [], [], inicioTurno, agora)).toHaveLength(1);
  });

  it("ficha que não é de pragas nunca é cobrada", () => {
    expect(pragasPendentes([ficha({ exigeDiaria: false })], [], [], inicioTurno, agora)).toEqual([]);
  });

  it("feito no turno (por qualquer inspetor do setor, em qualquer versão da ficha): cumprido", () => {
    const feito = [{ codigo: "PRG-01", instante: "2026-10-10T22:30:00Z" }];
    expect(pragasPendentes([ficha()], feito, [], inicioTurno, agora)).toEqual([]);
  });

  it("rascunho do dia conta como feito", () => {
    expect(pragasPendentes([ficha()], [], [{ ficha_template_id: "f-pragas", criado_em: "2026-10-10T23:00:00Z" }], inicioTurno, agora)).toEqual([]);
  });

  it("monitoramento de outra ficha ou de antes do turno não cumpre", () => {
    const feitos = [
      { codigo: "OUTRA", instante: "2026-10-10T22:30:00Z" },
      { codigo: "PRG-01", instante: "2026-10-09T15:00:00Z" },
    ];
    expect(pragasPendentes([ficha()], feitos, [], inicioTurno, agora)).toHaveLength(1);
  });

  it("turno que atravessa a meia-noite: o monitoramento feito antes da virada continua valendo", () => {
    // 04h de Manaus do dia 11 (08:00Z): o dia corrente começou à 00h, mas o turno começou no dia 10 às 17h.
    const depoisDaVirada = new Date("2026-10-11T08:00:00Z");
    const feitoAntes = [{ codigo: "PRG-01", instante: "2026-10-10T23:00:00Z" }]; // 19h de Manaus, dia 10
    expect(inicioJanelaPragas(inicioTurno, depoisDaVirada).getTime()).toBe(inicioTurno.getTime());
    expect(pragasPendentes([ficha()], feitoAntes, [], inicioTurno, depoisDaVirada)).toEqual([]);
  });

  it("turno do mesmo dia: a janela é o dia corrente (00h de Manaus)", () => {
    const manha = new Date("2026-10-10T11:00:00Z"); // 07h de Manaus
    const inicioManha = new Date("2026-10-10T10:00:00Z"); // 06h de Manaus
    expect(inicioJanelaPragas(inicioManha, manha).toISOString()).toBe("2026-10-10T04:00:00.000Z");
  });
});

describe("monitoramento de pragas — lembrete de 2 em 2 horas", () => {
  it("intervalo de 120 minutos", () => {
    expect(INTERVALO_LEMBRETE_PRAGAS_MIN).toBe(120);
  });

  it("não lembra antes de 2 h de turno; depois, um lembrete novo a cada 2 h", () => {
    const em = (min: number) => new Date(inicioTurno.getTime() + min * 60_000);
    expect(numeroDoLembretePragas(inicioTurno, em(0))).toBe(0);
    expect(numeroDoLembretePragas(inicioTurno, em(119))).toBe(0);
    expect(numeroDoLembretePragas(inicioTurno, em(120))).toBe(1);
    expect(numeroDoLembretePragas(inicioTurno, em(239))).toBe(1);
    expect(numeroDoLembretePragas(inicioTurno, em(240))).toBe(2);
  });
});
