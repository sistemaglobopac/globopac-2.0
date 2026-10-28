import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { useSessionStore } from "@/store/session";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { DadosSolicitacao, SeletorEspecialidade } from "./componentesBpf";
import { Select } from "@/shared/ui/select";
import { contarPorEspecialidade, ESPECIALIDADES_BPF, FILTRO_SEM_CLASSIFICACAO, FILTRO_TODAS, filtrarPorEspecialidade, SEM_ESPECIALIDADE } from "./especialidades";
import { ListaImpressaAProgramar, ListaImpressaDevolvidas, ListaImpressaProgramadas } from "./ListasImpressasPcm";
import { useOrdensProgramadas, useProgramarSolicitacao, useReprogramarOrdem, useSolicitacoes } from "./api";
import { devolucaoAoPcm, formatarData, hojeManaus, rotuloInspetorOuResp, rotuloProgramacao, situacaoPrazo, ultimaObservacaoDoInspetor } from "./regras";
import type { Ordem, Solicitacao } from "./tipos";

function CartaoProgramar({ ss }: { ss: Solicitacao }) {
  const dialog = useAppDialog();
  const nome = useSessionStore((s) => s.perfil?.nomeCompleto ?? "");
  const programar = useProgramarSolicitacao();
  const [aberto, setAberto] = useState(false);
  const [numeroOs, setNumeroOs] = useState("");
  const [acao, setAcao] = useState("");
  const [responsavel, setResponsavel] = useState(nome.trim().split(/\s+/)[0] ?? "");
  const [prazo, setPrazo] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!numeroOs.trim() || acao.trim().length < 5 || !prazo) {
      dialog.alert({
        titulo: "Preencha a programação",
        mensagem: "Informe o número da OS, a ação que será executada para sanar a não conformidade e o prazo.",
        icone: "warning",
      });
      return;
    }
    programar.mutate(
      { solicitacaoId: ss.id, numeroOs, acaoCorretiva: acao, responsavel, prazo },
      {
        onSuccess: () => dialog.sucesso(`OS ${numeroOs.trim()} programada para ${formatarData(prazo)}. Ela já entra no monitoramento diário do inspetor.`, "OS programada"),
        onError: (erro) => dialog.erro(erro, "Não foi possível programar"),
      }
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <DadosSolicitacao ss={ss} mostrarAssinatura />
        <SeletorEspecialidade tipo="solicitacao" id={ss.id} valor={ss.especialidade} />
        {!aberto ? (
          <Button type="button" size="sm" onClick={() => setAberto(true)}>
            Programar OS
          </Button>
        ) : (
          <form onSubmit={enviar} className="space-y-3 rounded-lg border border-hairline p-3" noValidate>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`os-${ss.id}`}>Nº da OS</Label>
                <Input id={`os-${ss.id}`} value={numeroOs} onChange={(e) => setNumeroOs(e.target.value)} placeholder="Ex.: 463597" />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`resp-${ss.id}`}>Responsável</Label>
                <Input id={`resp-${ss.id}`} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`prazo-${ss.id}`}>Prazo de execução</Label>
                <Input id={`prazo-${ss.id}`} type="date" min={hojeManaus()} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`acao-${ss.id}`}>O que será feito para sanar a não conformidade</Label>
              <Textarea id={`acao-${ss.id}`} rows={2} value={acao} onChange={(e) => setAcao(e.target.value)} placeholder="Ação corretiva programada" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={programar.isPending}>
                {programar.isPending ? "Programando…" : "Assinar e programar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CartaoOsProgramada({ ordem }: { ordem: Ordem }) {
  const dialog = useAppDialog();
  const hoje = hojeManaus();
  const reprogramar = useReprogramarOrdem();
  const prazo = situacaoPrazo(ordem.prazo_atual, hoje);
  const devolucao = devolucaoAoPcm(ordem);
  // Observação do inspetor em qualquer resultado (até dentro do prazo); a da devolução já aparece no aviso vermelho.
  const observacao = ultimaObservacaoDoInspetor(ordem);
  const observacaoAparte = observacao && observacao.id !== devolucao?.id ? observacao : null;
  const [aberto, setAberto] = useState(false);
  const [novoPrazo, setNovoPrazo] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [acao, setAcao] = useState("");
  const [responsavel, setResponsavel] = useState("");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!novoPrazo || justificativa.trim().length < 10) {
      dialog.alert({
        titulo: "Preencha a reprogramação",
        mensagem: "Informe o novo prazo e a justificativa (mínimo de 10 caracteres). Ela aparece no relatório enviado ao SIF.",
        icone: "warning",
      });
      return;
    }
    reprogramar.mutate(
      { ordemId: ordem.id, novoPrazo, justificativa, acaoCorretiva: acao, responsavel },
      {
        onSuccess: () => {
          setAberto(false);
          setNovoPrazo("");
          setJustificativa("");
          setAcao("");
          setResponsavel("");
        },
        onError: (erro) => dialog.erro(erro, "Não foi possível reprogramar"),
      }
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">OS {ordem.numero_os}</Badge>
          {ordem.centro && <Badge variant="secondary">{ordem.centro.nome}</Badge>}
          {ordem.especialidade && <Badge variant="outline">{ordem.especialidade}</Badge>}
          <Badge variant={prazo.vencido ? "destructive" : "info"}>
            {prazo.texto} · {formatarData(ordem.prazo_atual)}
          </Badge>
          {ordem.reprogramacoes > 0 && <Badge variant="warning">Reprogramada {ordem.reprogramacoes}×</Badge>}
          {ordem.origem === "importada" && <Badge variant="outline">Importada</Badge>}
          {devolucao && <Badge variant="destructive">Devolvida pelo inspetor</Badge>}
          {observacaoAparte && <Badge variant="warning">Observação do inspetor</Badge>}
        </div>
        {observacaoAparte && (
          <div className="rounded-lg border-2 border-warning bg-warning/10 p-3 text-sm" role="alert">
            <p className="font-semibold">
              Observação do inspetor — {formatarData(observacaoAparte.data_verificacao)} ({observacaoAparte.inspetor_nome})
            </p>
            <p className="mt-1 whitespace-pre-wrap">{observacaoAparte.observacao}</p>
            <p className="mt-1 text-xs text-muted-foreground">Providencie a adequação antes da próxima verificação.</p>
          </div>
        )}
        {devolucao && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            <p>
              <strong>Não conforme</strong> em {formatarData(devolucao.data_verificacao)} ({devolucao.inspetor_nome}). Reprograme o prazo e
              justifique para devolver a OS ao monitoramento.
            </p>
            {devolucao.observacao && <p className="mt-1 whitespace-pre-wrap font-medium">Observação do inspetor: {devolucao.observacao}</p>}
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">{ordem.descricao}</p>
          <p className="text-xs text-muted-foreground">
            {ordem.acao_corretiva ? `Ação: ${ordem.acao_corretiva} · ` : ""}
            {rotuloInspetorOuResp(ordem)}Constatada em {formatarData(ordem.constatado_em)}
          </p>
        </div>

        <SeletorEspecialidade tipo="ordem" id={ordem.id} valor={ordem.especialidade} />

        <ol className="space-y-1 text-xs text-muted-foreground">
          {ordem.programacoes.map((p) => (
            <li key={p.sequencia}>
              <span className="font-semibold">{rotuloProgramacao(p.sequencia)}</span> {formatarData(p.prazo)}
              {p.programado_por_nome ? ` · ${p.programado_por_nome}` : ""}
              {p.justificativa ? ` — ${p.justificativa}` : ""}
            </li>
          ))}
        </ol>

        {!aberto ? (
          <Button type="button" size="sm" variant={devolucao ? "default" : "outline"} onClick={() => setAberto(true)}>
            {devolucao ? "Reprogramar e justificar" : "Reprogramar prazo"}
          </Button>
        ) : (
          <form onSubmit={enviar} className={cn("space-y-3 rounded-lg border border-hairline p-3")} noValidate>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`np-${ordem.id}`}>Novo prazo</Label>
                <Input id={`np-${ordem.id}`} type="date" min={hoje} value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor={`ac-${ordem.id}`}>Ação (se mudou)</Label>
                <Input id={`ac-${ordem.id}`} value={acao} onChange={(e) => setAcao(e.target.value)} placeholder={ordem.acao_corretiva ?? "Mantém a ação atual"} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`rp-${ordem.id}`}>Responsável (se mudou)</Label>
              <Input id={`rp-${ordem.id}`} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder={ordem.responsavel ?? ""} className="max-w-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`jt-${ordem.id}`}>Justificativa da reprogramação</Label>
              <Textarea id={`jt-${ordem.id}`} rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Por que o prazo precisa mudar?" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={reprogramar.isPending}>
                {reprogramar.isPending ? "Salvando…" : "Assinar e reprogramar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Conteudo() {
  const [aba, setAba] = useState<"programar" | "devolvidas" | "programadas">("programar");
  const [busca, setBusca] = useState("");
  const [especialidade, setEspecialidade] = useState(FILTRO_TODAS);
  const { data: todasAProgramar, isLoading: carregandoSs } = useSolicitacoes({ status: ["APROVADA"] });
  const { data: todasOrdens, isLoading: carregandoOs } = useOrdensProgramadas();
  // O filtro de especialidade vale para as três abas e para a lista impressa.
  const aProgramar = useMemo(() => filtrarPorEspecialidade(todasAProgramar ?? [], especialidade), [todasAProgramar, especialidade]);
  const ordens = useMemo(() => filtrarPorEspecialidade(todasOrdens ?? [], especialidade), [todasOrdens, especialidade]);
  const contagem = useMemo(() => contarPorEspecialidade([...(todasAProgramar ?? []), ...(todasOrdens ?? [])]), [todasAProgramar, todasOrdens]);
  const especialidadesNaTela = useMemo(
    () => [...new Set([...ESPECIALIDADES_BPF, ...[...contagem.keys()].filter((k) => k !== FILTRO_SEM_CLASSIFICACAO)])],
    [contagem]
  );

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      ordens.filter(
        (o) =>
          !termo ||
          o.numero_os.toLowerCase().includes(termo) ||
          o.descricao.toLowerCase().includes(termo) ||
          (o.centro?.nome ?? "").toLowerCase().includes(termo)
      ),
    [ordens, termo]
  );
  const vencidas = ordens.filter((o) => o.prazo_atual < hojeManaus()).length;
  const devolvidas = useMemo(() => ordens.filter((o) => devolucaoAoPcm(o)), [ordens]);
  const comObservacao = useMemo(() => ordens.filter((o) => ultimaObservacaoDoInspetor(o)).length, [ordens]);
  // A lista impressa é a da aba aberta: o que está na tela (a de programadas respeita a busca).
  const qtdDaAba = aba === "programar" ? aProgramar.length : aba === "devolvidas" ? devolvidas.length : filtradas.length;

  return (
    <>
      <CabecalhoBpf
        titulo="Programação de Ações Corretivas para Infraestrutura e Equipamentos"
        descricao="Receba as solicitações aprovadas, programe a execução e reprograme o prazo quando necessário (sempre com justificativa)."
      />

      <div className="flex flex-wrap items-center gap-2 print:hidden" role="tablist">
        <Button type="button" role="tab" aria-selected={aba === "programar"} variant={aba === "programar" ? "default" : "outline"} size="sm" onClick={() => setAba("programar")}>
          A programar ({aProgramar.length})
        </Button>
        <Button type="button" role="tab" aria-selected={aba === "devolvidas"} variant={aba === "devolvidas" ? "default" : "outline"} size="sm" onClick={() => setAba("devolvidas")}>
          Devolvidas pelo inspetor ({devolvidas.length})
        </Button>
        <Button type="button" role="tab" aria-selected={aba === "programadas"} variant={aba === "programadas" ? "default" : "outline"} size="sm" onClick={() => setAba("programadas")}>
          OS programadas ({ordens.length}){vencidas > 0 ? ` · ${vencidas} vencida(s)` : ""}
          {comObservacao > 0 ? ` · ${comObservacao} com observação` : ""}
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Label htmlFor="pcm-filtro-especialidade" className="text-xs">
            Especialidade
          </Label>
          <Select id="pcm-filtro-especialidade" className="h-9 w-auto min-w-48 text-sm" value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}>
            <option value={FILTRO_TODAS}>Todas (impressão separada por especialidade)</option>
            {especialidadesNaTela.map((e) => (
              <option key={e} value={e}>
                {e} ({contagem.get(e) ?? 0})
              </option>
            ))}
            <option value={FILTRO_SEM_CLASSIFICACAO}>
              {SEM_ESPECIALIDADE} ({contagem.get(FILTRO_SEM_CLASSIFICACAO) ?? 0})
            </option>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={imprimirElemento} disabled={qtdDaAba === 0}>
            <Printer className="h-4 w-4" /> Imprimir lista
          </Button>
        </div>
      </div>

      {aba === "programar" && <ListaImpressaAProgramar solicitacoes={aProgramar} especialidade={especialidade} />}
      {aba === "devolvidas" && <ListaImpressaDevolvidas ordens={devolvidas} especialidade={especialidade} />}
      {aba === "programadas" && <ListaImpressaProgramadas ordens={filtradas} filtro={busca.trim() || undefined} especialidade={especialidade} />}

      {aba === "programar" && (
        <section className="space-y-3 print:hidden">
          {carregandoSs && <p className="text-muted-foreground">Carregando…</p>}
          {!carregandoSs && aProgramar.length === 0 && <p className="text-muted-foreground">Nenhuma solicitação aprovada aguardando programação.</p>}
          {aProgramar.map((ss) => (
            <CartaoProgramar key={ss.id} ss={ss} />
          ))}
        </section>
      )}

      {aba === "devolvidas" && (
        <section className="space-y-3 print:hidden">
          {carregandoOs && <p className="text-muted-foreground">Carregando…</p>}
          {!carregandoOs && devolvidas.length === 0 && (
            <p className="text-muted-foreground">Nenhuma OS marcada como não conforme aguardando reprogramação.</p>
          )}
          {devolvidas.map((o) => (
            <CartaoOsProgramada key={o.id} ordem={o} />
          ))}
        </section>
      )}

      {aba === "programadas" && (
        <section className="space-y-3 print:hidden">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nº da OS, setor ou descrição" aria-label="Buscar OS" />
          {carregandoOs && <p className="text-muted-foreground">Carregando…</p>}
          {!carregandoOs && filtradas.length === 0 && <p className="text-muted-foreground">Nenhuma OS encontrada.</p>}
          {filtradas.map((o) => (
            <CartaoOsProgramada key={o.id} ordem={o} />
          ))}
        </section>
      )}
    </>
  );
}

export function PcmPage() {
  return (
    <PaginaBpf larga>
      <Conteudo />
    </PaginaBpf>
  );
}
