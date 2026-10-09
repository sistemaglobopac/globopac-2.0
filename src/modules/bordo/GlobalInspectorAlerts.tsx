import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, BellRing, Clock, PauseCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { supabase } from "@/lib/supabase";
import { useAudioAlarm } from "@/modules/fichas/useAudioAlarm";
import { Button } from "@/shared/ui/button";
import { rascunhosComoMonitoramentos, useRascunhos } from "@/modules/fichas/useRascunhos";
import { aguardaChiller2, aguardaPesoDaBalanca, useMonitoramentosEmAndamento } from "@/modules/fichas/api";
import { ALERTA_CHILLER2_MIN } from "@/modules/fichas/fields/controleAbsorcao";
import { ALERTA_PESO_PENDENTE_MIN } from "@/modules/fichas/fields/pesoCaixa";
import { horaEfetiva } from "@/modules/fichas/utils/horaMonitoramento";
import {
  PAUSAS_CONFIG,
  calcularFichasAtrasadas,
  fichasAplicaveisAoInspetor,
  urlNovaFicha,
  useEncerrarFichaDia,
  useKpisTurno,
  usePausaAtiva,
  useTurnoHoje,
  type FichaAtrasada,
} from "./api";
import { ModalProcessoParado } from "./ModalProcessoParado";

interface RncCritica {
  monitoramentoId: string;
  nomeFicha: string;
  isDevolvida: boolean;
}

/** Alerta cross-página do INSPETOR_QUALIDADE (mesmo princípio de GlobalInspectorAlerts.jsx da
 * v1): montado uma única vez no AppShell, fora de qualquer rota específica — pausa estourada,
 * ficha atrasada e RNC crítica não podem depender de o inspetor estar parado no Painel de
 * Bordo no momento exato em que o prazo estoura. Bloqueia a tela com alarme sonoro
 * (useAudioAlarm, mesmo mecanismo já usado em NovaFichaPage) até o "Ciente" de cada item, e
 * nunca deixa dispensar enquanto houver uma pausa estourada. */
