import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  AlertTriangle,
  AlertOctagon,
  ClipboardList,
  Wrench,
  Hammer,
  ChevronUp,
  ChevronDown,
  Timer,
  Camera,
  Coffee,
  Utensils,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  X,
} from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { useEquipamentosCadastrados, useDesviosCadastrados } from "@/modules/gestao/api";
import { supabase } from "@/lib/supabase";
import {
  turnoDoDia,
  useTurnoHoje,
  useIniciarTurno,
  useFinalizarTurno,
  usePausaAtiva,
  useRegistrarPausa,
  useEncerrarPausa,
  useRegistrarParada,
  useKpisTurno,
  useAssinarAdendo,
  PAUSAS_CONFIG,
  fichasAplicaveisAoInspetor,
  calcularFichasAtrasadas,
  type TipoPausa,
  type FichaAtivaResumo,
  type FichaAtrasada,
  type DesvioAtivo,
  type AdendoPendente,
} from "./api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const MOTIVOS_PARADA_FALLBACK = ["Higiene Operacional", "Manutenção Quebra", "Contaminação", "Falta de Matéria-Prima", "Intervenção SIF"];

type CategoriaKpi = "monitoramentos" | "fichasAtivas" | "fichasAtrasadas" | "rnc";

function formatarHoraManaus(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Manaus" });
}

