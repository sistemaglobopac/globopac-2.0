import { useState } from "react";
import { Loader2, Wifi } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useOnline } from "@/lib/useOnline";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { encerrarAcessoOffline, reconectar } from "./acessoOffline";

/** Aparece quando o inspetor entrou SEM internet e a rede voltou: ele ainda não tem sessão no servidor, então os
 * registros da fila não podem ser enviados. Com a senha, abre a sessão de verdade e a sincronização roda sozinha. */
export function ReconectarModal() {
  const acesso = useSessionStore((s) => s.acessoOffline);
  const online = useOnline();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [usarLogin, setUsarLogin] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [adiado, setAdiado] = useState(false);

  if (!acesso || !online || adiado) return null;

  async function confirmar() {
    if (!acesso || !senha || processando) return;
    setErro(null);
    setProcessando(true);
    try {
      const r = await reconectar(acesso.matricula, senha);
      if (!r.ok) {
        setErro(r.erro);
        setUsarLogin(!!r.usarTelaDeLogin);
      }
    } finally {
      setProcessando(false);
      setSenha("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="modal-reconectar">
      <div role="dialog" aria-modal="true" aria-label="Conexão restaurada" className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center gap-2 rounded-t-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">
          <Wifi className="h-5 w-5" /> Conexão restaurada
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Você entrou sem internet. Confirme sua senha para reconectar: os registros salvos neste aparelho são enviados e assinados automaticamente.
          </p>
          <div className="space-y-2">
            <Label htmlFor="senha-reconectar">Sua senha</Label>
            <Input
              id="senha-reconectar"
              type="password"
              value={senha}
              autoFocus
              disabled={processando}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmar();
                }
              }}
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            {usarLogin ? (
              <Button type="button" className="flex-1" onClick={encerrarAcessoOffline}>
                Ir para a tela de login
              </Button>
            ) : (
              <Button type="button" className="flex-1" disabled={processando || !senha} onClick={() => void confirmar()}>
                {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {processando ? "Reconectando…" : "Reconectar"}
              </Button>
            )}
            <Button type="button" variant="outline" className="flex-1" disabled={processando} onClick={() => setAdiado(true)}>
              Continuar offline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
