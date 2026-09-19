import { useState } from "react";
import { type Rnc, useReabrirRnc, useRevisarRnc, useRncsAbertas, useRncsFechadasRecentes, useTratarRnc } from "./api";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Textarea } from "@/shared/ui/textarea";

const VARIANTE_SEVERIDADE: Record<Rnc["severidade"], "destructive" | "warning" | "secondary" | "outline"> = {
  CRITICA: "destructive",
  ALTA: "warning",
  MEDIA: "secondary",
  BAIXA: "outline",
};

const RENOME_STATUS: Record<Rnc["status"], string> = {
  ABERTA: "Aberta",
  EM_TRATATIVA: "Em tratativa",
  TRATADA: "Tratada — aguardando revisão do Verificador",
  REABERTA: "Reaberta",
  DEVOLVIDA: "Devolvida pelo Verificador",
  FECHADA: "Fechada",
};

function estaAtrasada(rnc: Rnc) {
  return rnc.status !== "FECHADA" && new Date(rnc.prazo_sla).getTime() < Date.now();
}

/** Tratativas de RNC (seção 7.2) — GESTOR_SETOR trata as RNCs do próprio setor (RLS já
 * restringe), mas não fecha mais a própria tratativa: o VERIFICADOR (ou ADMIN_MASTER) revisa
 * e aprova o fechamento ou devolve para nova tratativa — segregação de funções reforçada no
 * banco (trg_segregacao_funcoes_rnc), não só escondida na UI. Reabrir uma RNC já FECHADA
 * continua restrito a ADMIN_MASTER (ação de exceção, distinta da revisão de rotina). */
function CartaoRnc({ rnc, podeTratar, podeRevisar, podeReabrir }: { rnc: Rnc; podeTratar: boolean; podeRevisar: boolean; podeReabrir: boolean }) {
  const perfil = useSessionStore((s) => s.perfil);
  const [tratativa, setTratativa] = useState(rnc.tratativa ?? "");
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [novaDescricaoReabertura, setNovaDescricaoReabertura] = useState("");
  const [reabrindo, setReabrindo] = useState(false);
  const tratar = useTratarRnc();
  const revisar = useRevisarRnc();
  const reabrir = useReabrirRnc();

  const atrasada = estaAtrasada(rnc);
  const emTratativa = rnc.status === "ABERTA" || rnc.status === "EM_TRATATIVA" || rnc.status === "REABERTA" || rnc.status === "DEVOLVIDA";

  return (
    <Card className={atrasada ? "border-destructive" : undefined}>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline">{rnc.setor}</Badge>
          <Badge variant={VARIANTE_SEVERIDADE[rnc.severidade]}>{rnc.severidade}</Badge>
          <Badge variant={rnc.status === "FECHADA" ? "secondary" : "default"}>{RENOME_STATUS[rnc.status]}</Badge>
          {atrasada && <Badge variant="destructive">SLA VENCIDO</Badge>}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Prazo SLA: {new Date(rnc.prazo_sla).toLocaleString("pt-BR")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{rnc.descricao}</p>

        {rnc.status === "DEVOLVIDA" && rnc.motivo_devolucao && (
          <p className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            <span className="font-semibold">Motivo da devolução: </span>
            {rnc.motivo_devolucao}
          </p>
        )}

        {emTratativa && podeTratar && (
          <div className="space-y-2">
            <Textarea
              placeholder="Descreva a tratativa aplicada…"
              value={tratativa}
              onChange={(e) => setTratativa(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => tratar.mutate({ id: rnc.id, tratativa, userId: perfil!.id })}
              disabled={tratativa.trim().length === 0 || tratar.isPending}
            >
              {tratar.isPending ? "Salvando…" : "Registrar tratativa"}
            </Button>
          </div>
        )}
        {emTratativa && !podeTratar && (
          <p className="text-sm text-muted-foreground">Aguardando o Gestor de Setor registrar a tratativa.</p>
        )}

        {rnc.status === "TRATADA" && (
          <div className="space-y-2 border-t pt-3">
            {rnc.tratativa && (
              <p className="text-sm">
                <span className="font-semibold">Tratativa registrada: </span>
                {rnc.tratativa}
              </p>
            )}
            {podeRevisar ? (
              !devolvendo ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => revisar.mutate({ id: rnc.id, decisao: "aprovar", userId: perfil!.id })}
                    disabled={revisar.isPending}
                  >
                    {revisar.isPending ? "Fechando…" : "Aprovar e Fechar RNC"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDevolvendo(true)} disabled={revisar.isPending}>
                    Devolver ao Gestor
                  </Button>
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Motivo da devolução (o que precisa ser revisto na tratativa)…"
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
              <p className="text-sm text-muted-foreground">Aguardando revisão do Verificador.</p>
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
                <Textarea
                  placeholder="Motivo da reabertura…"
                  value={novaDescricaoReabertura}
                  onChange={(e) => setNovaDescricaoReabertura(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      reabrir.mutate(
                        { rncAnterior: rnc, userId: perfil!.id, novaDescricao: novaDescricaoReabertura },
                        { onSuccess: () => setReabrindo(false) }
                      )
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
    </Card>
  );
}

export function RncTratativasPage() {
  const { data: abertas, isLoading } = useRncsAbertas();
  const { data: fechadas } = useRncsFechadasRecentes();
  const perfil = useSessionStore((s) => s.perfil);

  const isAdmin = perfil?.nivelAcesso === "ADMIN_MASTER";
  const podeTratar = perfil?.nivelAcesso === "GESTOR_SETOR" || isAdmin;
  const podeRevisar = perfil?.nivelAcesso === "VERIFICADOR" || isAdmin;

  const atrasadas = (abertas ?? []).filter(estaAtrasada);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{podeTratar && !podeRevisar ? "Tratativas de RNC" : "RNCs — Tratativa e Revisão"}</h1>
        <p className="text-sm text-muted-foreground">
          {podeRevisar && !podeTratar
            ? "Não conformidades tratadas pelo Gestor de Setor, aguardando sua revisão — aprove o fechamento ou devolva para nova tratativa."
            : "Não conformidades abertas a partir de reprovações na verificação — registre a tratativa; o Verificador revisa e fecha."}
        </p>
      </div>

      {atrasadas.length > 0 && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {atrasadas.length} RNC(s) com SLA vencido — priorize o tratamento.
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && abertas?.length === 0 && <p className="text-muted-foreground">Nenhuma RNC pendente.</p>}

      {abertas?.map((rnc) => (
        <CartaoRnc key={rnc.id} rnc={rnc} podeTratar={podeTratar} podeRevisar={podeRevisar} podeReabrir={isAdmin} />
      ))}

      {isAdmin && fechadas && fechadas.length > 0 && (
        <div className="space-y-2 pt-6">
          <h2 className="text-lg font-medium text-muted-foreground">Fechadas recentemente</h2>
          {fechadas.map((rnc) => (
            <CartaoRnc key={rnc.id} rnc={rnc} podeTratar={false} podeRevisar={false} podeReabrir={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
