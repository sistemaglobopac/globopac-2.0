import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { cn } from "@/lib/utils";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { useEmitirRelatorio, useOrdensParaVerificar, useRegistrarVerificacao, useRelatorios } from "./api";
import {
  formatarData,
  formatarDataHora,
  hojeManaus,
  pendentesDeVerificacao,
  ROTULO_RESULTADO,
  resultadosPermitidos,
  rotuloInspetorOuResp,
  rotuloProgramacao,
  situacaoPrazo,
} from "./regras";
import type { Ordem, ResultadoBpf } from "./tipos";

const ESTILO_SELECIONADO: Record<ResultadoBpf, string> = {
  C: "border-transparent bg-success text-success-foreground hover:bg-success hover:text-success-foreground",
  NP: "border-transparent bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
  NC: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground",
};

function CartaoOs({ ordem, hoje, bloqueado }: { ordem: Ordem; hoje: string; bloqueado: boolean }) {
  const dialog = useAppDialog();
  const registrar = useRegistrarVerificacao();
  const verificacao = ordem.verificacoes.find((v) => v.data_verificacao === hoje);
  const permitidos = resultadosPermitidos(ordem.prazo_atual, hoje);
  const prazo = situacaoPrazo(ordem.prazo_atual, hoje);
  const [obs, setObs] = useState(verificacao?.observacao ?? "");
  const [mostrarObs, setMostrarObs] = useState(Boolean(verificacao?.observacao));

  function marcar(resultado: ResultadoBpf) {
    registrar.mutate(
      { ordemId: ordem.id, resultado, observacao: obs.trim() || undefined },
      { onError: (erro) => dialog.erro(erro, "Não foi possível registrar") }
    );
  }

  return (
    <Card className={cn(verificacao && "border-l-4", verificacao?.resultado === "C" && "border-l-success", verificacao?.resultado === "NP" && "border-l-primary", verificacao?.resultado === "NC" && "border-l-destructive")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">OS {ordem.numero_os}</Badge>
          <Badge variant={prazo.vencido ? "destructive" : "info"}>
            {prazo.texto} · prazo {formatarData(ordem.prazo_atual)}
          </Badge>
          {ordem.reprogramacoes > 0 && <Badge variant="warning">Reprogramada {ordem.reprogramacoes}×</Badge>}
          {verificacao && (
            <span className="ml-auto text-xs text-muted-foreground">
              {ROTULO_RESULTADO[verificacao.resultado]} · {verificacao.hora_verificacao.slice(0, 5)}
            </span>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">{ordem.descricao}</p>
          {ordem.acao_corretiva && <p className="text-xs text-muted-foreground">Ação do PCM: {ordem.acao_corretiva}</p>}
          <p className="text-xs text-muted-foreground">
            {rotuloInspetorOuResp(ordem)}Constatada em {formatarData(ordem.constatado_em)}
            {ordem.local_detalhe ? ` · ${ordem.local_detalhe}` : ""}
          </p>
          {ordem.programacoes.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {ordem.programacoes.map((p) => `${rotuloProgramacao(p.sequencia)} ${formatarData(p.prazo)}`).join(" → ")}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["C", "NP", "NC"] as ResultadoBpf[]).map((r) => {
            const permitido = permitidos.includes(r);
            const selecionado = verificacao?.resultado === r;
            return (
              <Button
                key={r}
                type="button"
                size="sm"
                variant="outline"
                disabled={!permitido || bloqueado || registrar.isPending}
                onClick={() => marcar(r)}
                className={cn("min-w-28", selecionado && ESTILO_SELECIONADO[r])}
                aria-pressed={selecionado}
                title={permitido ? undefined : "O prazo já venceu"}
              >
                {ROTULO_RESULTADO[r]}
              </Button>
            );
          })}
          <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarObs((v) => !v)} aria-expanded={mostrarObs}>
            <MessageSquare className="h-4 w-4" /> Observação
          </Button>
        </div>
        {!bloqueado && (
          <p className="text-xs text-muted-foreground">
            {prazo.vencido
              ? "Prazo vencido: se não foi executada, marque Não conforme."
              : "Dentro do prazo: se ainda não foi executada, marque No prazo. Se foi executada mas o desvio não foi sanado, marque Não conforme."}
          </p>
        )}

        {mostrarObs && (
          <div className="flex items-center gap-2">
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Observação do inspetor (opcional)"
              disabled={bloqueado}
              aria-label={`Observação da OS ${ordem.numero_os}`}
            />
            {verificacao && !bloqueado && obs.trim() !== (verificacao.observacao ?? "") && (
              <Button type="button" size="sm" onClick={() => marcar(verificacao.resultado)} disabled={registrar.isPending}>
                Salvar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Conteudo() {
  const hoje = hojeManaus();
  const dialog = useAppDialog();
  const { data: ordens, isLoading, isError } = useOrdensParaVerificar();
  const { data: relatorios } = useRelatorios();
  const emitir = useEmitirRelatorio();
  const [centroFiltro, setCentroFiltro] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);

  const lista = useMemo(() => ordens ?? [], [ordens]);
  const relatorioDeHoje = (relatorios ?? []).find((r) => r.data_referencia === hoje);
  const bloqueado = Boolean(relatorioDeHoje);

  const pendentes = useMemo(() => pendentesDeVerificacao(lista, hoje), [lista, hoje]);
  const verificadas = lista.filter((o) => o.verificacoes.some((v) => v.data_verificacao === hoje));
  const contagem = (r: ResultadoBpf) => lista.filter((o) => o.verificacoes.some((v) => v.data_verificacao === hoje && v.resultado === r)).length;

  const centros = useMemo(() => {
    const mapa = new Map<string, string>();
    lista.forEach((o) => o.centro && mapa.set(o.centro.id, o.centro.nome));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [lista]);

  const visiveis = lista.filter(
    (o) =>
      (!centroFiltro || o.centro?.id === centroFiltro) &&
      (!soPendentes || !o.verificacoes.some((v) => v.data_verificacao === hoje))
  );
  const grupos = useMemo(() => {
    const mapa = new Map<string, Ordem[]>();
    visiveis.forEach((o) => {
      const nome = o.centro?.nome ?? "Sem setor";
      mapa.set(nome, [...(mapa.get(nome) ?? []), o]);
    });
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [visiveis]);

  function encerrarDia() {
    dialog.confirm({
      titulo: "Encerrar o dia e emitir o relatório?",
      mensagem: `Serão registradas ${contagem("NC")} não conformidade(s) e ${contagem("NP")} OS no prazo. Depois de emitido, o dia não pode mais ser alterado e o relatório segue para verificação do Verificador.`,
      icone: "warning",
      aoConfirmar: () =>
        emitir.mutate(undefined, {
          onSuccess: () => dialog.sucesso("Relatório do dia emitido. Ele agora aguarda a verificação do Verificador.", "Dia encerrado"),
          onError: (erro) => dialog.erro(erro, "Não foi possível emitir o relatório"),
        }),
    });
  }

  return (
    <>
      <CabecalhoBpf
        titulo="Verificação diária — BPF Estrutural"
        descricao={`${formatarData(hoje)} · marque cada OS programada pelo PCM como Conforme, No prazo ou Não conforme.`}
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link to="/bpf/nova">Nova solicitação de serviço</Link>
          </Button>
        }
      />

      {relatorioDeHoje && (
        <div className="rounded-lg border border-hairline bg-primary/5 p-4 text-sm">
          O relatório de hoje foi emitido por <strong>{relatorioDeHoje.emitido_por_nome}</strong> em {formatarDataHora(relatorioDeHoje.emitido_em)} (
          {relatorioDeHoje.status === "liberado" ? "liberado ao SIF" : relatorioDeHoje.status === "verificado" ? "verificado, aguardando liberação ao SIF" : "aguardando o Verificador"}). As verificações do dia estão travadas.{" "}
          <Link to="/bpf/relatorios" className="font-semibold underline">
            Ver relatório
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo rotulo="Verificadas hoje" valor={`${verificadas.length}/${lista.length}`} />
        <Resumo rotulo="Conformes" valor={contagem("C")} />
        <Resumo rotulo="No prazo" valor={contagem("NP")} />
        <Resumo rotulo="Não conformes" valor={contagem("NC")} destaque={contagem("NC") > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={centroFiltro} onChange={(e) => setCentroFiltro(e.target.value)} className="max-w-xs" aria-label="Filtrar por setor">
          <option value="">Todos os setores</option>
          {centros.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} className="h-4 w-4" />
          Só as que faltam verificar
        </label>
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {isError && <p className="text-destructive">Não foi possível carregar as OS. Tente novamente.</p>}
      {!isLoading && !isError && lista.length === 0 && (
        <p className="text-muted-foreground">Nenhuma OS programada para monitorar no momento.</p>
      )}

      {grupos.map(([nome, itens]) => (
        <section key={nome} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {nome} <span className="font-normal">({itens.length})</span>
          </h2>
          {itens.map((o) => (
            <CartaoOs key={o.id} ordem={o} hoje={hoje} bloqueado={bloqueado} />
          ))}
        </section>
      ))}

      {!bloqueado && lista.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm">
              {pendentes.length > 0 ? (
                <>
                  Faltam <strong>{pendentes.length}</strong> OS para verificar antes de encerrar o dia.
                </>
              ) : (
                "Todas as OS foram verificadas. Você já pode encerrar o dia."
              )}
            </p>
            <Button type="button" onClick={encerrarDia} disabled={pendentes.length > 0 || emitir.isPending}>
              {emitir.isPending ? "Emitindo…" : "Encerrar o dia e emitir relatório"}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: boolean }) {
  return (
    <div className="rounded-lg border border-hairline bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("text-2xl font-bold tabular-nums", destaque && "text-destructive")}>{valor}</p>
    </div>
  );
}

export function VerificacaoDiariaPage() {
  return (
    <PaginaBpf larga>
      <Conteudo />
    </PaginaBpf>
  );
}
