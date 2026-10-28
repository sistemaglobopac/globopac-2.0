import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { DadosSolicitacao } from "./componentesBpf";
import { useAprovarSolicitacao, useEditarSolicitacao, useReprovarSolicitacao, useSolicitacoes } from "./api";
import { RelatorioPorData } from "./RelatorioPorData";
import { CATEGORIAS_BPF, CODIGO_FICHA_BPF, NOME_RELATORIO_BPF, PAC_BPF, type Solicitacao } from "./tipos";

function CartaoAprovacao({ ss }: { ss: Solicitacao }) {
  const dialog = useAppDialog();
  const meuId = useSessionStore((s) => s.perfil?.id);
  const aprovar = useAprovarSolicitacao();
  const reprovar = useReprovarSolicitacao();
  const editar = useEditarSolicitacao();
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState(false);
  const [descricao, setDescricao] = useState(ss.descricao);
  const [local, setLocal] = useState(ss.local_detalhe ?? "");
  const [categoria, setCategoria] = useState(ss.categoria);
  const propria = ss.aberta_por === meuId;
  // Se o tipo gravado não está mais na lista (ou veio de outra versão), mantém-no como opção.
  const tipos = (CATEGORIAS_BPF as readonly string[]).includes(ss.categoria) ? [...CATEGORIAS_BPF] : [ss.categoria, ...CATEGORIAS_BPF];

  function abrirEdicao() {
    setDescricao(ss.descricao);
    setLocal(ss.local_detalhe ?? "");
    setCategoria(ss.categoria);
    setEditando(true);
  }

  function salvarEdicao() {
    if (descricao.trim().length < 10 || !categoria) {
      dialog.alert({
        titulo: "Preencha os campos obrigatórios",
        mensagem: "Informe o tipo da não conformidade e a descrição (mínimo de 10 caracteres).",
        icone: "warning",
      });
      return;
    }
    editar.mutate(
      { id: ss.id, descricao, localDetalhe: local, categoria },
      {
        onSuccess: () => setEditando(false),
        onError: (erro) => dialog.erro(erro, "Não foi possível salvar a edição"),
      }
    );
  }

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
        {editando ? (
          <div className="space-y-3 rounded-lg border border-hairline p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`ed-tipo-${ss.id}`}>Tipo de não conformidade</Label>
                <Select id={`ed-tipo-${ss.id}`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {tipos.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`ed-local-${ss.id}`}>Onde exatamente</Label>
                <Input id={`ed-local-${ss.id}`} value={local} onChange={(e) => setLocal(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ed-desc-${ss.id}`}>Descrição da não conformidade</Label>
              <Textarea id={`ed-desc-${ss.id}`} rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              O ajuste fica registrado (quem alterou, quando e o texto anterior) e a assinatura vale para o texto já ajustado.
            </p>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={salvarEdicao} disabled={editar.isPending}>
                {editar.isPending ? "Salvando…" : "Salvar ajuste"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={editar.isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DadosSolicitacao ss={ss} />
            <Button type="button" size="sm" variant="ghost" onClick={abrirEdicao} disabled={reprovando}>
              <Pencil className="h-4 w-4" /> Editar texto, local e tipo
            </Button>
          </>
        )}
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
            <Button type="button" size="sm" onClick={confirmarAprovacao} disabled={propria || aprovar.isPending || editando}>
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

function AbaSolicitacoes() {
  const { data: aguardando, isLoading } = useSolicitacoes({ status: ["AGUARDANDO_APROVACAO"] });
  const { data: decididas } = useSolicitacoes({ status: ["APROVADA", "REPROVADA", "PROGRAMADA"], limite: 20 });

  return (
    <>
      <CabecalhoBpf
        titulo="Painel de Infraestrutura e Equipamentos"
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

type Aba = "solicitacoes" | "relatorio";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "solicitacoes", rotulo: "Solicitações" },
  { id: "relatorio", rotulo: "Relatório" },
];

/** Aprovação das solicitações e relatório diário de OS na mesma tela do administrador. A aba Relatório não mostra nada pronto: o
 * administrador escolhe a data e gera. Quem gera o relatório é ele, não o inspetor (que só verifica as OS e encerra o dia). */
function Conteudo() {
  const [aba, setAba] = useState<Aba>("solicitacoes");
  return (
    <>
      <div role="tablist" aria-label="Aprovação de solicitações e relatório" className="flex gap-2 border-b border-hairline print:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-bpf-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls="painel-bpf"
            onClick={() => setAba(a.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-semibold",
              aba === a.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      <div id="painel-bpf" role="tabpanel" aria-labelledby={`aba-bpf-${aba}`} className="space-y-6">
        {aba === "solicitacoes" ? (
          <AbaSolicitacoes />
        ) : (
          <>
            <CabecalhoBpf titulo={NOME_RELATORIO_BPF} descricao={`${CODIGO_FICHA_BPF} · ${PAC_BPF} — escolha a data e gere o relatório.`} />
            <RelatorioPorData />
          </>
        )}
      </div>
    </>
  );
}

export function AprovacoesPage() {
  return (
    <PaginaBpf larga>
      <Conteudo />
    </PaginaBpf>
  );
}
