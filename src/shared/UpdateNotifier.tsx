import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";

const INTERVALO_VERIFICACAO_MS = 60_000;

export function UpdateNotifier() {
  const [novaVersaoDisponivel, setNovaVersaoDisponivel] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function verificarNovaVersao() {
      try {
        const resposta = await fetch("/build-meta.json", { cache: "no-store" });
        if (!resposta.ok) return;
        const { buildId } = (await resposta.json()) as { buildId: string };
        if (!cancelado && buildId !== __APP_BUILD_ID__) {
          setNovaVersaoDisponivel(true);
        }
      } catch {
        // Falha de rede é ignorada silenciosamente; a próxima verificação tenta de novo.
      }
    }

    const intervalId = setInterval(verificarNovaVersao, INTERVALO_VERIFICACAO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalId);
    };
  }, []);

  if (!novaVersaoDisponivel) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg">
      <p className="text-sm text-foreground">Nova versão disponível.</p>
      <Button size="sm" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" />
        Atualizar
      </Button>
    </div>
  );
}
