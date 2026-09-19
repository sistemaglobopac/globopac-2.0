import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { supabase } from "@/lib/supabase";
import { useAudioAlarm } from "@/modules/fichas/useAudioAlarm";
import { Button } from "@/shared/ui/button";
import {
  PAUSAS_CONFIG,
  calcularFichasAtrasadas,
  fichasAplicaveisAoInspetor,
  useKpisTurno,
  usePausaAtiva,
  useTurnoHoje,
  type FichaAtrasada,
} from "./api";

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
  const { data: masterSetores } = useSetoresCadastrados();
  const isInspetor = perfil?.nivelAcesso === "INSPETOR_QUALIDADE";
  const userId = isInspetor ? perfil?.id : undefined;
  const userSetores = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);

  const { data: turnoHoje } = useTurnoHoje(userId);
  const { data: pausaAtiva } = usePausaAtiva(userId);
  const turnoAtivo = Boolean(turnoHoje && !turnoHoje.fim);
  const { data: kpis } = useKpisTurno(turnoAtivo ? userId : undefined, userSetores);

  const [agora, setAgora] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [minimizado, setMinimizado] = useState(false);

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

  const pausaEstourada = useMemo(() => {
    if (!pausaAtiva) return null;
    const limiteMs = PAUSAS_CONFIG[pausaAtiva.tipo_pausa].limiteMin * 60_000;
    return agora.getTime() - new Date(pausaAtiva.hora_inicio).getTime() > limiteMs ? pausaAtiva : null;
  }, [pausaAtiva, agora]);

  const fichasAtrasadas: FichaAtrasada[] = useMemo(() => {
    if (!kpis || !turnoAtivo || !turnoHoje) return [];
    const aplicaveis = fichasAplicaveisAoInspetor(kpis.fichasAtivas, userSetores);
    return calcularFichasAtrasadas(aplicaveis, kpis.monitoramentosHoje, new Date(turnoHoje.inicio), agora).filter(
      (f) => !dismissed.has(`ficha_${f.ficha.id}`)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpis, turnoAtivo, turnoHoje, agora, dismissed]);

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

  const isVisible = Boolean(isInspetor && (pausaEstourada || fichasAtrasadas.length > 0 || rncsCriticas.length > 0));
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
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border-4 border-destructive bg-background shadow-2xl">
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
                    <Button type="button" className="w-full" onClick={() => dismiss(`ficha_${f.ficha.id}`)}>
                      Ciente
                    </Button>
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
    </div>
  );
}
