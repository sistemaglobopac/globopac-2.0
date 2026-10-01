import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { estaAtrasada, useRncsAbertas, type Rnc } from "./api";

const CHAVE_DISPENSADOS = "globopac.rnc-gestor.dispensados";

function lerDispensados(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CHAVE_DISPENSADOS) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Alerta em card para o GESTOR_SETOR: cada RNC que espera a resposta dele (aberta, reaberta ou
 * devolvida pelo Verificador) aparece num card no canto da tela, em qualquer página. Clicar no
 * card abre a RNC para responder (causa do desvio + ação corretiva + anexos). A chave de
 * dispensa inclui o status: uma RNC devolvida de novo volta a alertar. */
export function AlertaRncGestor() {
  const perfil = useSessionStore((s) => s.perfil);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ehGestor = perfil?.nivelAcesso === "GESTOR_SETOR";
  const { data: rncs } = useRncsAbertas({ habilitado: ehGestor });
  const [dispensados, setDispensados] = useState<Set<string>>(lerDispensados);

  // Realtime: uma RNC nova/devolvida aparece na hora, sem esperar o polling de 30s.
  useEffect(() => {
    if (!ehGestor) return;
    const canal = supabase
      .channel("alerta-rnc-gestor")
      .on("postgres_changes", { event: "*", schema: "public", table: "rnc" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["rnc"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [ehGestor, queryClient]);

  const chave = (rnc: Rnc) => `${rnc.id}:${rnc.status}`;
  const paraResponder = useMemo(
    () => (rncs ?? []).filter((r) => r.status !== "TRATADA" && !dispensados.has(chave(r))),
    [rncs, dispensados]
  );

  function dispensar(rnc: Rnc) {
    setDispensados((atual) => {
      const novo = new Set(atual).add(chave(rnc));
      try {
        sessionStorage.setItem(CHAVE_DISPENSADOS, JSON.stringify([...novo]));
      } catch {
        // sem sessionStorage (modo privado): a dispensa vale só até recarregar.
      }
      return novo;
    });
  }

  if (!ehGestor || paraResponder.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9000] flex max-h-[80dvh] w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto" data-testid="alerta-rnc-gestor">
      {paraResponder.map((rnc) => {
        const devolvida = rnc.status === "DEVOLVIDA";
        return (
          <div key={rnc.id} className="relative rounded-xl border-2 border-destructive bg-background shadow-2xl">
            <button
              type="button"
              aria-label="Dispensar alerta"
              className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted"
              onClick={() => dispensar(rnc)}
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="block w-full rounded-xl p-4 pr-8 text-left hover:bg-destructive/5"
              onClick={() => {
                dispensar(rnc);
                navigate(`/rnc?foco=${rnc.id}`);
              }}
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-4 w-4 animate-pulse" />
                {devolvida ? "RNC devolvida — responda novamente" : "Nova RNC para responder"}
              </span>
              <span className="mt-1 block text-sm font-bold text-foreground">
                {rnc.setor} · {rnc.severidade}
              </span>
              <span className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{rnc.descricao}</span>
              {rnc.acao_imediata && (
                <span className="mt-1 line-clamp-2 block rounded bg-primary/5 p-1.5 text-xs">
                  <strong>Ação imediata do inspetor:</strong> {rnc.acao_imediata}
                </span>
              )}
              <span className="mt-2 block text-xs">
                Prazo: {new Date(rnc.prazo_sla).toLocaleString("pt-BR")}
                {estaAtrasada(rnc) && <strong className="ml-1 text-destructive">SLA VENCIDO</strong>}
              </span>
              <span className="mt-2 block text-xs font-semibold text-primary">Clique para responder →</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
