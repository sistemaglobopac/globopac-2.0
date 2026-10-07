import { useState } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { conferirSenha } from "@/modules/auth/reautenticar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

interface ModalAssinaturaSenhaProps {
  titulo?: string;
  /** Texto explicando o que a assinatura confirma. */
  descricao: string;
  textoConfirmar?: string;
  /** Roda DEPOIS de a senha ser conferida. Pode lançar erro (mostrado no modal). Ao resolver, quem
   * abriu o modal decide fechá-lo. `contexto.modo` diz onde a senha foi conferida: "aparelho" = sem
   * internet (ADR 0016), a assinatura oficial só sai quando a rede voltar. */
  onAssinar: (contexto: { modo: "servidor" | "aparelho"; matricula?: string }) => Promise<void>;
  onCancelar: () => void;
  /** Progresso de assinatura em lote ("2/5"): substitui o campo de senha por uma barra. */
  progresso?: { atual: number; total: number } | null;
  /** Legenda da barra de progresso. */
  legendaProgresso?: string;
  testId?: string;
}

/** Modal ÚNICO de assinatura eletrônica com senha (Lei 14.063/2020, Art. 4º §2º): toda assinatura
 * que exige reconferir a senha do usuário abre este modal — nunca um campo de senha solto na página.
 * A senha é conferida com conferirSenha() antes de chamar `onAssinar`. */
export function ModalAssinaturaSenha({
  titulo = "Assinatura Eletrônica",
  descricao,
  textoConfirmar = "Confirmar e Assinar",
  onAssinar,
  onCancelar,
  progresso,
  legendaProgresso = "Computando SHA-256 e solicitando carimbo RFC 3161…",
  testId,
}: ModalAssinaturaSenhaProps) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  async function confirmar() {
    if (!senha || processando) return;
    setErro(null);
    setProcessando(true);
    try {
      const conferencia = await conferirSenha(senha);
      if (!conferencia.ok) {
        setErro(conferencia.erro);
        return;
      }
      await onAssinar(conferencia.modo === "aparelho" ? { modo: "aparelho", matricula: conferencia.matricula } : { modo: "servidor" });
    } catch (e) {
      setErro(e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? "Falha ao assinar. Tente novamente.");
    } finally {
      setProcessando(false);
      setSenha("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid={testId}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5" />
            {titulo}
          </span>
          <button type="button" onClick={onCancelar} disabled={processando} aria-label="Fechar" className="disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {progresso ? (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progresso.atual / Math.max(progresso.total, 1)) * 100)}%` }} />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {progresso.atual}/{progresso.total} — {legendaProgresso}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{descricao}</p>
              {!navigator.onLine && (
                <p role="status" className="rounded-md border border-warning bg-warning/15 p-2 text-xs text-warning-foreground">
                  Sem conexão: a senha é conferida neste aparelho. A assinatura oficial é concluída quando a internet voltar.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="senha-assinatura-modal">Sua senha (a mesma do login)</Label>
                <Input
                  id="senha-assinatura-modal"
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
                <Button type="button" variant="outline" className="flex-1" disabled={processando} onClick={onCancelar}>
                  Cancelar
                </Button>
                <Button type="button" className="flex-1" disabled={processando || !senha} onClick={() => void confirmar()}>
                  {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {processando ? "Assinando…" : textoConfirmar}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
