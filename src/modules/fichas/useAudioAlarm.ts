import { useEffect } from "react";

/** Alarme sonoro (bipe intermitente) enquanto existir uma ficha atrasada que o inspetor não
 * esteja preenchendo agora — mesmo mecanismo do v1 (NovoRegistro.jsx): fase "tocando" de
 * 10s com bipes a cada 600ms, seguida de 5s de silêncio, em loop, via Web Audio API (nenhuma
 * dependência de arquivo de áudio). */
export function useAudioAlarm(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;

    let isPlayingPhase = true;
    let phaseTimer: ReturnType<typeof setInterval>;
    let audioCtx: AudioContext | undefined;

    const startAudioContext = () => {
      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }
    };

    const doBeep = () => {
      if (!isPlayingPhase || !audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.1);
    };

    const togglePhase = () => {
      if (isPlayingPhase) {
        isPlayingPhase = false;
        clearInterval(phaseTimer);
        phaseTimer = setInterval(togglePhase, 5000);
      } else {
        isPlayingPhase = true;
        clearInterval(phaseTimer);
        phaseTimer = setInterval(togglePhase, 10000);
      }
    };

    startAudioContext();
    const beepTimer = setInterval(doBeep, 600);
    phaseTimer = setInterval(togglePhase, 10000);

    return () => {
      clearInterval(beepTimer);
      clearInterval(phaseTimer);
      if (audioCtx && audioCtx.state !== "closed") {
        void audioCtx.close();
      }
    };
  }, [isActive]);
}
