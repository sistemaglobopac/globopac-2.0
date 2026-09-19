import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardCheck, Filter, Layers, Loader2, Sparkles, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { useRncsAbertas } from "@/modules/rnc/api";
import { supabase } from "@/lib/supabase";
import type { CampoTemplate } from "@/shared/schema-campos";
import {
  pacsDoTemplate,
  useAbrirAdendo,
  useFichasTemplatesTodas,
  useFilaVerificacao,
  useUsuariosMap,
  useVerificarLote,
  useVerificarMonitoramento,
} from "./api";
import { diaTurno, turnosBloqueadosMap, turnosPendentes, encerrarTurnoAdmin } from "./utils/turnoUtils";
import { groupFichaCards, calcularOrdemDia, type AppointmentDisplay, type MonitoramentoVerificacao, type StatusVerificacao } from "./utils/recordGrouping";
import { ensureLocalTime } from "./utils/tempo";
import { KpiCard } from "./components/KpiCard";
import { AuditRecordCard } from "./components/AuditRecordCard";
import { DossieVerificacaoCard } from "./components/DossieVerificacaoCard";
import { DadosColetados } from "./components/DadosColetadosFicha";
import { RelatorioModal } from "./components/relatorio/RelatorioModal";
import type { DossieVerificacao } from "./utils/recordGrouping";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const PESO_STATUS: Record<StatusVerificacao, number> = { aguardando: 1, adendo_pendente: 2, verificado: 3 };

