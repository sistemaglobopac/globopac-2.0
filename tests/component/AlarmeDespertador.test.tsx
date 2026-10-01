import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { BIPES_POR_RAJADA, INTERVALO_RAJADA_MS, useAudioAlarm } from "@/modules/fichas/useAudioAlarm";

let osciladores = 0;
let fechou = false;

beforeEach(() => {
  osciladores = 0;
  fechou = false;
  vi.useFakeTimers();
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    close = vi.fn(() => {
      fechou = true;
      return Promise.resolve();
    });
    createOscillator() {
      osciladores += 1;
      return { type: "", frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Alarme({ ativo }: { ativo: boolean }) {
  useAudioAlarm(ativo);
  return null;
}

describe("alarme tipo despertador", () => {
  it("toca rajadas de 4 bipes a cada segundo, sem pausa, e para ao desativar", () => {
    const { rerender, unmount } = render(<Alarme ativo />);
    expect(osciladores).toBe(BIPES_POR_RAJADA); // 1ª rajada imediata
    vi.advanceTimersByTime(INTERVALO_RAJADA_MS * 3);
    expect(osciladores).toBe(BIPES_POR_RAJADA * 4); // continua tocando a cada segundo
    rerender(<Alarme ativo={false} />);
    const antes = osciladores;
    vi.advanceTimersByTime(INTERVALO_RAJADA_MS * 3);
    expect(osciladores).toBe(antes); // silêncio
    expect(fechou).toBe(true);
    unmount();
  });

  it("inativo não toca nada", () => {
    render(<Alarme ativo={false} />);
    vi.advanceTimersByTime(5000);
    expect(osciladores).toBe(0);
  });
});
