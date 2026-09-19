import { Layers, Lock, Unlock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { AppointmentDisplay, DossieVerificacao } from "../utils/recordGrouping";
import { ensureLocalTime } from "../utils/tempo";
import { AuditRecordCard } from "./AuditRecordCard";

interface DossieVerificacaoCardProps {
  dossie: DossieVerificacao;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  toggleGroupSelection: (ids: string[]) => void;
  onPreview: (item: AppointmentDisplay) => void;
  pacPorTemplateId: Map<string, string>;
  nomePorTemplateId: Map<string, string>;
  usersMap: Map<string, string>;
  isAdmin: boolean;
  onEncerrarTurno: (dossie: DossieVerificacao) => void;
  onEncerrarTurnoItem: (item: AppointmentDisplay) => void;
}

/** Card agregado de um "dossiê" — N apontamentos horários da mesma ficha/inspetor/turno,
 * selecionáveis em bloco para a assinatura em lote (checkbox do cabeçalho) e também
 * individualmente inspecionáveis/reprováveis (cada apontamento continua sendo o mesmo
 * AuditRecordCard usado fora de um dossiê, com seu próprio "Ver"/checkbox) — agrupar N
 * apontamentos não pode significar perder a capacidade de tratar UM deles isoladamente. */
export function DossieVerificacaoCard({
  dossie,
  selectedIds,
  toggleSelection,
  toggleGroupSelection,
  onPreview,
  pacPorTemplateId,
  nomePorTemplateId,
  usersMap,
  isAdmin,
  onEncerrarTurno,
  onEncerrarTurnoItem,
}: DossieVerificacaoCardProps) {
  const todasSelecionadas = dossie.ids.every((id) => selectedIds.has(id));
  const primeiroItem = dossie.items.at(0);
  const ultimoItem = dossie.items.at(-1);
  const primeiraHora = primeiroItem ? ensureLocalTime(primeiroItem.appt.criado_em).time : "—";
  const ultimaHora = ultimoItem ? ensureLocalTime(ultimoItem.appt.criado_em).time : "—";

  return (
    <div className={`space-y-3 rounded-lg border-2 border-dashed bg-muted/20 p-4 shadow-sm ${dossie.bloqueado ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {!dossie.bloqueado && (
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={todasSelecionadas}
              onChange={() => toggleGroupSelection(dossie.ids)}
              aria-label="Selecionar todo o dossiê"
            />
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">
              {dossie.pac} · {dossie.turno} · {dossie.items.length} apontamentos
            </p>
            <p className="font-medium">
              {dossie.codigo} — {dossie.inspetorNome}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {dossie.setor} · {primeiraHora}–{ultimaHora}
        </span>
        {dossie.bloqueado && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-warning">
              <Lock className="h-3.5 w-3.5" />
              Turno do inspetor ainda em aberto
            </span>
            {isAdmin && (
              <Button type="button" size="sm" variant="outline" onClick={() => onEncerrarTurno(dossie)}>
                <Unlock className="h-3.5 w-3.5" />
                Encerrar turno
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        {dossie.items.map((item) => (
          <AuditRecordCard
            key={item.id}
            item={item}
            mode="verificacao"
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
            onPreview={onPreview}
            pacPorTemplateId={pacPorTemplateId}
            nomePorTemplateId={nomePorTemplateId}
            usersMap={usersMap}
            blockedIds={dossie.bloqueado ? new Set(dossie.ids) : new Set()}
            isAdmin={isAdmin}
            onEncerrarTurno={onEncerrarTurnoItem}
          />
        ))}
      </div>
    </div>
  );
}
