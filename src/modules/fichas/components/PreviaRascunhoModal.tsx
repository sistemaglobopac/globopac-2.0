import { X } from "lucide-react";
import type { Rascunho } from "@/lib/rascunhos";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useTemplatesAtivos } from "../api";
import { DadosColetados } from "./DadosColetadosFicha";

const dataHoraManaus = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Prévia somente leitura de um RASCUNHO (monitoramento preenchido neste aparelho e ainda não assinado): o inspetor confere o que
 * preencheu antes de assinar, sem editar. Os campos vêm do template da ficha (a versão do rascunho; se ela já não está ativa, a
 * versão ativa de mesmo código). */
export function PreviaRascunhoModal({ rascunho, onFechar }: { rascunho: Rascunho; onFechar: () => void }) {
  const { data: templates, isLoading } = useTemplatesAtivos();
  const template = templates?.find((t) => t.id === rascunho.fichaTemplateId) ?? templates?.find((t) => t.codigo === rascunho.codigo);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Prévia do rascunho" data-testid="previa-rascunho">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Prévia do rascunho · somente leitura · ainda não assinado</p>
            <p className="truncate font-semibold">{`${rascunho.codigo} - ${rascunho.nomeFicha}`}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar prévia" className="shrink-0 opacity-80 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Setor: </span>
              <strong>{rascunho.setor}</strong>
            </span>
            <span>
              <span className="text-muted-foreground">Realizado em: </span>
              <strong>{dataHoraManaus(rascunho.horaMonitoramento)}</strong>
            </span>
            <Badge variant="warning">Aguardando assinatura</Badge>
            {rascunho.naoConforme && <Badge variant="destructive">NÃO CONFORME</Badge>}
          </div>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && !template && <p className="text-sm text-muted-foreground">Não foi possível montar a prévia: a ficha deste rascunho não está mais disponível.</p>}
          {template && (
            <DadosColetados
              dadosDinamicos={rascunho.dadosDinamicos}
              campos={template.schema_campos}
              registro={{ criado_em: rascunho.salvoEm, finalizado_em: null }}
            />
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
