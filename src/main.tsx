import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { queryClient } from "@/lib/queryClient";
import { hidratarConsultas, instalarPersistenciaOffline } from "@/lib/offlineCache";
import "./index.css";

// Carrega antes de renderizar o cache local das consultas de preenchimento (sem rede, é ele que
// permite o app abrir com as fichas); falha ou demora nunca impede o app de subir.
function iniciar() {
  // Pede ao navegador para NÃO apagar os dados do app (fila, rascunhos, credencial e cache offline) por falta de
  // espaço: um aparelho que fica dias sem rede guarda ali fichas que ainda não existem no servidor.
  void navigator.storage?.persist?.().catch(() => undefined);
  instalarPersistenciaOffline(queryClient);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void Promise.race([hidratarConsultas(queryClient), new Promise<void>((resolve) => setTimeout(resolve, 1500))])
  .catch(() => undefined)
  .finally(iniciar);
