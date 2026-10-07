import { useOnline } from "@/lib/useOnline";
import { WifiOff } from "lucide-react";
import { useSessionStore } from "@/store/session";

/** Faixa fixa enquanto o aparelho está sem rede: os dados mostrados vêm do último acesso com
 * internet e o que o inspetor registrar fica no aparelho até a conexão voltar. */
export function SemConexaoBanner() {
  const online = useOnline();
  const acessoOffline = useSessionStore((s) => s.acessoOffline);
  if (online) return null;
  return (
    <div role="status" data-testid="banner-sem-conexao" className="flex items-center gap-2 border-b border-warning bg-warning/15 px-4 py-2 text-xs font-bold text-warning-foreground">
      <WifiOff className="h-4 w-4 shrink-0" />
      Sem conexão — os dados na tela são do último acesso com internet. Você pode continuar preenchendo: os registros ficam salvos no aparelho e são enviados quando a rede voltar.
      {acessoOffline && (
        <> Acesso offline válido até {new Date(acessoOffline.validoAte).toLocaleString("pt-BR", { timeZone: "America/Manaus", dateStyle: "short", timeStyle: "short" })}.</>
      )}
    </div>
  );
}
