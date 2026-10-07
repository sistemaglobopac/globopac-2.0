import { useSyncExternalStore } from "react";

function assinar(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** `true` enquanto o navegador reporta rede (reativo aos eventos online/offline). */
export function useOnline(): boolean {
  return useSyncExternalStore(assinar, () => navigator.onLine, () => true);
}
