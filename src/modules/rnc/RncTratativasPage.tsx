import { useState } from "react";
import {
  type Rnc,
  useFecharRnc,
  useReabrirRnc,
  useRncsAbertas,
  useRncsFechadasRecentes,
  useTratarRnc,
} from "./api";
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
  TRATADA: "Tratada — aguardando fechamento",
  REABERTA: "Reaberta",
  FECHADA: "Fechada",
};

function estaAtrasada(rnc: Rnc) {
  return rnc.status !== "FECHADA" && new Date(rnc.prazo_sla).getTime() < Date.now();
}

function CartaoRnc({ rnc }: { rnc: Rnc }) {
  const perfil = useSessionStore((s) => s.perfil);
  const [tratativa, setTratativa] = useState(rnc.tratativa ?? "");
  const [novaDescricaoReabertura, setNovaDescricaoReabertura] = useState("");
  const [reabrindo, setReabrindo] = useState(false);
  const tratar = useTratarRnc();
  const fechar = useFecharRnc();
  const reabrir = useReabrirRnc();

  const atrasada = estaAtrasada(rnc);
  const podeReabrir = perfil?.nivelAcesso === "ADMIN_MASTER";

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

        {rnc.status !== "FECHADA" && (
          <div className="space-y-2">
            <Textarea
              placeholder="Descreva a tratativa aplicada…"
              value={tratativa}
              onChange={(e) => setTratativa(e.target.value)}
              disabled={rnc.status === "TRATADA"}
            />
            <div className="flex gap-2">
              {rnc.status !== "TRATADA" && (
                <Button
                  size="sm"
                  onClick={() => tratar.mutate({ id: rnc.id, tratativa, userId: perfil!.id })}
                  disabled={tratativa.trim().length === 0 || tratar.isPending}
                >
                  {tratar.isPending ? "Salvando…" : "Registrar tratativa"}
                </Button>
              )}
              {rnc.status === "TRATADA" && (
                <Button size="sm" onClick={() => fechar.mutate(rnc.id)} disabled={fechar.isPending}>
                  {fechar.isPending ? "Fechando…" : "Fechar RNC"}
                </Button>
              )}
            </div>
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
                <div className="flex gap-2">
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

/** Tratativas de RNC (seção 7.2) — GESTOR_SETOR trata as RNCs do próprio setor (RLS já
 * restringe); ADMIN_MASTER vê todas e é o único perfil habilitado a reabrir uma RNC fechada,
 * já que o PROMPT MESTRE não define um perfil dedicado de revisor (ver ASSUMPTIONS.md). */
export function RncTratativasPage() {
  const { data: abertas, isLoading } = useRncsAbertas();
  const { data: fechadas } = useRncsFechadasRecentes();
  const perfil = useSessionStore((s) => s.perfil);

  const atrasadas = (abertas ?? []).filter(estaAtrasada);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tratativas de RNC</h1>
        <p className="text-sm text-muted-foreground">
          Não conformidades abertas a partir de reprovações na verificação — registre a
          tratativa e feche quando resolvido.
        </p>
      </div>

      {atrasadas.length > 0 && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {atrasadas.length} RNC(s) com SLA vencido — priorize o tratamento.
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && abertas?.length === 0 && <p className="text-muted-foreground">Nenhuma RNC pendente.</p>}

      {abertas?.map((rnc) => <CartaoRnc key={rnc.id} rnc={rnc} />)}

      {perfil?.nivelAcesso === "ADMIN_MASTER" && fechadas && fechadas.length > 0 && (
        <div className="space-y-2 pt-6">
          <h2 className="text-lg font-medium text-muted-foreground">Fechadas recentemente</h2>
          {fechadas.map((rnc) => (
            <CartaoRnc key={rnc.id} rnc={rnc} />
          ))}
        </div>
      )}
    </div>
  );
}