function formatarMmSs(ms: number): string {
  const totalSegundos = Math.floor(ms / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function formatarCronometro(ms: number): string {
  const minutos = Math.floor(ms / 60000);
  const segundos = Math.floor((ms % 60000) / 1000);
  const centesimos = Math.floor((ms % 1000) / 10);
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")},${String(centesimos).padStart(2, "0")}`;
}

function paraDatetimeLocal(data: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

/** Cockpit de turno do INSPETOR_QUALIDADE — turno, ações rápidas, KPIs do dia, ferramentas
 * auxiliares, quadro de desvios pendentes e controle de pausas/refeições. Único componente,
 * estado local (useState/useEffect), sem libs de state machine/form/modal externas. */
export function PainelBordo() {
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: masterSetores } = useSetoresCadastrados();
  const { data: equipamentosCadastrados } = useEquipamentosCadastrados();
  const { data: desviosCadastrados } = useDesviosCadastrados();

  const userSetores = perfil && perfil.setoresPermitidos.length > 0 ? perfil.setoresPermitidos : masterSetores ?? [];
  const activeSetorLabel = userSetores.length === 1 ? userSetores[0] : userSetores.length > 1 ? `${userSetores.length} Setores (Múltiplos)` : "—";
  const isManutencaoInspector = userSetores.includes("Manutenções Diversas");

  const { data: turnoHoje } = useTurnoHoje(perfil?.id);
  const iniciarTurno = useIniciarTurno();
  const finalizarTurno = useFinalizarTurno();

  const pausaQuery = usePausaAtiva(perfil?.id);
  const pausaAtiva = pausaQuery.data;
  const registrarPausa = useRegistrarPausa();
  const encerrarPausa = useEncerrarPausa();
  const registrarParada = useRegistrarParada();
  const assinarAdendo = useAssinarAdendo();

  const kpisQuery = useKpisTurno(perfil?.id, userSetores);
  const kpis = kpisQuery.data;

  const [agora, setAgora] = useState(() => new Date());
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);
  const [activeBordoTab, setActiveBordoTab] = useState<"fichas" | "os">("fichas");
  const [ferramentasAbertas, setFerramentasAbertas] = useState(false);

  const [showConfirmTurno, setShowConfirmTurno] = useState(false);
  const [pausaParaConfirmar, setPausaParaConfirmar] = useState<TipoPausa | null>(null);
  const [showModalParada, setShowModalParada] = useState(false);
  const [categoriaKpiModal, setCategoriaKpiModal] = useState<CategoriaKpi | null>(null);
  const [desvioDetalhe, setDesvioDetalhe] = useState<DesvioAtivo | null>(null);
  const [adendoSelecionado, setAdendoSelecionado] = useState<AdendoPendente | null>(null);

  const [cronometroMs, setCronometroMs] = useState(0);
  const [cronometroRodando, setCronometroRodando] = useState(false);
  const inputCameraRef = useRef<HTMLInputElement>(null);

  const [paradaSetor, setParadaSetor] = useState("");
  const [paradaEquipamento, setParadaEquipamento] = useState("");
  const [paradaEquipamentoCustom, setParadaEquipamentoCustom] = useState(false);
  const [paradaMotivoSelecionado, setParadaMotivoSelecionado] = useState("");
  const [paradaMotivoCustomizado, setParadaMotivoCustomizado] = useState("");
  const [paradaDetalhes, setParadaDetalhes] = useState("");
  const [paradaHoraInicio, setParadaHoraInicio] = useState(() => paraDatetimeLocal(new Date()));
  const [paradaHoraFim, setParadaHoraFim] = useState("");

  // Catálogo cadastrado pelo admin (Painel de Gestão) — mesmo padrão do v1 (globalEquipamentos/
  // globalDesvios do MasterConfigContext): usa a lista cadastrada quando existir para o setor
  // selecionado, com "+Outro" liberando texto livre; cai no fallback hardcoded só quando o
  // catálogo de desvios está vazio (equipamento sempre cai para texto livre, sem fallback fixo,
  // pois não há uma lista genérica de equipamentos por setor sensata para hardcodar).
  const equipamentosDoSetor = (equipamentosCadastrados ?? []).filter((eq) => eq.setor === paradaSetor);
  const motivosParada = (desviosCadastrados ?? []).length > 0 ? (desviosCadastrados ?? []).map((d) => d.nome) : MOTIVOS_PARADA_FALLBACK;

  // Relógio de 1s: alimenta o GlobalClock, o cronômetro de pausa e o recálculo de atraso das
  // fichas (que depende de "agora" para saber se já passou dos minutos configurados).
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Cronômetro de aferição (ferramenta auxiliar) — precisão de centésimos.
  useEffect(() => {
    if (!cronometroRodando) return;
    const inicioReferencia = Date.now() - cronometroMs;
    const id = window.setInterval(() => setCronometroMs(Date.now() - inicioReferencia), 10);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cronometroRodando]);

  // Sem turno de hoje ainda (nem em andamento, nem finalizado): abre um agora. turnos_inspetores
  // é a fonte de verdade (banco), não localStorage — este painel é quem primeiro escreve nela.
  // turnoCriadoRef evita disparar duas vezes: entre a mutation resolver e o refetch de
  // turnoHoje chegar, `turnoHoje` ainda está null e `iniciarTurno.isPending` já voltou a false.
  const turnoCriadoRef = useRef(false);
  useEffect(() => {
    if (perfil && turnoHoje === null && !turnoCriadoRef.current) {
      turnoCriadoRef.current = true;
      iniciarTurno.mutate({ userId: perfil.id, setor: userSetores[0] ?? null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, turnoHoje]);

  // Realtime: primeiro consumidor deste mecanismo no projeto (ver migração
  // 20260925000001_painel_bordo.sql, que habilita a publicação pras duas tabelas abaixo).
  useEffect(() => {
    if (!perfil) return;
    const canal = supabase
      .channel("painel-bordo-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoramentos" }, () => {
        void kpisQuery.refetch();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pausas_inspetores", filter: `user_id=eq.${perfil.id}` },
        () => void pausaQuery.refetch()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  if (!perfil) return null;

  const shiftEnded = turnoHoje != null && turnoHoje.fim != null;

  if (shiftEnded) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="max-w-md space-y-4 rounded-xl border bg-background p-8 text-center shadow-lg">
          <CheckCircle2 className="mx-auto h-16 w-16 text-success" />
          <h1 className="text-2xl font-semibold">Turno Finalizado</h1>
          <p className="text-muted-foreground">
            Obrigado pelo trabalho de hoje, {perfil.nomeCompleto.split(" ")[0]}. As ferramentas operacionais deste painel
            ficam bloqueadas pelo resto do dia.
          </p>
          <Button
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" />
            Sair do Sistema
          </Button>
        </div>
      </div>
    );
  }

  const turnoCalculado = turnoDoDia(turnoHoje ? new Date(turnoHoje.inicio) : agora);
  const fichasAplicaveis = fichasAplicaveisAoInspetor(kpis?.fichasAtivas ?? [], userSetores);
  const fichasAtrasadas = turnoHoje ? calcularFichasAtrasadas(fichasAplicaveis, kpis?.monitoramentosHoje ?? [], new Date(turnoHoje.inicio), agora) : [];
  const desviosComRnc = (kpis?.desviosAtivos ?? []).filter((d) => d.rnc !== null);
  const bloqueadoPorPausa = pausaAtiva != null;

  function abrirTileKpi(categoria: CategoriaKpi, quantidade: number) {
    if (bloqueadoPorPausa) return;
    if (quantidade === 0) {
      setMensagem({ tipo: "error", texto: "Nenhum item encontrado." });
      return;
    }
    setCategoriaKpiModal(categoria);
  }

  async function confirmarFinalizarTurno() {
    if (!turnoHoje) return;
    try {
      await finalizarTurno.mutateAsync(turnoHoje.id);
      setShowConfirmTurno(false);
      setMensagem({ tipo: "success", texto: "Turno finalizado com sucesso." });
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao finalizar o turno." });
    }
  }

  async function confirmarPausa() {
    if (!pausaParaConfirmar) return;
    try {
      await registrarPausa.mutateAsync({ userId: perfil!.id, tipo: pausaParaConfirmar });
      setPausaParaConfirmar(null);
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao iniciar a pausa." });
    }
  }

  async function handleEncerrarPausa() {
    if (!pausaAtiva) return;
    try {
      await encerrarPausa.mutateAsync(pausaAtiva.id);
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao encerrar a pausa." });
    }
  }

  function handleCapturaFoto(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setMensagem({ tipo: "success", texto: "Foto salva localmente no dispositivo — anexe depois a um RNC." });
    }
    e.target.value = "";
  }

  async function handleRegistrarParada(e: FormEvent) {
    e.preventDefault();
    const motivoFinal = paradaMotivoSelecionado === "OUTRO" ? paradaMotivoCustomizado.trim() : paradaMotivoSelecionado;
    if (!motivoFinal || !paradaSetor) {
      setMensagem({ tipo: "error", texto: "Selecione o setor e o motivo da parada." });
      return;
    }
    try {
      await registrarParada.mutateAsync({
        inspetorId: perfil!.id,
        setor: paradaSetor,
        equipamento: paradaEquipamento.trim() || null,
        motivo: motivoFinal,
        detalhes: paradaDetalhes.trim() || null,
        horaInicio: new Date(paradaHoraInicio).toISOString(),
        horaFim: paradaHoraFim ? new Date(paradaHoraFim).toISOString() : null,
      });
      setMensagem({ tipo: "success", texto: "Parada de processo registrada." });
      setShowModalParada(false);
      setParadaEquipamento("");
      setParadaEquipamentoCustom(false);
      setParadaMotivoSelecionado("");
      setParadaMotivoCustomizado("");
      setParadaDetalhes("");
      setParadaHoraFim("");
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao registrar a parada." });
    }
  }

  async function handleAssinarAdendo() {
    if (!adendoSelecionado) return;
    try {
      await assinarAdendo.mutateAsync({
        monitoramentoId: adendoSelecionado.monitoramentoId,
        adendoId: adendoSelecionado.id,
        corrections: adendoSelecionado.corrections,
      });
      setAdendoSelecionado(null);
      setMensagem({ tipo: "success", texto: "Adendo assinado com sucesso." });
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao assinar o adendo." });
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <header className={`space-y-4 rounded-xl border bg-card p-5 transition-opacity ${bloqueadoPorPausa ? "opacity-50" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
              <Eye className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Painel de Bordo</h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Setor Operacional</p>
              <p className="font-medium">{activeSetorLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Turno Atual</p>
              <p className="font-medium">{turnoCalculado}</p>
            </div>
          </div>
        </div>
      </header>

      {mensagem && (
        <div
          className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
            mensagem.tipo === "success" ? "border-success bg-success/10 text-foreground" : "border-destructive bg-destructive/10 text-destructive"
          }`}
        >
          <span>{mensagem.texto}</span>
          <button type="button" onClick={() => setMensagem(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Fechar mensagem">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {kpis && kpis.adendosPendentes.length > 0 && (
        <div className="space-y-3 rounded-xl border border-warning bg-warning/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-5 w-5" />
            Ação Necessária: Adendos Pendentes ({kpis.adendosPendentes.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {kpis.adendosPendentes.map((adendo) => (
              <div key={adendo.id} className="flex items-center justify-between rounded-lg border bg-background p-3">
                <div>
                  <p className="font-medium">{kpis.nomesFicha.get(adendo.monitoramentoId)?.nome ?? "Monitoramento"}</p>
                  <p className="text-xs text-muted-foreground">Solicitado por {adendo.verificadorName}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setAdendoSelecionado(adendo)}>
                  Revisar e Assinar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isManutencaoInspector && (
        <div className="flex gap-2 border-b">
          <button
            type="button"
            onClick={() => setActiveBordoTab("fichas")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              activeBordoTab === "fichas" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Minhas Fichas e RNCs
          </button>
          <button
            type="button"
            onClick={() => setActiveBordoTab("os")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              activeBordoTab === "os" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <Wrench className="h-4 w-4" />
            Acompanhamento de OS
          </button>
        </div>
      )}

      {isManutencaoInspector && activeBordoTab === "os" ? (
        <div className="space-y-4 rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Ordens de Serviço de Manutenção</h2>
            <Button type="button" onClick={() => navigate("/pcm/nova")} disabled={bloqueadoPorPausa}>
              <Hammer className="h-4 w-4" />
              Nova Solicitação
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Acompanhamento completo (abertura, autorização, programação, execução e validação) fica na tela de Ordens de
            Serviço.
          </p>
          <Button type="button" variant="outline" onClick={() => navigate("/pcm")}>
            Ver Ordens de Serviço
          </Button>
        </div>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-3 ${bloqueadoPorPausa ? "pointer-events-none opacity-60" : ""}`}>
            <button
              type="button"
              onClick={() => navigate("/fichas/nova")}
              className="rounded-xl bg-primary p-5 text-left text-primary-foreground shadow transition-transform hover:scale-[1.02] hover:bg-primary-active"
            >
              <Eye className="mb-6 h-8 w-8 opacity-90" />
              <p className="text-xs uppercase tracking-wide opacity-80">Inspeção e Qualidade</p>
              <p className="text-lg font-semibold">Fichas de Monitoramento</p>
            </button>

            <button
              type="button"
              onClick={() => navigate("/nova-rnc")}
              className="rounded-xl border border-down/20 bg-down-soft p-5 text-left text-down shadow-sm transition-transform hover:scale-[1.02] hover:bg-down/10"
            >
              <AlertTriangle className="mb-6 h-8 w-8" />
              <p className="text-xs uppercase tracking-wide opacity-80">Registrar Desvio</p>
              <p className="text-lg font-semibold">Abertura de RNC</p>
            </button>

            <button
              type="button"
              onClick={() => setShowModalParada(true)}
              className="rounded-xl bg-down p-5 text-left text-white shadow transition-transform hover:scale-[1.02] hover:opacity-90"
            >
              <AlertOctagon className="mb-6 h-8 w-8 opacity-90" />
              <p className="text-xs uppercase tracking-wide opacity-80">Bloqueio Operacional</p>
              <p className="text-lg font-semibold">Parada de Processo</p>
            </button>
          </div>

          <div className={`grid gap-4 sm:grid-cols-4 ${bloqueadoPorPausa ? "pointer-events-none opacity-60" : ""}`}>
            <KpiTile
              titulo="Monitoramentos"
              tag="Turno"
              valor={kpis?.monitoramentosHoje.length ?? 0}
              tom="primary"
              onClick={() => abrirTileKpi("monitoramentos", kpis?.monitoramentosHoje.length ?? 0)}
            />
            <KpiTile
              titulo="Fichas Ativas"
              tag="Setor"
              valor={fichasAplicaveis.length}
              tom="neutro"
              onClick={() => abrirTileKpi("fichasAtivas", fichasAplicaveis.length)}
            />
            <KpiTile
              titulo="Fichas Atrasadas"
              tag="Atenção"
              valor={fichasAtrasadas.length}
              tom="destrutivo"
              onClick={() => abrirTileKpi("fichasAtrasadas", fichasAtrasadas.length)}
            />
            <KpiTile
              titulo="RNC em Tratativa"
              tag="Gestor"
              valor={desviosComRnc.length}
              tom="alerta"
              onClick={() => abrirTileKpi("rnc", desviosComRnc.length)}
            />
          </div>

          <div className="rounded-xl border">
            <button
              type="button"
              onClick={() => setFerramentasAbertas((a) => !a)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            >
              Ferramentas Auxiliares
              {ferramentasAbertas ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {ferramentasAbertas && (
              <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="flex items-center gap-2 font-medium">
                    <Timer className="h-4 w-4" />
                    Cronômetro de Aferição
                  </p>
                  <p className="text-center font-mono text-3xl">{formatarCronometro(cronometroMs)}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={bloqueadoPorPausa}
                      onClick={() => setCronometroRodando((r) => !r)}
                    >
                      {cronometroRodando ? "Pausar" : cronometroMs > 0 ? "Continuar" : "Iniciar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bloqueadoPorPausa}
                      onClick={() => {
                        setCronometroRodando(false);
                        setCronometroMs(0);
                      }}
                    >
                      Zerar
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={bloqueadoPorPausa}
                  onClick={() => inputCameraRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted disabled:pointer-events-none"
                >
                  <Camera className="h-8 w-8" />
                  Câmera Local
                  <span className="text-xs">Foto fica salva no dispositivo para anexar depois a um RNC.</span>
                  <input
                    ref={inputCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleCapturaFoto}
                  />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-medium">Histórico de Fichas com Desvios (Pendentes de Encerramento)</h2>
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${bloqueadoPorPausa ? "pointer-events-none opacity-60" : ""}`}>
              {(kpis?.desviosAtivos.length ?? 0) === 0 && (
                <div className="col-span-full rounded-lg border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
                  Nenhum desvio pendente... Todas as suas RNCs já foram encerradas!
                </div>
              )}
              {kpis?.desviosAtivos.map((desvio) => (
                <CardDesvio
                  key={desvio.monitoramentoId}
                  desvio={desvio}
                  fichaNome={kpis.nomesFicha.get(desvio.fichaTemplateId)?.nome ?? "Ficha"}
                  onSemRnc={() => navigate(`/nova-rnc?vinculo=${desvio.monitoramentoId}`)}
                  onComRnc={() => setDesvioDetalhe(desvio)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="space-y-4 rounded-xl bg-surface-dark p-5 text-ondark">
        <p className="flex items-center gap-2 font-semibold">
          <Coffee className="h-5 w-5" />
          Controle de Pausas e Refeições
        </p>

        {!pausaAtiva ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(PAUSAS_CONFIG) as TipoPausa[]).map((tipo) => {
              const cfg = PAUSAS_CONFIG[tipo];
              const Icone = tipo === "CURTA_20M" ? Coffee : Utensils;
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setPausaParaConfirmar(tipo)}
                  className="space-y-1 rounded-lg border border-white/20 bg-surface-elevated p-4 text-left shadow-md transition-colors hover:bg-primary-active"
                >
                  <Icone className="h-5 w-5 text-lime" />
                  <p className="font-medium text-ondark">{cfg.label}</p>
                  <p className="text-xs text-ondark-soft">{cfg.desc}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <PainelPausaAtiva
            tipo={pausaAtiva.tipo_pausa}
            horaInicio={pausaAtiva.hora_inicio}
            agora={agora}
            onEncerrar={handleEncerrarPausa}
            encerrando={encerrarPausa.isPending}
          />
        )}
      </div>

      {!shiftEnded && turnoHoje && (
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          onClick={() => setShowConfirmTurno(true)}
        >
          <LogOut className="h-4 w-4" />
          FINALIZAR TURNO
        </Button>
      )}

      {showModalParada && (
        <ModalBase titulo="Parada de Processo" icone={<AlertOctagon className="h-5 w-5" />} corHeaderClasse="bg-destructive" onFechar={() => setShowModalParada(false)}>
          <form onSubmit={handleRegistrarParada} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paradaSetor">Setor Afetado</Label>
              <Select id="paradaSetor" required value={paradaSetor} onChange={(e) => setParadaSetor(e.target.value)}>
                <option value="">Selecione…</option>
                {userSetores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paradaEquipamento">Equipamento/Linha</Label>
              {equipamentosDoSetor.length > 0 && !paradaEquipamentoCustom ? (
                <Select
                  id="paradaEquipamento"
                  value={paradaEquipamento}
                  disabled={!paradaSetor}
                  onChange={(e) => {
                    if (e.target.value === "OUTRO") {
                      setParadaEquipamentoCustom(true);
                      setParadaEquipamento("");
                    } else {
                      setParadaEquipamento(e.target.value);
                    }
                  }}
                >
                  <option value="">Selecione o equipamento…</option>
                  {equipamentosDoSetor.map((eq) => (
                    <option key={eq.id} value={eq.nome}>
                      {eq.codigo ? `${eq.codigo} - ` : ""}
                      {eq.nome}
                    </option>
                  ))}
                  <option value="OUTRO">+ Outro (Não Listado)</option>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="paradaEquipamento"
                    placeholder="Ex: Chiller 2, Linha de corte…"
                    value={paradaEquipamento}
                    onChange={(e) => setParadaEquipamento(e.target.value)}
                  />
                  {equipamentosDoSetor.length > 0 && (
                    <Button type="button" variant="outline" onClick={() => { setParadaEquipamentoCustom(false); setParadaEquipamento(""); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paradaMotivo">Motivo da Parada</Label>
              <Select id="paradaMotivo" required value={paradaMotivoSelecionado} onChange={(e) => setParadaMotivoSelecionado(e.target.value)}>
                <option value="">Selecione…</option>
                {motivosParada.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                <option value="OUTRO">+ Outro Motivo (Não Listado)</option>
              </Select>
              {paradaMotivoSelecionado === "OUTRO" && (
                <Input
                  required
                  placeholder="Descreva o motivo…"
                  value={paradaMotivoCustomizado}
                  onChange={(e) => setParadaMotivoCustomizado(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paradaDetalhes">Detalhes da Ocorrência</Label>
              <Textarea id="paradaDetalhes" value={paradaDetalhes} onChange={(e) => setParadaDetalhes(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paradaInicio">Hora de Início</Label>
                <Input
                  id="paradaInicio"
                  type="datetime-local"
                  required
                  value={paradaHoraInicio}
                  onChange={(e) => setParadaHoraInicio(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paradaFim">Hora de Final</Label>
                <Input id="paradaFim" type="datetime-local" value={paradaHoraFim} onChange={(e) => setParadaHoraFim(e.target.value)} />
              </div>
            </div>

            <Button type="submit" disabled={registrarParada.isPending} className="w-full">
              {registrarParada.isPending ? "Registrando…" : "Registrar Parada"}
            </Button>
          </form>
        </ModalBase>
      )}

      {showConfirmTurno && (
        <ModalConfirmacao
          icone={<LogOut className="h-6 w-6" />}
          titulo="Finalizar Turno?"
          mensagem="As ferramentas operacionais deste painel serão bloqueadas pelo resto do dia."
          textoConfirmar={finalizarTurno.isPending ? "Finalizando..." : "Finalizar Turno"}
          confirmando={finalizarTurno.isPending}
          onCancelar={() => setShowConfirmTurno(false)}
          onConfirmar={confirmarFinalizarTurno}
        />
      )}

      {pausaParaConfirmar && (
        <ModalConfirmacao
          icone={pausaParaConfirmar === "CURTA_20M" ? <Coffee className="h-6 w-6" /> : <Utensils className="h-6 w-6" />}
          titulo={PAUSAS_CONFIG[pausaParaConfirmar].label}
          mensagem={`Iniciar "${PAUSAS_CONFIG[pausaParaConfirmar].desc}" agora?`}
          textoConfirmar={registrarPausa.isPending ? "Iniciando..." : "Iniciar Pausa"}
          confirmando={registrarPausa.isPending}
          onCancelar={() => setPausaParaConfirmar(null)}
          onConfirmar={confirmarPausa}
        />
      )}

      {categoriaKpiModal && kpis && (
        <ModalListaKpi
          categoria={categoriaKpiModal}
          kpis={kpis}
          fichasAplicaveis={fichasAplicaveis}
          fichasAtrasadas={fichasAtrasadas}
          desviosComRnc={desviosComRnc}
          onFechar={() => setCategoriaKpiModal(null)}
        />
      )}

      {desvioDetalhe && (
        <ModalBase
          titulo="Status da RNC"
          icone={<ShieldCheck className="h-5 w-5" />}
          corHeaderClasse="bg-primary"
          onFechar={() => setDesvioDetalhe(null)}
        >
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Ficha:</span> {kpis?.nomesFicha.get(desvioDetalhe.fichaTemplateId)?.nome ?? "—"}
            </p>
            <p>
              <span className="font-medium">Status da RNC:</span> {desvioDetalhe.rnc?.status}
            </p>
            <p className="text-muted-foreground">
              O tratamento desta RNC é feito pelo Gestor de Setor — este painel só mostra o andamento.
            </p>
          </div>
        </ModalBase>
      )}

      {adendoSelecionado && (
        <ModalBase titulo="Assinatura de Adendo" icone={<ShieldCheck className="h-5 w-5" />} corHeaderClasse="bg-warning" onFechar={() => setAdendoSelecionado(null)}>
          <div className="space-y-4">
            <p className="font-medium">{kpis?.nomesFicha.get(adendoSelecionado.monitoramentoId)?.nome ?? "Monitoramento"}</p>

            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="italic">"{adendoSelecionado.notes}"</p>
              <p className="mt-1 text-xs text-muted-foreground">— {adendoSelecionado.verificadorName}</p>
            </div>

            {Object.keys(adendoSelecionado.corrections).length > 0 && (
              <div className="space-y-1 text-sm">
                {Object.entries(adendoSelecionado.corrections).map(([campo, correcao]) => (
                  <div key={campo} className="flex items-center gap-2">
                    <span className="font-medium">{campo}:</span>
                    <span className="text-destructive line-through">{String(correcao.old)}</span>
                    <span>→</span>
                    <span className="font-bold text-success">{String(correcao.new)}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="rounded-md border border-warning bg-warning/10 p-2 text-xs text-warning">
              Assinar altera definitivamente os valores da ficha original.
            </p>

            <Button onClick={handleAssinarAdendo} disabled={assinarAdendo.isPending} className="w-full bg-success text-success-foreground hover:opacity-90">
              <ShieldCheck className="h-4 w-4" />
              {assinarAdendo.isPending ? "Assinando…" : "Assinar Digitalmente (Sessão)"}
            </Button>
          </div>
        </ModalBase>
      )}
    </div>
  );
}

const TOM_KPI = {
  primary: "text-primary",
  neutro: "text-foreground",
  destrutivo: "text-destructive",
  alerta: "text-warning",
} as const;

function KpiTile({
  titulo,
  tag,
  valor,
  tom,
  onClick,
}: {
  titulo: string;
  tag: string;
  valor: number;
  tom: keyof typeof TOM_KPI;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-kpi rounded-xl border border-white/65 p-4 text-left shadow-md transition-transform hover:scale-[1.02]"
    >
      <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{tag}</span>
      <p className={`mt-3 font-mono text-3xl font-medium ${TOM_KPI[tom]}`}>{valor}</p>
      <p className="text-sm text-muted-foreground">{titulo}</p>
    </button>
  );
}

function CardDesvio({
  desvio,
  fichaNome,
  onSemRnc,
  onComRnc,
}: {
  desvio: DesvioAtivo;
  fichaNome: string;
  onSemRnc: () => void;
  onComRnc: () => void;
}) {
  if (!desvio.rnc) {
    return (
      <button type="button" onClick={onSemRnc} className="space-y-2 rounded-lg bg-destructive p-4 text-left text-destructive-foreground shadow">
        <span className="inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase">Desvio</span>
        <p className="text-xs opacity-80">{formatarHoraManaus(desvio.criadoEm)}</p>
        <p className="line-clamp-2 font-medium">{fichaNome}</p>
        <p className="flex animate-pulse items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          Emitir RNC Vinculada
        </p>
      </button>
    );
  }

  const ESTILO_STATUS = {
    ABERTA: { texto: "Aguardando Gestor", classe: "border-warning bg-warning/10 text-warning" },
    EM_TRATATIVA: { texto: "Em Tratativa", classe: "border-warning bg-warning/10 text-warning" },
    TRATADA: { texto: "Tratada — Aguardando Revisão do Verificador", classe: "border-primary bg-primary/10 text-primary" },
    DEVOLVIDA: { texto: "Devolvida pelo Verificador", classe: "border-destructive bg-destructive/10 text-destructive" },
    REABERTA: { texto: "Reaberta pela Administração", classe: "border-destructive bg-destructive/10 text-destructive" },
  } satisfies Record<string, { texto: string; classe: string }>;
  const estilo: { texto: string; classe: string } =
    (ESTILO_STATUS as Record<string, { texto: string; classe: string }>)[desvio.rnc.status] ?? ESTILO_STATUS.ABERTA;

  return (
    <button type="button" onClick={onComRnc} className={`space-y-2 rounded-lg border p-4 text-left shadow-sm ${estilo.classe}`}>
      <span className="inline-block rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase">RNC Vinculada</span>
      <p className="text-xs opacity-80">{formatarHoraManaus(desvio.criadoEm)}</p>
      <p className="line-clamp-2 font-medium text-foreground">{fichaNome}</p>
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="h-4 w-4" />
        {estilo.texto}
      </p>
    </button>
  );
}

function PainelPausaAtiva({
  tipo,
  horaInicio,
  agora,
  onEncerrar,
  encerrando,
}: {
  tipo: TipoPausa;
  horaInicio: string;
  agora: Date;
  onEncerrar: () => void;
  encerrando: boolean;
}) {
  const cfg = PAUSAS_CONFIG[tipo];
  const decorridoMs = agora.getTime() - new Date(horaInicio).getTime();
  const limiteMs = cfg.limiteMin * 60 * 1000;
  const isOverdue = decorridoMs > limiteMs;
  const exibidoMs = isOverdue ? decorridoMs - limiteMs : decorridoMs;

  return (
    <div className={`space-y-3 rounded-lg p-5 text-center ${isOverdue ? "animate-pulse bg-destructive/80" : "bg-surface-elevated"}`}>
      <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase">EM ANDAMENTO: {cfg.label}</span>
      <p className={`font-mono text-4xl font-bold ${isOverdue ? "text-white" : ""}`}>
        {isOverdue ? "-" : ""}
        {formatarMmSs(exibidoMs)}
      </p>
      {isOverdue && (
        <p className="flex animate-bounce items-center justify-center gap-1.5 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4" />
          RETORNO ATRASADO! CLIQUE EM FINALIZAR
        </p>
      )}
      <Button type="button" onClick={onEncerrar} disabled={encerrando} className="bg-white text-black hover:bg-white/90">
        {encerrando ? "Finalizando…" : "Finalizar Pausa / Retorno ao Trabalho"}
      </Button>
    </div>
  );
}

function ModalBase({
  titulo,
  icone,
  corHeaderClasse,
  onFechar,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  corHeaderClasse: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className={`flex items-center justify-between rounded-t-xl px-4 py-3 text-white ${corHeaderClasse}`}>
          <span className="flex items-center gap-2 font-semibold">
            {icone}
            {titulo}
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ModalConfirmacao({
  icone,
  titulo,
  mensagem,
  textoConfirmar,
  confirmando,
  onCancelar,
  onConfirmar,
}: {
  icone: React.ReactNode;
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
  confirmando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">{icone}</div>
        <h3 className="text-lg font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground">{mensagem}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={confirmando} onClick={onConfirmar}>
            {textoConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ModalListaKpi({
  categoria,
  kpis,
  fichasAplicaveis,
  fichasAtrasadas,
  desviosComRnc,
  onFechar,
}: {
  categoria: CategoriaKpi;
  kpis: NonNullable<ReturnType<typeof useKpisTurno>["data"]>;
  fichasAplicaveis: FichaAtivaResumo[];
  fichasAtrasadas: FichaAtrasada[];
  desviosComRnc: DesvioAtivo[];
  onFechar: () => void;
}) {
  const TITULOS: Record<CategoriaKpi, string> = {
    monitoramentos: "Monitoramentos de Hoje",
    fichasAtivas: "Fichas Ativas",
    fichasAtrasadas: "Fichas Atrasadas",
    rnc: "RNC em Tratativa",
  };

  let itens: string[] = [];
  if (categoria === "monitoramentos") {
    itens = kpis.monitoramentosHoje.map((m) => `${formatarHoraManaus(m.criado_em)} - ${kpis.nomesFicha.get(m.ficha_template_id)?.nome ?? "Ficha"}`);
  } else if (categoria === "fichasAtivas") {
    itens = fichasAplicaveis.map((f) => `${f.codigo} - ${f.nome}`);
  } else if (categoria === "fichasAtrasadas") {
    itens = fichasAtrasadas.map((a) => `${a.ficha.codigo} - ${a.ficha.nome} (${a.motivo})`);
  } else {
    itens = desviosComRnc.map((d) => `${formatarHoraManaus(d.criadoEm)} - ${kpis.nomesFicha.get(d.fichaTemplateId)?.nome ?? "Ficha"}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="rounded-t-xl bg-primary px-4 py-3 text-center text-primary-foreground">
          <p className="font-semibold">{TITULOS[categoria]}</p>
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto p-4 text-sm">
          {itens.map((texto, i) => (
            <li key={i} className="border-b py-1.5 last:border-b-0">
              {texto}
            </li>
          ))}
        </ul>
        <div className="border-t p-3 text-center">
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
