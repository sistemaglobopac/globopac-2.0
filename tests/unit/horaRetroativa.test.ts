import { describe, expect, it } from "vitest";
import { isoDeManaus, validarHoraMonitoramento, vizinhosDaHora } from "@/modules/fichas/utils/horaMonitoramento";

// Hoje é 13/10 às 14h (Manaus). O inspetor lança um monitoramento do dia 10/10 às 17h.
const AGORA = new Date("2026-10-13T18:00:00Z");
const h = (data: string, hora: string) => isoDeManaus(data, hora)!;

describe("lançamento retroativo: a hora vale contra os vizinhos dela, não contra o último registro de todos", () => {
  const registros = [h("2026-10-10", "08:00"), h("2026-10-10", "12:00"), h("2026-10-10", "16:00"), h("2026-10-11", "06:00"), h("2026-10-13", "10:00")];

  it("acha o monitoramento imediatamente antes e o imediatamente depois", () => {
    const v = vizinhosDaHora(h("2026-10-10", "17:00"), registros);
    expect(v.anteriorEm).toBe(h("2026-10-10", "16:00"));
    expect(v.posteriorEm).toBe(h("2026-10-11", "06:00"));
  });

  it("o caso do dia 10 às 17h é aceito (antes: recusado por causa do monitoramento de hoje)", () => {
    const hora = h("2026-10-10", "17:00");
    const v = vizinhosDaHora(hora, registros);
    expect(validarHoraMonitoramento({ hora, agora: AGORA, ...v, intervaloMin: 60 })).toBeNull();
    // o comportamento antigo comparava com o último registro de todos (hoje 10h) e recusava:
    expect(validarHoraMonitoramento({ hora, agora: AGORA, anteriorEm: h("2026-10-13", "10:00"), intervaloMin: 60 })).toMatch(/posterior à do monitoramento anterior/);
  });

  it("continua exigindo hora posterior ao monitoramento anterior daquele dia e o intervalo mínimo", () => {
    const antes = h("2026-10-10", "15:30");
    expect(validarHoraMonitoramento({ hora: antes, agora: AGORA, ...vizinhosDaHora(antes, registros), intervaloMin: 60 })).toMatch(/intervalo mínimo/);
    const igual = h("2026-10-10", "16:00");
    expect(validarHoraMonitoramento({ hora: igual, agora: AGORA, ...vizinhosDaHora(igual, registros) })).toMatch(/posterior à do monitoramento anterior/);
  });

  it("não deixa o lançamento ficar colado no monitoramento seguinte", () => {
    const hora = h("2026-10-11", "05:30");
    expect(validarHoraMonitoramento({ hora, agora: AGORA, ...vizinhosDaHora(hora, registros), intervaloMin: 60 })).toMatch(/já existe um monitoramento às 06:00/);
  });

  it("sem vizinhos, ou com horas inválidas, não bloqueia", () => {
    const hora = h("2026-10-10", "17:00");
    expect(vizinhosDaHora(hora, [])).toEqual({ anteriorEm: null, posteriorEm: null });
    expect(vizinhosDaHora(hora, [null, undefined, "lixo"])).toEqual({ anteriorEm: null, posteriorEm: null });
    expect(vizinhosDaHora(null, registros)).toEqual({ anteriorEm: null, posteriorEm: null });
  });

  it("recusa hora futura e aceita retroativo de qualquer data", () => {
    expect(validarHoraMonitoramento({ hora: h("2026-10-14", "10:00"), agora: AGORA })).toMatch(/futura/);
    expect(validarHoraMonitoramento({ hora: h("2026-10-05", "10:00"), agora: AGORA })).toBeNull();
    expect(validarHoraMonitoramento({ hora: h("2026-06-01", "10:00"), agora: AGORA })).toBeNull();
  });
});
