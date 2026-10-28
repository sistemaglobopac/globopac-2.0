import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareWarning, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/store/session";
import { useOrdensProgramadas } from "./api";
import { lerCienciaObservacoes, registrarCienciaObservacoes } from "./cienciaObservacoes";
import { formatarData, formatarHora, observacoesParaCienciaDoPcm, ROTULO_RESULTADO, rotuloInspetorOuResp, situacaoPrazo, hojeManaus } from "./regras";

/** Modal das observações do inspetor para o programador do PCM: aparece quando ele loga e, com ele logado, assim que o inspetor inclui
 * uma observação numa OS (a lista se atualiza a cada 30 s e ao voltar para a aba). Mostra as OS cuja observação ele ainda não leu e que
 * ainda não reprogramou depois dela. "Estou ciente" registra a leitura neste aparelho; o X só fecha por enquanto — o modal volta quando
 * chegar uma observação nova, e as não lidas continuam no próximo acesso. */
export function ModalObservacoesPcm() {
  const perfilId = useSessionStore((s) => s.perfil?.id);
  const navigate = useNavigate();
  const { data: ordens } = useOrdensProgramadas();
  const [cientes, setCientes] = useState<ReadonlySet<string>>(() => (perfilId ? lerCienciaObservacoes(perfilId) : new Set()));
  // Observações que estavam na lista quando o PCM fechou no X: não reabrem o modal sozinhas, só uma observação nova.
  const [dispensadas, setDispensadas] = useState<ReadonlySet<string>>(new Set());

  const itens = useMemo(() => (ordens ? observacoesParaCienciaDoPcm(ordens, cientes) : []), [ordens, cientes]);
  const temNova = itens.some((i) => !dispensadas.has(i.verificacao.id));
  if (!perfilId || itens.length === 0 || !temNova) return null;

  function ciente(depois?: () => void) {
    const ids = itens.map((i) => i.verificacao.id);
    registrarCienciaObservacoes(perfilId!, ids);
    setCientes((atual) => new Set([...atual, ...ids]));
    depois?.();
  }

  function fecharPorEnquanto() {
    setDispensadas(new Set(itens.map((i) => i.verificacao.id)));
  }

  const hoje = hojeManaus();

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" data-testid="modal-observacoes-pcm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Observações do inspetor nas OS"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col rounded-xl border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <MessageSquareWarning className="h-5 w-5" /> Observações do inspetor nas OS ({itens.length})
          </span>
          <button type="button" onClick={fecharPorEnquanto} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">
            O inspetor deixou observação nestas OS e você ainda não reprogramou depois dela. Leia antes de seguir com a programação.
          </p>
          {itens.map(({ ordem, verificacao }) => {
            const prazo = situacaoPrazo(ordem.prazo_atual, hoje);
            return (
              <div key={ordem.id} className="space-y-2 rounded-lg border border-hairline p-3" data-testid={`obs-pcm-${ordem.numero_os}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">OS {ordem.numero_os}</Badge>
                  <Badge variant={prazo.vencido ? "destructive" : "info"}>
                    {prazo.texto} · prazo {formatarData(ordem.prazo_atual)}
                  </Badge>
                  <Badge variant={verificacao.resultado === "NC" ? "destructive" : "secondary"}>{ROTULO_RESULTADO[verificacao.resultado]}</Badge>
                </div>
                <p className="text-sm font-medium">{ordem.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {rotuloInspetorOuResp(ordem)}
                  {ordem.centro?.nome ?? ordem.setor}
                  {ordem.local_detalhe ? ` · ${ordem.local_detalhe}` : ""}
                </p>
                <div className="rounded-md border-l-4 border-warning bg-warning/10 p-2">
                  <p className="text-sm font-semibold">Obs. do inspetor: {verificacao.observacao}</p>
                  <p className="text-xs text-muted-foreground">
                    {verificacao.inspetor_nome} · {formatarData(verificacao.data_verificacao)} {formatarHora(verificacao.hora_verificacao)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={() => ciente(() => navigate("/bpf/pcm"))}>
            Ver na programação
          </Button>
          <Button type="button" onClick={() => ciente()}>
            Estou ciente
          </Button>
        </div>
      </div>
    </div>
  );
}
