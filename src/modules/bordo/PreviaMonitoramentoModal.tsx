import { X } from "lucide-react";
import { DadosColetados } from "@/modules/fichas/components/DadosColetadosFicha";
import { useUsuariosMap } from "@/modules/fichas/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { usePreviaMonitoramento, type PreviaMonitoramento } from "./api";

function dataHoraManaus(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Situacao({ m }: { m: PreviaMonitoramento }) {
  if (m.situacao_conformidade === "TRATADO") return <Badge className="border-transparent bg-lime text-primary">TRATADO</Badge>;
  if (m.situacao_conformidade === "NAO_CONFORME") return <Badge variant="destructive">NÃO CONFORME</Badge>;
  if (m.situacao_conformidade === "CONFORME") return <Badge className="border-transparent bg-success/15 text-success">CONFORME</Badge>;
  return <Badge variant="warning">Aguardando verificação</Badge>;
}

/** Prévia somente leitura de um monitoramento do turno (sem editar, assinar nem verificar). */
export function PreviaMonitoramentoModal({ monitoramentoId, onFechar }: { monitoramentoId: string; onFechar: () => void }) {
  const { data: m, isLoading, isError } = usePreviaMonitoramento(monitoramentoId);
  const { data: nomes } = useUsuariosMap();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Prévia do monitoramento" data-testid="previa-monitoramento">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Prévia do monitoramento · somente leitura</p>
            <p className="truncate font-semibold">{m?.ficha ? `${m.ficha.codigo} - ${m.ficha.nome}` : "Monitoramento"}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar prévia" className="shrink-0 opacity-80 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {isError && <p className="text-sm text-destructive">Não foi possível carregar este monitoramento.</p>}
          {!isLoading && !isError && !m && <p className="text-sm text-muted-foreground">Monitoramento não encontrado ou sem permissão para vê-lo.</p>}
          {m && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>
                  <span className="text-muted-foreground">Inspetor: </span>
                  <strong>{nomes?.get(m.user_id) ?? "—"}</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">Setor: </span>
                  <strong>{m.setor}</strong>
                </span>
                <span>
                  <span className="text-muted-foreground">Realizado em: </span>
                  <strong>{dataHoraManaus(m.hora_monitoramento ?? m.criado_em)}</strong>
                </span>
                <Situacao m={m} />
              </div>
              <DadosColetados
                dadosDinamicos={m.dados_dinamicos}
                campos={m.ficha?.schema_campos ?? []}
                registro={{ criado_em: m.criado_em, finalizado_em: m.finalizado_em }}
              />
            </>
          )}
        </div>

        <div className="border-t p-3 text-center">
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
