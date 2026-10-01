import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Rnc, enviarAnexosRnc, estaAtrasada, useReabrirRnc, useRevisarRnc, useTratarRnc } from "./api";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { ListaAnexosRnc, SeletorAnexos } from "./AnexosRnc";
import { OrigemRnc } from "./OrigemRnc";
import { useUsuariosMap } from "@/modules/fichas/api";

const VARIANTE_SEVERIDADE: Record<Rnc["severidade"], "destructive" | "warning" | "secondary" | "outline"> = {
  CRITICA: "destructive",
  ALTA: "warning",
  MEDIA: "secondary",
  BAIXA: "outline",
};

const RENOME_STATUS: Record<Rnc["status"], string> = {
  ABERTA: "Aberta",
  EM_TRATATIVA: "Em tratativa",
  TRATADA: "Respondida — aguardando julgamento do Verificador",
  REABERTA: "Reaberta",
  DEVOLVIDA: "Devolvida pelo Verificador",
  FECHADA: "Fechada",
};

/** Cartão de RNC (seção 7.2) — o GESTOR_SETOR responde as RNCs do próprio setor (RLS já
 * restringe) com causa do desvio + ação corretiva + anexos (fotos/documentos que comprovam a
 * ação). Ele não fecha a própria RNC: o VERIFICADOR (ou ADMIN_MASTER) julga a resposta — se ela
 * sana a não conformidade, assina aprovando e a RNC fecha; se for insuficiente, devolve ao gestor
 * com uma nota para responder de novo. Segregação de funções reforçada no banco
 * (trg_segregacao_funcoes_rnc). Reabrir uma RNC FECHADA continua restrito a ADMIN_MASTER. */
