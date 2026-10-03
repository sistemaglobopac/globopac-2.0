import { useEffect } from "react";

/** Alerta sonoro tipo DESPERTADOR enquanto houver monitoramento atrasado (passou 10 minutos da hora
 * de fazê-lo) que o inspetor não esteja preenchendo agora: rajadas de 4 bipes agudos ("bi-bi-bi-bi")
 * repetidas a cada segundo, sem parar, até o atraso ser resolvido ou o aviso dispensado. Web Audio
 * API, sem arquivo de áudio. */
export const BIPES_POR_RAJADA = 4;
export const INTERVALO_RAJADA_MS = 1000;

export function useAudioAlarm(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    let audioCtx: AudioContext | undefined;

    const iniciar = () => {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") void audioCtx.resume();
    };

    const bipe = (inicio: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1500, inicio);
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.3, inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.09);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.1);
    };

    const rajada = () => {
      if (!audioCtx) return;
      const t0 = audioCtx.currentTime;
      for (let i = 0; i < BIPES_POR_RAJADA; i += 1) bipe(t0 + i * 0.15);
    };

    // Se o navegador deixou o áudio suspenso (política de autoplay), o primeiro toque/tecla libera.
    const liberar = () => {
      if (audioCtx && audioCtx.state === "suspended") void audioCtx.resume();
    };
    window.addEventListener("pointerdown", liberar);
    window.addEventListener("keydown", liberar);

    iniciar();
    rajada();
    const timer = setInterval(rajada, INTERVALO_RAJADA_MS);

    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
      clearInterval(timer);
      if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
    };
  }, [isActive]);
}
