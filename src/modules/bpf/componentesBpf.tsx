import { Badge } from "@/shared/ui/badge";
import { FotosDaSolicitacao } from "./FotosSolicitacao";
import { formatarData, formatarDataHora, hashCurto } from "./regras";
import type { Solicitacao, StatusSolicitacao } from "./tipos";

const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADA: "Aprovada — aguardando PCM",
  REPROVADA: "Reprovada",
  PROGRAMADA: "Programada pelo PCM",
};

const VARIANTE_STATUS: Record<StatusSolicitacao, "warning" | "info" | "destructive" | "success"> = {
  AGUARDANDO_APROVACAO: "warning",
  APROVADA: "info",
  REPROVADA: "destructive",
  PROGRAMADA: "success",
};

export function BadgeStatusSolicitacao({ status }: { status: StatusSolicitacao }) {
  return <Badge variant={VARIANTE_STATUS[status]}>{ROTULO_STATUS[status]}</Badge>;
}

/** Dados da SS exibidos da mesma forma para o inspetor, o administrador e o PCM. */
export function DadosSolicitacao({ ss, mostrarAssinatura }: { ss: Solicitacao; mostrarAssinatura?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">SS {String(ss.numero).padStart(4, "0")}</Badge>
        {ss.centro && <Badge variant="secondary">{ss.centro.nome}</Badge>}
        <Badge variant="outline">{ss.categoria}</Badge>
        <BadgeStatusSolicitacao status={ss.status} />
      </div>
      <p className="pt-1 text-sm font-medium">{ss.descricao}</p>
      {ss.local_detalhe && <p className="text-xs text-muted-foreground">Local: {ss.local_detalhe}</p>}
      <p className="text-xs text-muted-foreground">
        Constatada em {formatarDataHora(ss.constatado_em)} por {ss.aberta_por_nome}
      </p>
      {ss.editada_em && (
        <p className="text-xs text-muted-foreground">
          Texto ajustado pelo administrador {ss.editada_por_nome} em {formatarDataHora(ss.editada_em)}
        </p>
      )}
      <FotosDaSolicitacao solicitacaoId={ss.id} />
      {ss.status === "REPROVADA" && ss.motivo_reprovacao && (
        <p className="text-xs text-destructive">
          Reprovada por {ss.reprovada_por_nome} em {formatarData(ss.reprovada_em)}: {ss.motivo_reprovacao}
        </p>
      )}
      {mostrarAssinatura && ss.aprovada_por_nome && (
        <p className="text-xs text-muted-foreground">
          Aprovada por {ss.aprovada_por_nome} em {formatarDataHora(ss.aprovada_em)} · assinatura {hashCurto(ss.hash_aprovacao)}
        </p>
      )}
    </div>
  );
}
