import { Eye, Lock, Printer, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { instanteDoRegistro } from "../utils/horaMonitoramento";
import { ensureLocalTime } from "../utils/tempo";
import type { AppointmentDisplay } from "../utils/recordGrouping";
import type { StatusRnc } from "@/modules/rnc/api";

const STATUS_ROTULO: Record<AppointmentDisplay["status"], string> = {
  aguardando: "Aguardando verificação",
  adendo_pendente: "Aguardando assinatura do inspetor",
  verificado: "Verificado",
};

const STATUS_VARIANT: Record<AppointmentDisplay["status"], "info" | "warning" | "success"> = {
  aguardando: "info",
  adendo_pendente: "warning",
  verificado: "success",
};

const STATUS_BORDA: Record<AppointmentDisplay["status"], string> = {
  aguardando: "border-l-primary",
  adendo_pendente: "border-l-warning",
  verificado: "border-l-success",
};

/** Card individual de monitoramento — reutilizável entre o modo "verificacao" (fila de QA) e,
 * futuramente, outros modos de listagem (ex.: "sif", "relatorio") que também precisam exibir
 * um apontamento com o mesmo layout base. */
export interface AuditRecordCardProps {
  item: AppointmentDisplay;
  mode: "verificacao";
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  onPreview: (item: AppointmentDisplay) => void;
  onImprimir: (item: AppointmentDisplay) => void;
  pacPorTemplateId: Map<string, string>;
  nomePorTemplateId: Map<string, string>;
  codigoPorTemplateId: Map<string, string>;
  usersMap: Map<string, string>;
  blockedIds: Set<string>;
  isAdmin: boolean;
  /** Status da RNC vinculada a este monitoramento (se houver). RNC FECHADA = desvio procedente e tratado. */
  rncStatus?: StatusRnc;
  /** Monitoramento com autocorreção imediata do inspetor (alternativa à RNC). */
  autocorrigido?: boolean;
  onEncerrarTurno: (item: AppointmentDisplay) => void;
}

const STATUS_SEM_SELECAO: AppointmentDisplay["status"][] = ["adendo_pendente", "verificado"];

export function AuditRecordCard({
  item,
  selectedIds,
  toggleSelection,
  onPreview,
  onImprimir,
  pacPorTemplateId,
  nomePorTemplateId,
  codigoPorTemplateId,
  usersMap,
  blockedIds,
  isAdmin,
  rncStatus,
  autocorrigido,
  onEncerrarTurno,
}: AuditRecordCardProps) {
  const { appt } = item;
  const bloqueado = blockedIds.has(item.id);
  const selecionavel = !bloqueado && !STATUS_SEM_SELECAO.includes(item.status);
  const { datePt, time } = ensureLocalTime(instanteDoRegistro(appt));
  const nomeFicha = nomePorTemplateId.get(appt.ficha_template_id) ?? "Ficha";
  const pac = pacPorTemplateId.get(appt.ficha_template_id) ?? "—";
  const codigo = codigoPorTemplateId.get(appt.ficha_template_id);
  const inspetorNome = usersMap.get(appt.user_id) ?? "Inspetor";

  return (
    <div
      data-testid={`registro-verificacao-${item.id}`}
      className={`glass-panel space-y-2 rounded-lg border border-white/70 border-l-4 p-4 shadow-sm ${STATUS_BORDA[item.status]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {selecionavel && (
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selectedIds.has(item.id)}
              onChange={() => toggleSelection(item.id)}
              aria-label="Selecionar para assinatura em lote"
            />
          )}
          <div>
            <p className="text-xs uppercase text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{pac}</span>
              {" · Monitoramento nº "}
              {item.ordemDia}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-medium">{nomeFicha}</p>
              {codigo && <Badge variant="outline">{codigo}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {autocorrigido && <Badge className="border-transparent bg-lime text-primary">AUTOCORRIGIDO</Badge>}
          {rncStatus === "FECHADA" && <Badge className="border-transparent bg-lime text-primary">TRATADO</Badge>}
          {rncStatus && rncStatus !== "FECHADA" && <Badge variant="warning">RNC em andamento</Badge>}
          {item.status !== "verificado" && <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_ROTULO[item.status]}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {inspetorNome} · {datePt} {time} · {appt.setor}
        </span>
        <div className="flex items-center gap-2">
          {bloqueado && (
            <span className="flex items-center gap-1 text-xs font-medium text-warning">
              <Lock className="h-3.5 w-3.5" />
              Turno do inspetor ainda em aberto
            </span>
          )}
          {bloqueado && isAdmin && (
            <Button type="button" size="sm" variant="outline" onClick={() => onEncerrarTurno(item)}>
              <Unlock className="h-3.5 w-3.5" />
              Encerrar turno
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => onImprimir(item)}>
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </Button>
          {item.status === "verificado" ? (
            <>
              <Badge className="border-transparent bg-lime text-primary">VERIFICADO</Badge>
              <Button type="button" size="sm" variant="outline" onClick={() => onPreview(item)}>
                <Eye className="h-3.5 w-3.5" />
                Ver
              </Button>
            </>
          ) : (
            // Turno em aberto: só prévia (a tela de verificação esconde as ações até o turno fechar).
            <Button type="button" size="sm" variant={bloqueado ? "outline" : "default"} onClick={() => onPreview(item)}>
              {bloqueado ? <Eye className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {bloqueado ? "Prévia" : "Verificar"}
            </Button>
          )}
        </div>
      </div>

      {appt.capturado_em && (
        <p className="text-xs text-muted-foreground">
          Capturado offline em {new Date(appt.capturado_em).toLocaleString("pt-BR")} (informado pelo dispositivo,
          não verificado) — sincronizado em {new Date(appt.criado_em).toLocaleString("pt-BR")}.
        </p>
      )}

      {appt.conformidade === false && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <ShieldAlert className="h-3.5 w-3.5" />
          Reprovado — RNC aberta automaticamente
        </p>
      )}
    </div>
  );
}
