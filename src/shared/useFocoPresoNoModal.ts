import { useEffect, type RefObject } from "react";

/** Mantém o foco do teclado DENTRO de um modal enquanto ele está aberto.
 *
 * Sem isso, o campo que estava em foco na página (ex.: "Temperatura da água") continuava recebendo o teclado quando a janela de
 * assinatura abria ou era trocada por outra (aviso de reconexão, nova assinatura…): o inspetor digitava a senha/matrícula achando
 * que era no modal e ela ia parar no campo da ficha (chiller 2 gravado como 1539 ºC). Aqui, ao abrir, o campo da página perde o
 * foco (some também o teclado virtual do tablet) e o foco vai para `alvo` (ou para o próprio diálogo); se ele escapar para fora
 * depois, volta. Com vários modais empilhados só vale o último (aria-modal) — os de baixo não disputam o foco. */
export function useFocoPresoNoModal(dialogo: RefObject<HTMLElement | null>, alvo: RefObject<HTMLElement | null>, aberto = true): void {
  useEffect(() => {
    const raiz = dialogo.current;
    if (!aberto || !raiz) return;

    const ehOUltimoModal = () => {
      const abertos = document.querySelectorAll('[aria-modal="true"]');
      return abertos[abertos.length - 1] === raiz;
    };

    function levarOFocoParaOModal() {
      const el = alvo.current;
      if (el && !(el as HTMLInputElement).disabled) el.focus();
      else raiz?.focus();
    }

    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && !raiz.contains(ativo)) ativo.blur();
    levarOFocoParaOModal();

    function aoFocar(e: FocusEvent) {
      if (!raiz || !(e.target instanceof Node) || raiz.contains(e.target) || !ehOUltimoModal()) return;
      levarOFocoParaOModal();
    }
    document.addEventListener("focusin", aoFocar);
    return () => document.removeEventListener("focusin", aoFocar);
  }, [dialogo, alvo, aberto]);
}
