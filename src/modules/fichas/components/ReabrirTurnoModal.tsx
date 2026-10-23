import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

export interface TurnoParaReabertura {
  id: string;
  user_id: string;
  setor: string | null;
  inicio: string;
  fim: string | null;
  encerrado_automaticamente: boolean;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" });
}

async function listarTurnos(dia: string): Promise<TurnoParaReabertura[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("turnos_para_reabertura", { p_dia: dia });
  if (error) throw error;
  return (data ?? []) as TurnoParaReabertura[];
}

async function reabrirTurno(turnoId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("reabrir_turno", { p_turno_id: turnoId });
  if (error) throw new Error(error.message);
}

/** Reabre o turno de um inspetor que foi finalizado por engano. Só aparece para ADMIN_MASTER e VERIFICADOR
 * (o banco confere o perfil de novo). Lista os turnos do dia escolhido e reabre o selecionado. */
export function ReabrirTurnoModal({
  diaInicial,
  usuarios,
  onFechar,
  onReaberto,
}: {
  diaInicial: string;
  usuarios: Map<string, string>;
  onFechar: () => void;
  onReaberto: (nomeInspetor: string) => void;
}) {
  const queryClient = useQueryClient();
  const [dia, setDia] = useState(diaInicial);
  const [erro, setErro] = useState<string | null>(null);

  const { data: turnos, isLoading, isError } = useQuery({
    queryKey: ["turnos_inspetores", "reabertura", dia],
    queryFn: () => listarTurnos(dia),
    enabled: Boolean(dia),
  });

  const reabrir = useMutation({
    mutationFn: async (turno: TurnoParaReabertura) => {
      await reabrirTurno(turno.id);
      return turno;
    },
    onSuccess: (turno) => {
      void queryClient.invalidateQueries({ queryKey: ["turnos_inspetores"] });
      onReaberto(usuarios.get(turno.user_id) ?? "inspetor");
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Reabrir turno" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="font-semibold">Reabrir turno</span>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <p>Escolha o dia e reabra o turno do inspetor que foi finalizado por engano. Ele volta a ficar em andamento e o inspetor pode continuar monitorando.</p>
          <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia do turno" />

          {erro && (
            <p role="alert" className="rounded-md border border-destructive bg-destructive/10 p-2 text-destructive">
              {erro}
            </p>
          )}

          {isLoading && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando turnos…
            </p>
          )}
          {isError && <p className="text-destructive">Não foi possível carregar os turnos deste dia.</p>}
          {turnos && turnos.length === 0 && <p className="text-muted-foreground">Nenhum turno iniciado neste dia.</p>}

          <ul className="space-y-2">
            {(turnos ?? []).map((t) => {
              const aberto = t.fim === null;
              return (
                <li key={t.id} data-testid={`turno-${t.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{usuarios.get(t.user_id) ?? "Inspetor"}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.setor ?? "Sem setor"} · início {hora(t.inicio)}
                      {t.fim && <> · fim {hora(t.fim)}</>}
                    </p>
                  </div>
                  {aberto ? (
                    <Badge variant="success">EM ANDAMENTO</Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      {t.encerrado_automaticamente && <Badge variant="warning">Encerrado automaticamente</Badge>}
                      <Button type="button" size="sm" variant="outline" disabled={reabrir.isPending} onClick={() => { setErro(null); reabrir.mutate(t); }}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reabrir
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
