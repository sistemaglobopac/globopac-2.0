import { Eye, Lock, ShieldAlert, Unlock } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ensureLocalTime } from "../utils/tempo";
import type { AppointmentDisplay } from "../utils/recordGrouping";

const STATUS_ROTULO: Record<AppointmentDisplay["status"], string> = {
  aguardando: "Aguardando verificação",
  adendo_pendente: "Aguardando assinatura do inspetor",
  verificado: "Verificado",
};

const STATUS_VARIANT: Record<AppointmentDisplay["status"], "outline" | "warning" | "success"> = {
  aguardando: "outline",
  adendo_pendente: "warning",
  verificado: "success",
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
  pacPorTemplateId: Map<string, string>;
  nomePorTemplateId: Map<string, string>;
  usersMap: Map<string, string>;
  blockedIds: Set<string>;
  isAdmin: boolean;
  onEncerrarTurno: (item: AppointmentDisplay) => void;
}

const STATUS_SEM_SELECAO: AppointmentDisplay["status"][] = ["adendo_pendente", "verificado"];

export function AuditRecordCard({
  item,
  selectedIds,
  toggleSelection,
  onPreview,
  pacPorTemplateId,
  nomePorTemplateId,
  usersMap,
  blockedIds,
  isAdmin,
  onEncerrarTurno,
}: AuditRecordCardProps) {
  const { appt } = item;
  const bloqueado = blockedIds.has(item.id);
  const selecionavel = !bloqueado && !STATUS_SEM_SELECAO.includes(item.status);
  const { datePt, time } = ensureLocalTime(appt.criado_em);
  const nomeFicha = nomePorTemplateId.get(appt.ficha_template_id) ?? "Ficha";
  const pac = pacPorTemplateId.get(appt.ficha_template_id) ?? "—";
  const inspetorNome = usersMap.get(appt.user_id) ?? "Inspetor";
  const campos = Object.entries(appt.dados_dinamicos).filter(([chave]) => chave !== "adendos");

  return (
    <div className={`space-y-2 rounded-lg border bg-card p-4 shadow-sm ${bloqueado ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
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
              {pac} · Monitoramento nº {item.ordemDia}
            </p>
            <p className="font-medium">{nomeFicha}</p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[item.status]}>{STATUS_ROTULO[item.status]}</Badge>
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
          <Button type="button" size="sm" variant="ghost" onClick={() => onPreview(item)}>
            <Eye className="h-3.5 w-3.5" />
            Ver
          </Button>
        </div>
      </div>

      {appt.capturado_em && (
        <p className="text-xs text-muted-foreground">
          Capturado offline em {new Date(appt.capturado_em).toLocaleString("pt-BR")} (informado pelo dispositivo,
          não verificado) — sincronizado em {new Date(appt.criado_em).toLocaleString("pt-BR")}.
        </p>
      )}

      {campos.length > 0 && (
        <dl className="grid grid-cols-1 gap-2 border-t pt-2 text-sm sm:grid-cols-2">
          {campos.map(([chave, valor]) => (
            <div key={chave}>
              <dt className="text-muted-foreground">{chave}</dt>
              <dd>{String(valor)}</dd>
            </div>
          ))}
        </dl>
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
