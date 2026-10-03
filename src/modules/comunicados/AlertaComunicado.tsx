import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { useAudioAlarm } from "@/modules/fichas/useAudioAlarm";
import { useComunicadosPendentes, useConfirmarLeituraComunicado } from "./api";

const KEYFRAMES =
  "@keyframes comunicado-chacoalhar{0%,100%{transform:translateX(0) rotate(0)}10%{transform:translateX(-10px) rotate(-1.5deg)}20%{transform:translateX(10px) rotate(1.5deg)}30%{transform:translateX(-8px) rotate(-1deg)}40%{transform:translateX(8px) rotate(1deg)}50%{transform:translateX(-5px)}60%{transform:translateX(5px)}70%{transform:translateX(0)}}";

/** Alerta de comunicado do Administrador/Verificador: montado uma vez no AppShell, abre em QUALQUER
 * tela do inspetor — modal que chacoalha, com alarme sonoro — e só fecha quando o inspetor confirma
 * que leu a mensagem. Vários comunicados pendentes aparecem um por vez, do mais antigo ao mais novo. */
export function AlertaComunicado() {
  const perfil = useSessionStore((s) => s.perfil);
  const queryClient = useQueryClient();
  const userId = perfil?.nivelAcesso === "INSPETOR_QUALIDADE" ? perfil.id : undefined;
  const { data: pendentes } = useComunicadosPendentes(userId);
  const confirmar = useConfirmarLeituraComunicado();
  const atual = pendentes?.[0];

  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel(`comunicados-alerta-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comunicados_alerta_destinatarios", filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["comunicados-alerta", "pendentes"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId, queryClient]);

  useAudioAlarm(Boolean(atual));

  if (!atual) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="Comunicado"
      data-testid="alerta-comunicado"
    >
      <style>{KEYFRAMES}</style>
      <div
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-4 border-warning bg-background shadow-2xl"
        style={{ animation: "comunicado-chacoalhar 0.9s ease-in-out infinite" }}
      >
        <div className="flex shrink-0 items-center justify-center gap-2 bg-warning p-4 text-warning-foreground">
          <BellRing className="h-6 w-6" />
          <h2 className="text-lg font-black uppercase tracking-wider">Comunicado</h2>
          {pendentes && pendentes.length > 1 && (
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-bold">+{pendentes.length - 1} na fila</span>
          )}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          <h3 className="text-lg font-black text-ink">{atual.titulo}</h3>
          <p className="whitespace-pre-wrap text-sm text-ink">{atual.mensagem}</p>
          <p className="text-xs text-muted-foreground">
            {atual.autor_perfil === "ADMIN_MASTER" ? "Administrador" : "Verificador"} {atual.autor_nome} ·{" "}
            {new Date(atual.criado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
          </p>
        </div>
        <div className="shrink-0 border-t p-4">
          <Button type="button" className="w-full" disabled={confirmar.isPending} onClick={() => confirmar.mutate(atual.id)} data-testid="confirmar-leitura-comunicado">
            {confirmar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Li e estou ciente
          </Button>
          {confirmar.isError && <p className="mt-2 text-center text-xs text-destructive">Não foi possível registrar a leitura. Tente novamente.</p>}
        </div>
      </div>
    </div>
  );
}
