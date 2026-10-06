import { useState } from "react";
import { AlertTriangle, ClipboardList, Trash2, WifiOff } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { prazoDoRascunho, rascunhoExpirado, removerRascunho } from "@/lib/rascunhos";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { assinarRascunhosEmLote, useAtualizarRascunhos, useRascunhos } from "../useRascunhos";
import { useQueryClient } from "@tanstack/react-query";

const formatar = (iso: string | Date) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", dateStyle: "short", timeStyle: "short" });

/** Rascunhos de monitoramento deste aparelho: preenchidos no local (com ou sem internet) e ainda NÃO
 * assinados. Assina todos de uma vez, com uma confirmação de senha, em até 24 h da hora do
 * monitoramento. Um rascunho NÃO é um registro: só vale depois de assinado. */
export function RascunhosPainel() {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: rascunhos } = useRascunhos(perfil?.id);
  const atualizar = useAtualizarRascunhos();
  const queryClient = useQueryClient();
  const [assinando, setAssinando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  if (!perfil || !rascunhos || rascunhos.length === 0) return null;

  const agora = new Date();
  const online = navigator.onLine;
  const assinaveis = rascunhos.filter((r) => !rascunhoExpirado(r, agora));
  const temNc = rascunhos.some((r) => r.naoConforme);

  async function assinar() {
    if (!perfil) return;
    setProgresso({ atual: 0, total: assinaveis.length });
    const r = await assinarRascunhosEmLote(assinaveis, perfil.id, (atual, total) => setProgresso({ atual, total }));
    setProgresso(null);
    setAssinando(false);
    void atualizar();
    void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    void queryClient.invalidateQueries({ queryKey: ["painel-bordo"] });
    const partes = [`${r.assinados.length} assinado(s)`];
    if (r.falharam.length > 0) partes.push(`${r.falharam.length} com falha (continuam como rascunho)`);
    setResumo(partes.join(" · "));
  }

  return (
    <Card className={temNc ? "border-2 border-destructive" : "border-primary/40"} data-testid="rascunhos-painel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ClipboardList className="h-4 w-4" /> {rascunhos.length} rascunho(s) aguardando assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Salvos neste aparelho, ainda não são registros. Assine em até 24 h da hora do monitoramento — depois disso o prazo vence e o rascunho não pode mais ser assinado.
        </p>
        {rascunhos.map((r) => {
          const expirado = rascunhoExpirado(r, agora);
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2" data-testid="rascunho-item">
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold">{r.nomeFicha}</p>
                <p className="text-xs text-muted-foreground">
                  {r.setor} · realizado em {formatar(r.horaMonitoramento)} · assinar até {formatar(prazoDoRascunho(r))}
                </p>
                {r.status === "falhou" && r.ultimoErro && <p className="text-xs text-destructive">Falha ao assinar: {r.ultimoErro}</p>}
              </div>
              <div className="flex items-center gap-2">
                {r.naoConforme && (
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" /> NÃO CONFORME
                  </Badge>
                )}
                {expirado && <Badge variant="secondary">Prazo vencido</Badge>}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Descartar rascunho"
                  onClick={async () => {
                    if (window.confirm("Descartar este rascunho? Ele não poderá ser recuperado.")) {
                      await removerRascunho(r.id);
                      void atualizar();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        {temNc && (
          <p role="alert" className="rounded border border-destructive bg-destructive/10 p-2 text-xs text-destructive">
            Há rascunho NÃO CONFORME: assine para poder emitir a RNC ou registrar a ação corretiva imediata.
          </p>
        )}
        {resumo && <p className="text-xs text-success">{resumo}</p>}

        {!online ? (
          <p className="flex items-center gap-2 text-xs text-warning-foreground">
            <WifiOff className="h-4 w-4" /> Sem conexão: a assinatura precisa de internet. Os rascunhos continuam salvos neste aparelho.
          </p>
        ) : (
          <Button type="button" disabled={assinaveis.length === 0} onClick={() => { setResumo(null); setAssinando(true); }}>
            Assinar todos ({assinaveis.length})
          </Button>
        )}
      </CardContent>

      {assinando && (
        <ModalAssinaturaSenha
          titulo="Assinar todos os rascunhos"
          descricao={`Confirme sua senha para assinar eletronicamente ${assinaveis.length} monitoramento(s). Cada um é gravado com a hora em que foi realizado e assinado individualmente.`}
          textoConfirmar={`Assinar ${assinaveis.length}`}
          progresso={progresso}
          legendaProgresso="Gravando e assinando…"
          onAssinar={assinar}
          onCancelar={() => setAssinando(false)}
        />
      )}
    </Card>
  );
}