export function GlobalInspectorAlerts() {
  const perfil = useSessionStore((s) => s.perfil);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: masterSetores } = useSetoresCadastrados();
  const isInspetor = perfil?.nivelAcesso === "INSPETOR_QUALIDADE";
  const userId = isInspetor ? perfil?.id : undefined;
  const userSetores = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);

  const { data: turnoHoje } = useTurnoHoje(userId);
  const { data: pausaAtiva } = usePausaAtiva(userId);
  const turnoAtivo = Boolean(turnoHoje && !turnoHoje.fim);
  const { data: kpis } = useKpisTurno(turnoAtivo ? userId : undefined, userSetores);
  const encerrarFicha = useEncerrarFichaDia();
  const { data: rascunhos } = useRascunhos(userId);
  // Peso por caixa aguardando o peso da balança há muito tempo: cobra o peso (de qualquer inspetor do setor).
  const { data: emAndamento } = useMonitoramentosEmAndamento(userId, userSetores);

  const [agora, setAgora] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [minimizado, setMinimizado] = useState(false);
  const [paradaDe, setParadaDe] = useState<FichaAtrasada | null>(null);

  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Canal dedicado — o mesmo princípio do canal realtime do Painel de Bordo, só que este
  // componente fica montado em qualquer rota, então precisa da própria assinatura em vez de
  // depender de o inspetor estar com o Painel de Bordo aberto.
  useEffect(() => {
    if (!userId) return;
    const canal = supabase
      .channel("global-inspector-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoramentos" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fichas_encerradas_dia" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoramentos_processo_parado" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rnc" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["painel-bordo", "kpis"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pausas_inspetores", filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["pausas_inspetores"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [userId, queryClient]);

  // O relógio acima só avança a cada 15s: agenda uma virada exata no fim da pausa (curta, almoço ou
  // jantar) para o alarme tocar na hora em que o tempo acaba, não até 15s depois.
  useEffect(() => {
    if (!pausaAtiva) return;
    const fimMs = new Date(pausaAtiva.hora_inicio).getTime() + PAUSAS_CONFIG[pausaAtiva.tipo_pausa].limiteMin * 60_000;
    const restante = fimMs - Date.now();
    if (restante <= 0) return;
    const id = setTimeout(() => setAgora(new Date()), restante + 50);
    return () => clearTimeout(id);
  }, [pausaAtiva]);

  const pausaEstourada = useMemo(() => {
    if (!pausaAtiva) return null;
    const limiteMs = PAUSAS_CONFIG[pausaAtiva.tipo_pausa].limiteMin * 60_000;
    return agora.getTime() - new Date(pausaAtiva.hora_inicio).getTime() > limiteMs ? pausaAtiva : null;
  }, [pausaAtiva, agora]);

  const fichasAtrasadas: FichaAtrasada[] = useMemo(() => {
    if (!kpis || !turnoAtivo || !turnoHoje) return [];
    const aplicaveis = fichasAplicaveisAoInspetor(kpis.fichasAtivas, userSetores);
    // Rascunho = monitoramento já realizado (só não assinado): não é atraso.
    const feitos = [...kpis.monitoramentosDoSetorHoje, ...rascunhosComoMonitoramentos(rascunhos, userSetores)];
    return calcularFichasAtrasadas(aplicaveis, feitos, agora, new Set(kpis.fichasEncerradasHoje), kpis.processosParadosHoje).filter(
      (f) => !dismissed.has(`ficha_${f.ficha.id}`)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis, turnoAtivo, turnoHoje, agora, dismissed, rascunhos]);

  // Rascunho NÃO CONFORME aguardando assinatura: a RNC/ação corretiva imediata só existe depois de assinar.
  const rascunhosNc = useMemo(
    () => (rascunhos ?? []).filter((r) => r.naoConforme && !dismissed.has(`rascunho_nc_${r.id}`)),
    [rascunhos, dismissed]
  );

  const rncsCriticas: RncCritica[] = useMemo(() => {
    if (!kpis) return [];
    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
    return kpis.desviosAtivos
      .filter((d) => {
        if (dismissed.has(`rnc_${d.monitoramentoId}`)) return false;
        const isDevolvida = d.rnc?.status === "DEVOLVIDA";
        const isMais24h = agora.getTime() - new Date(d.criadoEm).getTime() > vinteQuatroHorasMs && d.rnc?.status !== "TRATADA";
        return isDevolvida || isMais24h;
      })
      .map((d) => ({
        monitoramentoId: d.monitoramentoId,
        nomeFicha: kpis.nomesFicha.get(d.fichaTemplateId)?.nome ?? "Ficha",
        isDevolvida: d.rnc?.status === "DEVOLVIDA",
      }));
  }, [kpis, agora, dismissed]);

  // Monitoramento assinado com não conformidade e ainda SEM RNC (últimas 24h; acima disso já
  // entra em "RNCs Críticas"): pede a emissão do relatório de não conformidade agora.
  const ncSemRnc = useMemo(() => {
    if (!kpis) return [];
    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
    return kpis.desviosAtivos
      .filter(
        (d) =>
          d.rnc === null &&
          !dismissed.has(`nc_${d.monitoramentoId}`) &&
          agora.getTime() - new Date(d.criadoEm).getTime() <= vinteQuatroHorasMs
      )
      .map((d) => ({ monitoramentoId: d.monitoramentoId, nomeFicha: kpis.nomesFicha.get(d.fichaTemplateId)?.nome ?? "Ficha" }));
  }, [kpis, agora, dismissed]);

  const pesosPendentes = useMemo(
    () =>
      (emAndamento ?? []).filter(
        (m) =>
          aguardaPesoDaBalanca(m) &&
          !dismissed.has(`peso_${m.id}`) &&
          agora.getTime() - new Date(horaEfetiva(m)).getTime() >= ALERTA_PESO_PENDENTE_MIN * 60_000
      ),
    [emAndamento, agora, dismissed]
  );

  // Controle de absorção com a etapa 1 salva e o chiller 02 ainda não informado há muito tempo: só o inspetor que abriu completa.
  const chiller2Pendentes = useMemo(
    () =>
      (emAndamento ?? []).filter(
        (m) =>
          aguardaChiller2(m) &&
          m.user_id === userId &&
          !dismissed.has(`chiller2_${m.id}`) &&
          agora.getTime() - new Date(horaEfetiva(m)).getTime() >= ALERTA_CHILLER2_MIN * 60_000
      ),
    [emAndamento, agora, dismissed, userId]
  );

  const isVisible = Boolean(isInspetor && (pausaEstourada || chiller2Pendentes.length > 0 || ncSemRnc.length > 0 || rascunhosNc.length > 0 || pesosPendentes.length > 0 || fichasAtrasadas.length > 0 || rncsCriticas.length > 0));
  useAudioAlarm(isVisible && !minimizado);

  useEffect(() => {
    if (!isVisible) setMinimizado(false);
  }, [isVisible]);

  function dismiss(chave: string) {
    setDismissed((prev) => new Set(prev).add(chave));
  }

  if (!isVisible || minimizado) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border-4 border-destructive bg-background shadow-2xl">
        <div className="flex shrink-0 items-center justify-center gap-2 bg-destructive p-4 text-destructive-foreground">
          <AlertTriangle className="h-6 w-6 animate-pulse" />
          <h2 className="text-lg font-black uppercase tracking-wider">Aviso Importante</h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/40 p-5">
          {pausaEstourada && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive bg-destructive/10 p-4 text-center">
              <BellRing className="h-10 w-10 text-destructive" />
              <div>
                <h3 className="mb-1 text-lg font-black uppercase text-destructive">Tempo Excedido!</h3>
                <p className="mb-3 text-sm font-bold text-destructive">A {PAUSAS_CONFIG[pausaEstourada.tipo_pausa].label} estourou.</p>
                <div className="rounded bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground">
                  Encerre a pausa no Painel de Bordo.
                </div>
              </div>
            </div>
          )}

          {ncSemRnc.length > 0 && (
            <div data-testid="alerta-nc-sem-rnc">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Monitoramento com não conformidade
              </h3>
              <div className="flex flex-col gap-2">
                {ncSemRnc.map((nc) => (
                  <div key={nc.monitoramentoId} className="flex flex-col gap-3 rounded border-l-4 border-destructive bg-background p-4 shadow-sm">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{nc.nomeFicha}</h4>
                      <p className="mt-1 text-sm font-medium text-destructive">
                        Você tem um monitoramento finalizado com não conformidade. Emita agora um relatório de não conformidade.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          dismiss(`nc_${nc.monitoramentoId}`);
                          navigate(`/nova-rnc?vinculo=${nc.monitoramentoId}`);
                        }}
                      >
                        Emitir relatório agora
                      </Button>
                      <Button type="button" variant="outline" onClick={() => dismiss(`nc_${nc.monitoramentoId}`)}>
                        Depois
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rascunhosNc.length > 0 && (
            <div data-testid="alerta-rascunho-nc">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Rascunho não conforme aguardando assinatura
              </h3>
              <div className="flex flex-col gap-2">
                {rascunhosNc.map((r) => (
                  <div key={r.id} className="flex flex-col gap-3 rounded border-l-4 border-destructive bg-background p-4 shadow-sm">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{r.nomeFicha}</h4>
                      <p className="mt-1 text-sm font-medium text-destructive">
                        Este monitoramento está NÃO CONFORME e ainda é só um rascunho. Assine para emitir a RNC ou registrar a ação corretiva imediata.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          dismiss(`rascunho_nc_${r.id}`);
                          navigate("/fichas/nova");
                        }}
                      >
                        Ir assinar
                      </Button>
                      <Button type="button" variant="outline" onClick={() => dismiss(`rascunho_nc_${r.id}`)}>
                        Depois
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pesosPendentes.length > 0 && (
            <div data-testid="alerta-peso-pendente">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" /> Peso da balança pendente
              </h3>
              <div className="flex flex-col gap-2">
                {pesosPendentes.map((m) => (
                  <div key={m.id} className="flex flex-col gap-3 rounded border-l-4 border-primary bg-background p-4 shadow-sm">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Peso por caixa — {m.setor}</h4>
                      <p className="mt-1 text-[0.7rem] text-muted-foreground">
                        Aguardando o peso da balança há {Math.floor((agora.getTime() - new Date(horaEfetiva(m)).getTime()) / 60_000)} min. Ligue para a balança e complete o monitoramento:
                        a vazão e a rastreabilidade dependem desse peso.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          dismiss(`peso_${m.id}`);
                          navigate(`/fichas/peso/${m.id}`);
                        }}
                      >
                        Completar peso
                      </Button>
                      <Button type="button" variant="outline" onClick={() => dismiss(`peso_${m.id}`)}>
                        Ciente
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chiller2Pendentes.length > 0 && (
            <div data-testid="alerta-chiller2-pendente">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" /> Chiller 02 pendente
              </h3>
              <div className="flex flex-col gap-2">
                {chiller2Pendentes.map((m) => (
                  <div key={m.id} className="flex flex-col gap-3 rounded border-l-4 border-primary bg-background p-4 shadow-sm">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Controle de absorção — {m.setor}</h4>
                      <p className="mt-1 text-[0.7rem] text-muted-foreground">
                        Etapa 1 feita há {Math.floor((agora.getTime() - new Date(horaEfetiva(m)).getTime()) / 60_000)} min. Informe a temperatura e o borbulhamento do chiller 02 para concluir o monitoramento.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          dismiss(`chiller2_${m.id}`);
                          navigate(`/fichas/chiller2/${m.id}`);
                        }}
                      >
                        Informar chiller 02
                      </Button>
                      <Button type="button" variant="outline" onClick={() => dismiss(`chiller2_${m.id}`)}>
                        Ciente
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rncsCriticas.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> RNCs Críticas
              </h3>
              <div className="flex flex-col gap-2">
                {rncsCriticas.map((rnc) => (
                  <div key={rnc.monitoramentoId} className="flex flex-col gap-3 rounded border-l-4 border-destructive bg-background p-4 shadow-sm">
                    <div>
                      <span className="inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-destructive">
                        {rnc.isDevolvida ? "Devolvida" : "> 24h"}
                      </span>
                      <h4 className="mt-2 text-sm font-bold text-foreground">{rnc.nomeFicha}</h4>
                    </div>
                    <Button type="button" variant="destructive" className="w-full" onClick={() => dismiss(`rnc_${rnc.monitoramentoId}`)}>
                      Ciente
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fichasAtrasadas.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-black uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" /> Fichas Atrasadas
              </h3>
              <div className="flex flex-col gap-2">
                {fichasAtrasadas.map((f) => (
                  <div key={f.ficha.id} className="flex flex-col gap-3 rounded border-l-4 border-primary bg-background p-4 shadow-sm">
                    <div>
                      <h4 className="mb-1 text-sm font-bold text-foreground">{f.ficha.nome}</h4>
                      <p className="text-[0.7rem] text-muted-foreground">{f.motivo}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => {
                          dismiss(`ficha_${f.ficha.id}`);
                          navigate(urlNovaFicha(f.ficha, userSetores));
                        }}
                      >
                        Abrir monitoramento
                      </Button>
                      <Button type="button" variant="outline" onClick={() => dismiss(`ficha_${f.ficha.id}`)}>
                        Ciente
                      </Button>
                    </div>
                    {f.ficha.exige_processo_em_andamento && (
                      <Button
                        type="button"
                        variant="secondary"
                        data-testid={`processo-parado-${f.ficha.id}`}
                        onClick={() => setParadaDe(f)}
                      >
                        <PauseCircle className="h-4 w-4" /> Processo parado (justificar)
                      </Button>
                    )}
                    {f.ficha.encerravel && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={encerrarFicha.isPending}
                        data-testid={`encerrar-abate-${f.ficha.id}`}
                        onClick={() => encerrarFicha.mutate(f.ficha.codigo)}
                      >
                        Encerrar abate (sem cargas nos boxes)
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-center border-t bg-background p-3">
          {!pausaEstourada ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => setMinimizado(true)}>
              Minimizar
            </Button>
          ) : (
            <p className="w-full text-center text-xs font-bold text-destructive">Você deve encerrar a pausa.</p>
          )}
        </div>
      </div>
      {paradaDe && <ModalProcessoParado atrasada={paradaDe} userSetores={userSetores} onFechar={() => setParadaDe(null)} />}
    </div>
  );
}
