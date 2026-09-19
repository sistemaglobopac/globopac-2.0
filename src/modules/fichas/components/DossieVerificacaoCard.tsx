import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, FolderClosed, Lock, Unlock } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
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
  onImprimir: (item: AppointmentDisplay) => void;
  onVerDossie: (dossie: DossieVerificacao) => void;
  pacPorTemplateId: Map<string, string>;
  nomePorTemplateId: Map<string, string>;
  codigoPorTemplateId: Map<string, string>;
  usersMap: Map<string, string>;
  isAdmin: boolean;
  onEncerrarTurno: (dossie: DossieVerificacao) => void;
  onEncerrarTurnoItem: (item: AppointmentDisplay) => void;
}

/** Card agregado de um "dossiê" — N apontamentos horários da mesma ficha/inspetor/turno. É só
 * um RESUMO clicável (título, badges, "Apurações" pra expandir): a fila de verificação lista
 * dezenas de dossiês por dia, então o relatório completo de cada um não pode aparecer inteiro
 * aqui — fica atrás de "Ver Dados" (RelatorioModal, que já tem o botão Imprimir dentro) ou de
 * "Apurações", que revela os cards individuais (cada um continua com seu próprio "Ver"/
 * checkbox — agrupar N apontamentos não pode significar perder a capacidade de tratar UM deles
 * isoladamente). */
export function DossieVerificacaoCard({
  dossie,
  selectedIds,
  toggleSelection,
  toggleGroupSelection,
  onPreview,
  onImprimir,
  onVerDossie,
  pacPorTemplateId,
  nomePorTemplateId,
  codigoPorTemplateId,
  usersMap,
  isAdmin,
  onEncerrarTurno,
  onEncerrarTurnoItem,
}: DossieVerificacaoCardProps) {
  const [apuracoesAbertas, setApuracoesAbertas] = useState(false);
  const todasSelecionadas = dossie.ids.every((id) => selectedIds.has(id));
  const primeiroItem = dossie.items.at(0);
  const ultimoItem = dossie.items.at(-1);
  const primeiraHora = primeiroItem ? ensureLocalTime(primeiroItem.appt.criado_em).time : "—";
  const ultimaHora = ultimoItem ? ensureLocalTime(ultimoItem.appt.criado_em).time : "—";
  const nomeFicha = primeiroItem ? nomePorTemplateId.get(primeiroItem.appt.ficha_template_id) ?? dossie.codigo : dossie.codigo;

  return (
    <div
      className={`glass-panel rounded-xl border border-white/70 p-4 shadow-sm transition-shadow hover:shadow-md ${dossie.bloqueado ? "opacity-80" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {!dossie.bloqueado && (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={todasSelecionadas}
              onChange={() => toggleGroupSelection(dossie.ids)}
              aria-label="Selecionar todo o dossiê"
            />
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderClosed className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold leading-tight text-ink">{nomeFicha}</p>
              {dossie.codigo && <Badge variant="outline">{dossie.codigo}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{dossie.items.length} Monitoramentos</Badge>
              <Badge variant={dossie.bloqueado ? "warning" : "success"}>
                {dossie.bloqueado && <Lock className="mr-1 h-3 w-3" />}
                {dossie.bloqueado ? "Turno em Aberto" : "Turno Finalizado"}
              </Badge>
            </div>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <Badge variant="outline">{dossie.pac}</Badge>
              <span>· {dossie.setor} · {ensureLocalTime(`${dossie.dia}T12:00:00`).datePt} · {primeiraHora}–{ultimaHora}</span>
              <span>· {dossie.inspetorNome}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dossie.bloqueado && isAdmin && (
            <Button type="button" size="sm" variant="outline" className="border-destructive text-destructive" onClick={() => onEncerrarTurno(dossie)}>
              <Unlock className="h-3.5 w-3.5" />
              Encerrar Turno (Admin)
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => onVerDossie(dossie)}>
            <Eye className="h-3.5 w-3.5" />
            Ver Dados
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setApuracoesAbertas((atual) => !atual)}>
            Apurações
            {apuracoesAbertas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {apuracoesAbertas && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {dossie.items.map((item) => (
            <AuditRecordCard
              key={item.id}
              item={item}
              mode="verificacao"
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              onPreview={onPreview}
              onImprimir={onImprimir}
              pacPorTemplateId={pacPorTemplateId}
              nomePorTemplateId={nomePorTemplateId}
              codigoPorTemplateId={codigoPorTemplateId}
              usersMap={usersMap}
              blockedIds={dossie.bloqueado ? new Set(dossie.ids) : new Set()}
              isAdmin={isAdmin}
              onEncerrarTurno={onEncerrarTurnoItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
