import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { useSessionStore } from "@/store/session";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { DadosSolicitacao } from "./componentesBpf";
import { useAprovarSolicitacao, useReprovarSolicitacao, useSolicitacoes } from "./api";
import type { Solicitacao } from "./tipos";

function CartaoAprovacao({ ss }: { ss: Solicitacao }) {
  const dialog = useAppDialog();
  const meuId = useSessionStore((s) => s.perfil?.id);
  const aprovar = useAprovarSolicitacao();
  const reprovar = useReprovarSolicitacao();
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const propria = ss.aberta_por === meuId;

  function confirmarAprovacao() {
    dialog.confirm({
      titulo: "Assinar e aprovar a solicitação?",
      mensagem: `Ao aprovar, a SS ${String(ss.numero).padStart(4, "0")} é assinada eletronicamente em seu nome (data, hora e código de verificação gravados pelo sistema) e segue para o PCM programar.`,
      icone: "info",
      aoConfirmar: () =>
        aprovar.mutate(ss.id, {
          onSuccess: () => dialog.sucesso("Solicitação aprovada e enviada ao PCM.", "Assinada"),
          onError: (erro) => dialog.erro(erro, "Não foi possível aprovar"),
        }),
    });
  }

  function enviarReprovacao() {
    if (motivo.trim().length < 5) {
      dialog.alert({ titulo: "Informe o motivo", mensagem: "Escreva por que a solicitação está sendo reprovada.", icone: "warning" });
      return;
    }
    reprovar.mutate(
      { id: ss.id, motivo },
      {
        onSuccess: () => {
          setReprovando(false);
          setMotivo("");
        },
        onError: (erro) => dialog.erro(erro, "Não foi possível reprovar"),
      }
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <DadosSolicitacao ss={ss} />
        {propria && (
          <p className="text-xs text-warning">Você abriu esta solicitação; por segregação de funções, outro administrador precisa aprová-la.</p>
        )}
        {reprovando ? (
          <div className="space-y-2">
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Motivo da reprovação"
              aria-label="Motivo da reprovação"
            />
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="sm" onClick={enviarReprovacao} disabled={reprovar.isPending}>
                Confirmar reprovação
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReprovando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={confirmarAprovacao} disabled={propria || aprovar.isPending}>
              Assinar e aprovar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setReprovando(true)} disabled={propria}>
              Reprovar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Conteudo() {
  const { data: aguardando, isLoading } = useSolicitacoes({ status: ["AGUARDANDO_APROVACAO"] });
  const { data: decididas } = useSolicitacoes({ status: ["APROVADA", "REPROVADA", "PROGRAMADA"], limite: 20 });

  return (
    <>
      <CabecalhoBpf
        titulo="Aprovação de solicitações de serviço"
        descricao="Confira o que o inspetor encontrou e assine. Depois da assinatura, a solicitação chega ao PCM."
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link to="/bpf/importar">Importar OS já programadas</Link>
          </Button>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Aguardando sua assinatura ({(aguardando ?? []).length})</h2>
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && (aguardando ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma solicitação pendente.</p>}
        {(aguardando ?? []).map((ss) => (
          <CartaoAprovacao key={ss.id} ss={ss} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Decididas recentemente</h2>
        {(decididas ?? []).map((ss) => (
          <Card key={ss.id}>
            <CardContent className="p-4">
              <DadosSolicitacao ss={ss} mostrarAssinatura />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}

export function AprovacoesPage() {
  return (
    <PaginaBpf>
      <Conteudo />
    </PaginaBpf>
  );
}