export function CartaoRnc({ rnc, podeTratar, podeRevisar, podeReabrir }: { rnc: Rnc; podeTratar: boolean; podeRevisar: boolean; podeReabrir: boolean }) {
  const perfil = useSessionStore((s) => s.perfil);
  const queryClient = useQueryClient();
  const [causa, setCausa] = useState(rnc.causa_desvio ?? "");
  const [tratativa, setTratativa] = useState(rnc.tratativa ?? "");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [avisoAnexo, setAvisoAnexo] = useState<string | null>(null);
  const [erroResposta, setErroResposta] = useState<string | null>(null);
  // Assinatura eletrônica do gestor: abre o MODAL de senha antes de enviar a resposta.
  const [assinandoResposta, setAssinandoResposta] = useState(false);
  const { data: usuarios } = useUsuariosMap();
  const [enviando, setEnviando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
  // Assinar ao aprovar: o Verificador confirma a própria senha, num MODAL (assinatura eletrônica avançada).
  const [assinando, setAssinando] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [novaDescricaoReabertura, setNovaDescricaoReabertura] = useState("");
  const [reabrindo, setReabrindo] = useState(false);
  const tratar = useTratarRnc();
  const revisar = useRevisarRnc();
  const reabrir = useReabrirRnc();

  const atrasada = estaAtrasada(rnc);
  const emTratativa = rnc.status === "ABERTA" || rnc.status === "EM_TRATATIVA" || rnc.status === "REABERTA" || rnc.status === "DEVOLVIDA";

  async function assinarEFechar() {
    if (!perfil) return;
    await revisar.mutateAsync({ id: rnc.id, decisao: "aprovar", userId: perfil.id });
    setAssinando(false);
  }

  async function assinarEResponder() {
    setAssinandoResposta(false);
    await responder();
  }

  async function responder() {
    if (!perfil) return;
    setAvisoAnexo(null);
    setErroResposta(null);
    setEnviando(true);
    try {
      // Anexos primeiro: o julgamento do Verificador só chega depois que a resposta está completa.
      if (arquivos.length > 0) {
        const falhas = await enviarAnexosRnc(rnc.id, "TRATATIVA", arquivos, perfil.id);
        if (falhas > 0) {
          setAvisoAnexo(`${falhas} anexo(s) não foram enviados. Tente de novo antes de responder.`);
          return;
        }
        setArquivos([]);
        void queryClient.invalidateQueries({ queryKey: ["rnc", "anexos", rnc.id] });
      }
      await tratar.mutateAsync({ id: rnc.id, causa: causa.trim(), tratativa: tratativa.trim(), userId: perfil.id });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
      setErroResposta(
        mensagem?.includes("causa_desvio")
          ? "O banco ainda não tem a coluna da causa do desvio — aplique a migração 20260930000004_rnc_causa_anexos.sql."
          : (mensagem ?? "Falha ao responder a RNC. Tente novamente.")
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className={atrasada ? "border-destructive" : undefined} data-testid={`rnc-${rnc.id}`}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline">{rnc.setor}</Badge>
          <Badge variant={VARIANTE_SEVERIDADE[rnc.severidade]}>{rnc.severidade}</Badge>
          <Badge variant={rnc.status === "FECHADA" ? "secondary" : "default"}>{RENOME_STATUS[rnc.status]}</Badge>
          {atrasada && <Badge variant="destructive">SLA VENCIDO</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Prazo SLA: {new Date(rnc.prazo_sla).toLocaleString("pt-BR")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-line text-sm">{rnc.descricao}</p>
        <OrigemRnc monitoramentoId={rnc.monitoramento_id} />
        {/* Registro da ação imediata tomada pelo inspetor — o gestor precisa dele para responder. */}
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" data-testid={`acao-imediata-${rnc.id}`}>
          <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-primary">Ação imediata tomada pelo inspetor</span>
          {rnc.acao_imediata ? (
            <span className="whitespace-pre-line">{rnc.acao_imediata}</span>
          ) : (
            <span className="text-muted-foreground">Não informada (RNC anterior a este registro ou aberta pela reprovação do Verificador).</span>
          )}
        </div>
        <ListaAnexosRnc rncId={rnc.id} />

        {rnc.status === "DEVOLVIDA" && rnc.motivo_devolucao && (
          <p className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            <span className="font-semibold">Nota do Verificador (responda novamente): </span>
            {rnc.motivo_devolucao}
          </p>
        )}

        {emTratativa && podeTratar && (
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1">
              <Label htmlFor={`causa-${rnc.id}`}>Causa do desvio</Label>
              <Textarea id={`causa-${rnc.id}`} placeholder="Qual foi a causa do desvio?" value={causa} onChange={(e) => setCausa(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`acao-${rnc.id}`}>Ação corretiva</Label>
              <Textarea
                id={`acao-${rnc.id}`}
                placeholder="Descreva a ação corretiva executada…"
                value={tratativa}
                onChange={(e) => setTratativa(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Comprovação (fotos e documentos)</Label>
              <SeletorAnexos rotulo="Anexar arquivos" arquivos={arquivos} onChange={setArquivos} disabled={enviando} testId={`anexos-${rnc.id}`} />
            </div>
            {avisoAnexo && <p className="text-xs text-destructive">{avisoAnexo}</p>}
            {erroResposta && (
              <p role="alert" className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
                {erroResposta}
              </p>
            )}
            <Button
              size="sm"
              onClick={() => setAssinandoResposta(true)}
              disabled={causa.trim().length === 0 || tratativa.trim().length === 0 || enviando || tratar.isPending}
            >
              {enviando || tratar.isPending ? "Enviando…" : "Responder e assinar"}
            </Button>
          </div>
        )}
        {emTratativa && !podeTratar && <p className="text-sm text-muted-foreground">Aguardando o Gestor de Setor responder (causa do desvio e ação corretiva).</p>}

        {(rnc.status === "TRATADA" || rnc.status === "FECHADA") && (rnc.causa_desvio || rnc.tratativa) && (
          <div className="space-y-1 border-t pt-3 text-sm">
            {rnc.causa_desvio && (
              <p>
                <span className="font-semibold">Causa do desvio: </span>
                {rnc.causa_desvio}
              </p>
            )}
            {rnc.tratativa && (
              <p>
                <span className="font-semibold">Ação corretiva: </span>
                {rnc.tratativa}
              </p>
            )}
          </div>
        )}

        {rnc.assinatura_gestor_hash && (
          <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-testid={`assinatura-gestor-${rnc.id}`}>
            <strong className="text-foreground">Assinado eletronicamente</strong> por {usuarios?.get(rnc.assinatura_gestor_por ?? "") ?? "Gestor de Setor"} em{" "}
            {rnc.assinatura_gestor_em ? new Date(rnc.assinatura_gestor_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" }) : "—"} · SHA-256{" "}
            <span className="font-mono">{rnc.assinatura_gestor_hash.slice(0, 20)}…</span> · Lei 14.063/2020, Art. 4º §2º
          </p>
        )}

        {rnc.status === "TRATADA" && (
          <div className="space-y-2 border-t pt-3">
            {podeRevisar ? (
              !devolvendo ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setAssinando(true)} disabled={revisar.isPending}>
                    Resposta sana a não conformidade — Assinar e Fechar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDevolvendo(true)} disabled={revisar.isPending}>
                    Resposta insuficiente — Devolver ao Gestor
                  </Button>
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Nota para o gestor: o que precisa ser respondido novamente…"
                    value={motivoDevolucao}
                    onChange={(e) => setMotivoDevolucao(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        revisar.mutate(
                          { id: rnc.id, decisao: "devolver", userId: perfil!.id, motivo: motivoDevolucao },
                          { onSuccess: () => setDevolvendo(false) }
                        )
                      }
                      disabled={motivoDevolucao.trim().length === 0 || revisar.isPending}
                    >
                      {revisar.isPending ? "Devolvendo…" : "Confirmar devolução"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDevolvendo(false)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando julgamento do Verificador.</p>
            )}
          </div>
        )}

        {rnc.status === "FECHADA" && podeReabrir && (
          <div className="space-y-2 border-t pt-3">
            {!reabrindo ? (
              <Button size="sm" variant="outline" onClick={() => setReabrindo(true)}>
                Reabrir RNC
              </Button>
            ) : (
              <>
                <Textarea placeholder="Motivo da reabertura…" value={novaDescricaoReabertura} onChange={(e) => setNovaDescricaoReabertura(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      reabrir.mutate({ rncAnterior: rnc, userId: perfil!.id, novaDescricao: novaDescricaoReabertura }, { onSuccess: () => setReabrindo(false) })
                    }
                    disabled={novaDescricaoReabertura.trim().length === 0 || reabrir.isPending}
                  >
                    {reabrir.isPending ? "Reabrindo…" : "Confirmar reabertura"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReabrindo(false)}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
      {assinandoResposta && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Gestor de Setor"
          descricao="Confirme sua senha para assinar eletronicamente a resposta (causa do desvio e ação corretiva) e enviá-la ao Verificador."
          onAssinar={assinarEResponder}
          onCancelar={() => setAssinandoResposta(false)}
          testId={`assinar-resposta-${rnc.id}`}
        />
      )}
      {assinando && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Verificador"
          descricao="Confirme sua senha para assinar eletronicamente o julgamento: a resposta sana a não conformidade e a RNC será fechada."
          onAssinar={assinarEFechar}
          onCancelar={() => setAssinando(false)}
          testId={`assinar-rnc-${rnc.id}`}
        />
      )}
    </Card>
  );
}
