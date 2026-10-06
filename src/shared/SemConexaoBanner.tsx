import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function assinar(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function useOnline(): boolean {
  return useSyncExternalStore(assinar, () => navigator.onLine, () => true);
}

/** Faixa fixa enquanto o aparelho está sem rede: os dados mostrados vêm do último acesso com
 * internet e o que o inspetor registrar fica no aparelho até a conexão voltar. */
export function SemConexaoBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" data-testid="banner-sem-conexao" className="flex items-center gap-2 border-b border-warning bg-warning/15 px-4 py-2 text-xs font-bold text-warning-foreground">
      <WifiOff className="h-4 w-4 shrink-0" />
      Sem conexão — os dados na tela são do último acesso com internet. Você pode continuar preenchendo: os registros ficam salvos no aparelho e são enviados quando a rede voltar.
    </div>
  );
}