const SEVERIDADES = ["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const;
const ROTULO_SEVERIDADE: Record<(typeof SEVERIDADES)[number], string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

function statusDoItem(m: MonitoramentoVerificacao): StatusVerificacao {
  const adendos = (m.dados_dinamicos as { adendos?: { status: string }[] } | null)?.adendos;
  if (Array.isArray(adendos) && adendos.some((a) => a.status === "pending_monitor")) return "adendo_pendente";
  if (m.verificado_por) return "verificado";
  return "aguardando";
}

function hojeManaus(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
}

/** Fila de QA do VERIFICADOR (e ADMIN_MASTER, com visão global): revisão, assinatura em lote
 * e abertura de adendos nos monitoramentos registrados pelos inspetores. */
export function PainelVerificacao() {
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: masterSetores } = useSetoresCadastrados();
  const { data: templates } = useFichasTemplatesTodas();
  const { data: usersMap } = useUsuariosMap();
  const { data: rncsAbertas } = useRncsAbertas();

  const [dateBase, setDateBase] = useState(hojeManaus);
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);
  const [filtroPac, setFiltroPac] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusVerificacao | null>(null);
  const [filtroInspetor, setFiltroInspetor] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchPassword, setBatchPassword] = useState("");
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<AppointmentDisplay | null>(null);
  const [relatorioIds, setRelatorioIds] = useState<string[] | null>(null);
  const [encerrarAlvo, setEncerrarAlvo] = useState<{ userId: string; dia: string; nome: string } | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  const usuarios = useMemo(() => usersMap ?? new Map<string, string>(), [usersMap]);
  const isAdmin = perfil?.nivelAcesso === "ADMIN_MASTER";
  const userSetores = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);
  const setoresDisponiveis = isAdmin ? masterSetores ?? [] : userSetores;

  const templateIdsDoPac = useMemo(() => {
    if (!filtroPac || !templates) return null;
    return templates.filter((t) => pacsDoTemplate(t).includes(filtroPac)).map((t) => t.id);
  }, [filtroPac, templates]);

  const fila = useFilaVerificacao({ setor: filtroSetor, pac: filtroPac }, templateIdsDoPac);

  useEffect(() => {
    const canal = supabase
      .channel("painel-verificacao-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "monitoramentos" }, () => void fila.refetch())
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pacPorTemplateId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of templates ?? []) mapa.set(t.id, pacsDoTemplate(t).join(" / ") || "—");
    return mapa;
  }, [templates]);
  const nomePorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.nome])), [templates]);
  const codigoPorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.codigo])), [templates]);
  const camposPorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.schema_campos])), [templates]);
  const uniquePacs = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates ?? []) for (const pac of pacsDoTemplate(t)) set.add(pac);
    return [...set].sort();
  }, [templates]);
  const uniqueInspetores = useMemo(() => [...usuarios.values()].sort(), [usuarios]);

  const brutos = useMemo(() => [...(fila.data?.pendentes ?? []), ...(fila.data?.verificados ?? [])], [fila.data]);
  const ordemDiaMap = useMemo(() => calcularOrdemDia(brutos), [brutos]);
  const displayItems: AppointmentDisplay[] = useMemo(
    () => brutos.map((m) => ({ id: m.id, status: statusDoItem(m), appt: m, ordemDia: ordemDiaMap.get(m.id) ?? 1 })),
    [brutos, ordemDiaMap]
  );

  const filtrados = useMemo(() => {
    return displayItems.filter((item) => {
      if (filtroStatus && item.status !== filtroStatus) return false;
      if (filtroInspetor) {
        const nome = usuarios.get(item.appt.user_id) ?? "";
        if (!nome.toLowerCase().includes(filtroInspetor.toLowerCase())) return false;
      }
      return true;
    });
  }, [displayItems, filtroStatus, filtroInspetor, usuarios]);

  const pendingAppointments = useMemo(
    () =>
      filtrados
        .filter((i) => i.status !== "verificado")
        .sort((a, b) => PESO_STATUS[a.status] - PESO_STATUS[b.status] || new Date(b.appt.criado_em).getTime() - new Date(a.appt.criado_em).getTime()),
    [filtrados]
  );
  const verifiedToday = useMemo(
    () => filtrados.filter((i) => i.status === "verificado" && ensureLocalTime(i.appt.verificado_em ?? i.appt.criado_em).isoLocal === dateBase),
    [filtrados, dateBase]
  );

  const pendingKey = pendingAppointments.map((i) => i.id).join(",");
  useEffect(() => {
    let cancelado = false;
    turnosBloqueadosMap(pendingAppointments.map((i) => ({ id: i.id, user_id: i.appt.user_id, criado_em: i.appt.criado_em }))).then((set) => {
      if (!cancelado) setBlockedIds(set);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  const { dossies, avulsos } = useMemo(
    () => groupFichaCards(pendingAppointments, blockedIds, usuarios, pacPorTemplateId, codigoPorTemplateId),
    [pendingAppointments, blockedIds, usuarios, pacPorTemplateId, codigoPorTemplateId]
  );

  const kpiAguardando = displayItems.filter((i) => i.status === "aguardando").length;
  const kpiVerificadas = displayItems.filter(
    (i) => i.status === "verificado" && ensureLocalTime(i.appt.verificado_em ?? i.appt.criado_em).isoLocal === dateBase
  ).length;
  const kpiAdendos = displayItems.filter((i) => i.status === "adendo_pendente").length;
  // Conta o que está TRATADA — é a fila de revisão do próprio VERIFICADOR (useRevisarRnc, em
  // /rnc), não o total de RNCs em qualquer estágio; ABERTA/REABERTA/DEVOLVIDA ainda estão com
  // o Gestor de Setor e não exigem ação do Verificador ainda.
  const kpiRncTratativa = (rncsAbertas ?? []).filter((r) => r.status === "TRATADA").length;

  const filtrosAtivos = Boolean(filtroSetor || filtroPac || filtroStatus || filtroInspetor || dateBase !== hojeManaus());

  const verificarLote = useVerificarLote();

  function limparFiltros() {
    setFiltroSetor(null);
    setFiltroPac(null);
    setFiltroStatus(null);
    setFiltroInspetor(null);
    setDateBase(hojeManaus());
  }

  function alterarDia(delta: number) {
    const partes = dateBase.split("-");
    const ano = Number(partes[0]);
    const mes = Number(partes[1]);
    const dia = Number(partes[2]);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    data.setUTCDate(data.getUTCDate() + delta);
    setDateBase(data.toISOString().slice(0, 10));
  }

  function toggleSelection(id: string) {
    const item = pendingAppointments.find((i) => i.id === id);
    if (!item || item.status !== "aguardando" || blockedIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroupSelection(ids: string[]) {
    const todasSelecionadas = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (todasSelecionadas) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function selecionarPendentes() {
    const elegiveis = pendingAppointments.filter((i) => i.status === "aguardando" && !blockedIds.has(i.id)).map((i) => i.id);
    const todasJa = elegiveis.length > 0 && elegiveis.every((id) => selectedIds.has(id));
    setSelectedIds(todasJa ? new Set() : new Set(elegiveis));
  }

  async function abrirModalLote() {
    const selecionados = pendingAppointments.filter((i) => selectedIds.has(i.id));
    const pendentesTurno = await turnosPendentes(selecionados.map((i) => ({ user_id: i.appt.user_id, criado_em: i.appt.criado_em })));
    if (pendentesTurno.length > 0) {
      setMensagem({
        tipo: "error",
        texto: "Algum inspetor selecionado ainda não finalizou o turno do dia. Aguarde ou peça a um administrador para encerrar manualmente.",
      });
      return;
    }
    setBatchError(null);
    setShowBatchModal(true);
  }

  async function confirmarAssinaturaLote() {
    setBatchError(null);
    const { data: userData, error: erroUser } = await supabase.auth.getUser();
    if (erroUser || !userData.user?.email) {
      setBatchError("Não foi possível identificar seu usuário. Faça login novamente.");
      return;
    }

    setIsSubmittingBatch(true);
    const { error: erroSenha } = await supabase.auth.signInWithPassword({ email: userData.user.email, password: batchPassword });
    if (erroSenha) {
      setIsSubmittingBatch(false);
      setBatchError("Senha incorreta. A assinatura em lote falhou.");
      return;
    }

    const ids = [...selectedIds];
    setBatchProgress({ current: 0, total: ids.length });
    const resultados = await verificarLote.mutateAsync({
      ids,
      onProgress: (atual, total) => setBatchProgress({ current: atual, total }),
    });

    setIsSubmittingBatch(false);
    setBatchProgress(null);
    setBatchPassword("");
    setShowBatchModal(false);
    setSelectedIds(new Set());

    const falhas = resultados.filter((r) => !r.ok);
    setMensagem({
      tipo: falhas.length === 0 ? "success" : "error",
      texto:
        falhas.length === 0
          ? `${resultados.length} ficha(s) assinada(s) com sucesso.`
          : `${resultados.length - falhas.length} de ${resultados.length} assinada(s) — ${falhas.length} falharam.`,
    });
  }

  async function confirmarEncerrarTurno() {
    if (!encerrarAlvo) return;
    try {
      await encerrarTurnoAdmin(encerrarAlvo.userId, encerrarAlvo.dia);
      setMensagem({ tipo: "success", texto: `Turno de ${encerrarAlvo.nome} encerrado.` });
      setEncerrarAlvo(null);
      void fila.refetch();
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao encerrar o turno." });
    }
  }

  if (!perfil) return null;

  return (
    <div className="space-y-6 pb-10">
      <header className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Painel de Verificação</h1>
              <p className="text-sm text-muted-foreground">Fila de QA — revisão, assinatura e adendos</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => alterarDia(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium">{ensureLocalTime(`${dateBase}T12:00:00`).datePt}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => alterarDia(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant={filtrosAtivos ? "default" : "outline"} size="sm" onClick={() => setShowFilters(true)}>
              <Filter className="h-4 w-4" />
              Filtros Avançados
              {filtrosAtivos && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">Ativo</span>}
            </Button>
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
          <button type="button" onClick={() => setMensagem(null)} aria-label="Fechar mensagem" className="shrink-0 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard tag="Fila QA" label="Fichas Por Verificar" value={kpiAguardando} tom="primary" />
        <KpiCard tag="OK" label="Fichas Verificadas" value={kpiVerificadas} tom="lima" />
        <KpiCard tag="Pendente" label="Adendos Pendentes" value={kpiAdendos} tom="alerta" />
        <KpiCard tag="Revisor" label="RNCs Aguardando Revisão" value={kpiRncTratativa} tom="destrutivo" onClick={() => navigate("/rnc")} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Fila de Verificação</h2>
        <Button type="button" variant="outline" size="sm" onClick={selecionarPendentes}>
          Selecionar Pendentes
        </Button>
      </div>

      <div className="space-y-3" data-testid="fila-pendente">
        {fila.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!fila.isLoading && dossies.length === 0 && avulsos.length === 0 && (
          <div className="rounded-lg border bg-muted/40 p-8 text-center text-sm text-muted-foreground">Nenhuma ficha aguardando verificação.</div>
        )}
        {dossies.map((dossie) => (
          <DossieVerificacaoCard
            key={dossie.chave}
            dossie={dossie}
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
            toggleGroupSelection={toggleGroupSelection}
            onPreview={setPreviewItem}
            onImprimir={(item) => setRelatorioIds([item.id])}
            onVerDossie={(d: DossieVerificacao) => setRelatorioIds(d.ids)}
            pacPorTemplateId={pacPorTemplateId}
            nomePorTemplateId={nomePorTemplateId}
            usersMap={usuarios}
            isAdmin={Boolean(isAdmin)}
            onEncerrarTurno={(d) =>
              setEncerrarAlvo({ userId: d.userId, dia: diaTurno(d.items[0]!.appt.criado_em), nome: d.inspetorNome })
            }
            onEncerrarTurnoItem={(i) =>
              setEncerrarAlvo({ userId: i.appt.user_id, dia: diaTurno(i.appt.criado_em), nome: usuarios.get(i.appt.user_id) ?? "inspetor" })
            }
          />
        ))}
        {avulsos.map((item) => (
          <AuditRecordCard
            key={item.id}
            item={item}
            mode="verificacao"
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
            onPreview={setPreviewItem}
            onImprimir={(i) => setRelatorioIds([i.id])}
            pacPorTemplateId={pacPorTemplateId}
            nomePorTemplateId={nomePorTemplateId}
            usersMap={usuarios}
            blockedIds={blockedIds}
            isAdmin={Boolean(isAdmin)}
            onEncerrarTurno={(i) => setEncerrarAlvo({ userId: i.appt.user_id, dia: diaTurno(i.appt.criado_em), nome: usuarios.get(i.appt.user_id) ?? "inspetor" })}
          />
        ))}
      </div>

      {verifiedToday.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Verificadas em {ensureLocalTime(`${dateBase}T12:00:00`).datePt}</h2>
          <div className="space-y-3">
            {verifiedToday.map((item) => (
              <AuditRecordCard
                key={item.id}
                item={item}
                mode="verificacao"
                selectedIds={selectedIds}
                toggleSelection={toggleSelection}
                onPreview={setPreviewItem}
                onImprimir={(i) => setRelatorioIds([i.id])}
                pacPorTemplateId={pacPorTemplateId}
                nomePorTemplateId={nomePorTemplateId}
                usersMap={usuarios}
                blockedIds={blockedIds}
                isAdmin={Boolean(isAdmin)}
                onEncerrarTurno={() => undefined}
              />
            ))}
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t bg-surface-dark p-3 text-ondark shadow-lg sm:gap-4 sm:p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
              {selectedIds.size}
            </span>
            <span className="text-sm sm:text-base">ficha(s) selecionada(s)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" className="text-ondark" onClick={() => setSelectedIds(new Set())}>
              Cancelar
            </Button>
            <Button type="button" variant="accent" onClick={abrirModalLote}>
              <Layers className="h-4 w-4" />
              Assinar Lote
            </Button>
          </div>
        </div>
      )}

      {showFilters && (
        <ModalBase titulo="Filtros Avançados" onFechar={() => setShowFilters(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Setor</Label>
                <Select value={filtroSetor ?? ""} onChange={(e) => setFiltroSetor(e.target.value || null)}>
                  <option value="">Todos</option>
                  {setoresDisponiveis.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PAC</Label>
                <Select value={filtroPac ?? ""} onChange={(e) => setFiltroPac(e.target.value || null)}>
                  <option value="">Todos</option>
                  {uniquePacs.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Inspetor</Label>
                <Select value={filtroInspetor ?? ""} onChange={(e) => setFiltroInspetor(e.target.value || null)}>
                  <option value="">Todos</option>
                  {uniqueInspetores.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filtroStatus ?? ""} onChange={(e) => setFiltroStatus((e.target.value || null) as StatusVerificacao | null)}>
                  <option value="">Todos</option>
                  <option value="aguardando">Aguardando</option>
                  <option value="verificado">Verificado</option>
                  <option value="adendo_pendente">Adendo Pendente</option>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={limparFiltros}>
                Limpar Filtros
              </Button>
              <Button type="button" onClick={() => setShowFilters(false)}>
                Aplicar Filtros
              </Button>
            </div>
          </div>
        </ModalBase>
      )}

      {showBatchModal && (
        <ModalBase
          titulo="Assinatura em Lote"
          onFechar={() => {
            if (!isSubmittingBatch) setShowBatchModal(false);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirme sua senha para assinar {selectedIds.size} ficha(s) selecionada(s) como VERIFICADOR.
            </p>
            {!batchProgress ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="batchPassword">Sua senha</Label>
                  <Input
                    id="batchPassword"
                    type="password"
                    value={batchPassword}
                    onChange={(e) => setBatchPassword(e.target.value)}
                    disabled={isSubmittingBatch}
                  />
                </div>
                {batchError && <p className="text-sm text-destructive">{batchError}</p>}
                <Button type="button" className="w-full" disabled={isSubmittingBatch || !batchPassword} onClick={confirmarAssinaturaLote}>
                  {isSubmittingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isSubmittingBatch ? "Assinando…" : "Confirmar Assinatura"}
                </Button>
              </>
            ) : (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {batchProgress.current}/{batchProgress.total} — Computando SHA-256 e solicitando carimbo RFC 3161…
                </p>
              </div>
            )}
          </div>
        </ModalBase>
      )}

      {encerrarAlvo && (
        <ModalBase titulo="Encerrar Turno" onFechar={() => setEncerrarAlvo(null)}>
          <div className="space-y-4 text-sm">
            <p>
              Marca o turno de <span className="font-medium">{encerrarAlvo.nome}</span> do dia{" "}
              <span className="font-medium">{ensureLocalTime(`${encerrarAlvo.dia}T12:00:00`).datePt}</span> como finalizado. Use apenas se o inspetor
              esqueceu de finalizar o turno.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEncerrarAlvo(null)}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={confirmarEncerrarTurno}>
                Encerrar Turno
              </Button>
            </div>
          </div>
        </ModalBase>
      )}

      {previewItem && (
        <PreviewModal
          item={previewItem}
          nomeFicha={nomePorTemplateId.get(previewItem.appt.ficha_template_id) ?? "Ficha"}
          inspetorNome={usuarios.get(previewItem.appt.user_id) ?? "Inspetor"}
          verificadorNome={perfil.nomeCompleto}
          campos={camposPorTemplateId.get(previewItem.appt.ficha_template_id) ?? []}
          onFechar={() => setPreviewItem(null)}
          onMensagem={setMensagem}
        />
      )}

      {relatorioIds && <RelatorioModal ids={relatorioIds} onFechar={() => setRelatorioIds(null)} />}
    </div>
  );
}

function ModalBase({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-lg rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="font-semibold">{titulo}</span>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function PreviewModal({
  item,
  nomeFicha,
  inspetorNome,
  verificadorNome,
  campos,
  onFechar,
  onMensagem,
}: {
  item: AppointmentDisplay;
  nomeFicha: string;
  inspetorNome: string;
  verificadorNome: string;
  campos: CampoTemplate[];
  onFechar: () => void;
  onMensagem: (m: { tipo: "success" | "error"; texto: string }) => void;
}) {
  const [mostrarReprovacao, setMostrarReprovacao] = useState(false);
  const [severidade, setSeveridade] = useState<(typeof SEVERIDADES)[number]>("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [mostrarAdendo, setMostrarAdendo] = useState(false);
  const [campoAdendo, setCampoAdendo] = useState("");
  const [valorNovoAdendo, setValorNovoAdendo] = useState("");
  const [notaAdendo, setNotaAdendo] = useState("");

  // Assinatura eletrônica avançada (Lei 14.063/2020, Art. 4º §2º) exige reautenticação por
  // senha no momento de assinar — tanto aprovar quanto reprovar gravam uma assinatura em
  // `assinaturas_eletronicas` (verificar-monitoramento chama assinarMonitoramento nos dois
  // casos), então os dois pedem senha aqui, igual ao lote (confirmarAssinaturaLote acima).
  const [acaoPendente, setAcaoPendente] = useState<"aprovar" | "reprovar" | null>(null);
  const [senha, setSenha] = useState("");
  const [autenticando, setAutenticando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const verificar = useVerificarMonitoramento();
  const abrirAdendo = useAbrirAdendo();

  const { datePt, time } = ensureLocalTime(item.appt.criado_em);

  async function aprovar() {
    try {
      await verificar.mutateAsync({ monitoramentoId: item.id, decisao: "aprovar" });
      onMensagem({ tipo: "success", texto: "Monitoramento aprovado e assinado." });
      onFechar();
    } catch (erro) {
      onMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao aprovar." });
    }
  }

  async function reprovar() {
    try {
      await verificar.mutateAsync({ monitoramentoId: item.id, decisao: "reprovar", severidade, descricao: descricao || undefined });
      onMensagem({ tipo: "success", texto: "Monitoramento reprovado — RNC aberta automaticamente." });
      onFechar();
    } catch (erro) {
      onMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao reprovar." });
    }
  }

  async function confirmarComSenha() {
    setErroSenha(null);
    setAutenticando(true);
    try {
      const { data: userData, error: erroUser } = await supabase.auth.getUser();
      if (erroUser || !userData.user?.email) {
        setErroSenha("Não foi possível identificar seu usuário. Faça login novamente.");
        return;
      }
      const { error: erroAuth } = await supabase.auth.signInWithPassword({ email: userData.user.email, password: senha });
      if (erroAuth) {
        setErroSenha("Senha incorreta. A assinatura eletrônica falhou.");
        return;
      }
      if (acaoPendente === "aprovar") await aprovar();
      else if (acaoPendente === "reprovar") await reprovar();
    } finally {
      setAutenticando(false);
      setSenha("");
    }
  }

  async function enviarAdendo() {
    if (!campoAdendo || !notaAdendo.trim()) return;
    try {
      await abrirAdendo.mutateAsync({
        monitoramentoId: item.id,
        campo: campoAdendo,
        valorAntigo: item.appt.dados_dinamicos[campoAdendo],
        valorNovo: valorNovoAdendo,
        notes: notaAdendo,
        verificadorNome,
      });
      onMensagem({ tipo: "success", texto: "Adendo aberto — aguardando assinatura do inspetor." });
      onFechar();
    } catch (erro) {
      onMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao abrir adendo." });
    }
  }

  return (
    <ModalBase titulo={nomeFicha} onFechar={onFechar}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {inspetorNome} · {datePt} {time} · {item.appt.setor} · Monitoramento nº {item.ordemDia}
        </p>

        <DadosColetados dadosDinamicos={item.appt.dados_dinamicos} campos={campos} />

        {item.status === "verificado" ? (
          <div className="space-y-3 border-t pt-4">
            {!mostrarAdendo ? (
              <Button type="button" variant="outline" onClick={() => setMostrarAdendo(true)}>
                Abrir Adendo (pedir correção ao inspetor)
              </Button>
            ) : (
              <div className="space-y-2">
                <Label>Campo a corrigir</Label>
                <Select value={campoAdendo} onChange={(e) => setCampoAdendo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {campos.map((campo) => (
                    <option key={campo.chave} value={campo.chave}>
                      {campo.label ?? campo.chave}
                    </option>
                  ))}
                </Select>
                <Label>Novo valor</Label>
                <Input value={valorNovoAdendo} onChange={(e) => setValorNovoAdendo(e.target.value)} />
                <Label>Observação</Label>
                <Textarea value={notaAdendo} onChange={(e) => setNotaAdendo(e.target.value)} />
                <Button type="button" disabled={abrirAdendo.isPending || !campoAdendo || !notaAdendo.trim()} onClick={enviarAdendo} className="w-full">
                  {abrirAdendo.isPending ? "Enviando…" : "Enviar Adendo"}
                </Button>
              </div>
            )}
          </div>
        ) : acaoPendente ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {acaoPendente === "aprovar"
                ? "Confirme sua senha para aprovar e assinar eletronicamente este monitoramento."
                : "Confirme sua senha para registrar a reprovação e assinar eletronicamente."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="senhaPreview">Sua senha</Label>
              <Input
                id="senhaPreview"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={autenticando}
                autoFocus
              />
            </div>
            {erroSenha && <p className="text-sm text-destructive">{erroSenha}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={autenticando}
                onClick={() => {
                  setAcaoPendente(null);
                  setSenha("");
                  setErroSenha(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="button" className="flex-1" disabled={autenticando || !senha} onClick={confirmarComSenha}>
                {autenticando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {autenticando ? "Autenticando…" : "Confirmar e Assinar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 border-t pt-4">
            {mostrarReprovacao && (
              <div className="space-y-2">
                <Label>Severidade</Label>
                <Select value={severidade} onChange={(e) => setSeveridade(e.target.value as (typeof SEVERIDADES)[number])}>
                  {SEVERIDADES.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_SEVERIDADE[s]}
                    </option>
                  ))}
                </Select>
                <Label>Descrição da não conformidade (opcional)</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!mostrarReprovacao ? (
                <>
                  <Button type="button" disabled={verificar.isPending} onClick={() => setAcaoPendente("aprovar")} className="flex-1">
                    Aprovar e assinar
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => setMostrarReprovacao(true)} className="flex-1">
                    Reprovar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={verificar.isPending}
                    onClick={() => setAcaoPendente("reprovar")}
                    className="flex-1"
                  >
                    Confirmar reprovação (abre RNC)
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setMostrarReprovacao(false)} className="flex-1">
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ModalBase>
  );
}
