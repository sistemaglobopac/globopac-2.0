import { ShieldAlert } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useAppDialog } from "../dialogSystem";
import { useBloqueiosLoginIp, useDesbloquearIp, type BloqueioLoginIp } from "../api";

const ROTULO_STATUS: Record<BloqueioLoginIp["status"], { texto: string; className: string }> = {
  aguardando_captcha: { texto: "Aguardando CAPTCHA", className: "bg-warning/10 text-warning" },
  bloqueado: { texto: "Bloqueado", className: "bg-destructive/10 text-destructive" },
};

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

/** Aba "Segurança de Login" — pedido explícito do responsável do projeto (fora do roteiro de
 * fases): 5 tentativas de login malsucedidas do mesmo IP exigem CAPTCHA, 10 bloqueiam o IP
 * por completo. Este painel é o ÚNICO jeito de desbloquear ("Somente um administrador poderá
 * liberar o login por aquele IP novamente") — ver ADR 0015. */
export function SegurancaLoginPanel() {
  const dialog = useAppDialog();
  const { data: bloqueios, isLoading } = useBloqueiosLoginIp();
  const desbloquear = useDesbloquearIp();

  function confirmarDesbloqueio(ip: string) {
    dialog.confirm({
      titulo: "Desbloquear IP",
      mensagem: `Liberar o login para o IP "${ip}"? O contador de tentativas será zerado.`,
      icone: "warning",
      aoConfirmar: () => {
        desbloquear.mutate(ip, {
          onSuccess: () => dialog.sucesso(`IP ${ip} desbloqueado.`),
          onError: (erro) => dialog.erro(erro, "Falha ao desbloquear o IP"),
        });
      },
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <ShieldAlert className="h-7 w-7 shrink-0 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-ink">Segurança de Login</h2>
          <p className="text-sm text-muted-foreground">
            IPs com tentativas de login malsucedidas: 5 falhas exigem CAPTCHA, 10 bloqueiam o IP até um
            administrador liberar de volta.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && (bloqueios ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum IP em CAPTCHA ou bloqueado no momento.</p>
      )}

      {(bloqueios ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-surface-soft">
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Falhas</th>
                <th className="px-4 py-2">Última falha</th>
                <th className="px-4 py-2">Último desbloqueio</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(bloqueios ?? []).map((b) => {
                const rotulo = ROTULO_STATUS[b.status];
                return (
                  <tr key={b.ip} className="border-t border-hairline">
                    <td className="px-4 py-2 font-mono">{b.ip}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${rotulo.className}`}>
                        {rotulo.texto}
                      </span>
                    </td>
                    <td className="px-4 py-2">{b.tentativas_falhas}</td>
                    <td className="px-4 py-2">{formatarData(b.ultima_falha_em)}</td>
                    <td className="px-4 py-2">{formatarData(b.desbloqueado_em)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={desbloquear.isPending}
                        onClick={() => confirmarDesbloqueio(b.ip)}
                      >
                        Liberar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
