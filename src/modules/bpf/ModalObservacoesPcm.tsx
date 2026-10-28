import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareWarning, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/store/session";
import { useOrdensProgramadas } from "./api";
import { lerCienciaObservacoes, registrarCienciaObservacoes } from "./cienciaObservacoes";
import { formatarData, formatarHora, observacoesParaCienciaDoPcm, ROTULO_RESULTADO, rotuloInspetorOuResp, situacaoPrazo, hojeManaus } from "./regras";

/** Modal de entrada do programador do PCM: assim que ele loga, vê as OS em que o inspetor deixou observação e que ele ainda não leu
 * (ou que ainda não reprogramou depois da observação). "Estou ciente" registra a leitura neste aparelho e o modal só volta a mostrar
 * observações novas; fechar no X mantém tudo para o próximo acesso. Aparece uma vez por abertura do sistema, sem interromper o
 * trabalho quando uma observação chega depois. */
export function ModalObservacoesPcm() {
  const perfilId = useSessionStore((s) => s.perfil?.id);
  const navigate = useNavigate();
  const { data: ordens } = useOrdensProgramadas();
  const [fechado, setFechado] = useState(false);
  // A lista congela na primeira vez em que há o que mostrar: observação que chega depois fica para o próximo acesso (o Painel do PCM a destaca).
  const congelada = useRef<ReturnType<typeof observacoesParaCienciaDoPcm> | null>(null);
  const calculada = useMemo(
    () => (ordens && perfilId ? observacoesParaCienciaDoPcm(ordens, lerCienciaObservacoes(perfilId)) : null),
    [ordens, perfilId]
  );
  if (congelada.current === null && calculada && calculada.length > 0) congelada.current = calculada;

  const itens = congelada.current;
  if (fechado || !perfilId || !itens || itens.length === 0) return null;

  function ciente(depois?: () => void) {
    registrarCienciaObservacoes(perfilId!, itens!.map((i) => i.verificacao.id));
    setFechado(true);
    depois?.();
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
          <button type="button" onClick={() => setFechado(true)} aria-label="Fechar">
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
