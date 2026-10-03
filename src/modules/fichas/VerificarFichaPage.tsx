import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Lock, PenLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useAbrirAdendo, useDadosRelatorio, useVerificarMonitoramento, type MonitoramentoRelatorio } from "./api";
import { turnosBloqueadosMap } from "./utils/turnoUtils";
import { RelatorioMonitoramento } from "./components/relatorio/RelatorioMonitoramento";
import { useTurnoDoRegistro } from "./useTurnoDoRegistro";
import { ensureLocalTime } from "./utils/tempo";
import { alvosDoCampo } from "./utils/adendoCampos";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

const SEVERIDADES = ["CRITICA", "ALTA", "MEDIA", "BAIXA"] as const;
const ROTULO_SEVERIDADE: Record<(typeof SEVERIDADES)[number], string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

type Acao = "verificar" | "adendo" | "rejeitar" | null;

/** Tela cheia de verificação — substitui o antigo par PreviewModal (decisão)/RelatorioModal
 * (impressão) por uma única tela: o relatório oficial consolidado (mesmo componente usado na
 * impressão) com as três ações do verificador logo abaixo. Aberta a partir dos cards da fila
 * (DossieVerificacaoCard/AuditRecordCard) com um ou vários `ids` do mesmo dossiê — "assinar
 * todos de uma vez" é literalmente aprovar todos os ids desta tela numa única ação. */
export function VerificarFichaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const perfil = useSessionStore((s) => s.perfil);

  const ids = useMemo(() => (searchParams.get("ids") ?? "").split(",").filter(Boolean), [searchParams]);

  const { data: dados, isLoading, isError } = useDadosRelatorio(ids);
  const turnoDe = useTurnoDoRegistro();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<Acao>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  useEffect(() => {
    if (!dados) return;
    let cancelado = false;
    turnosBloqueadosMap(dados.monitoramentos.map((m) => ({ id: m.id, user_id: m.user_id, criado_em: m.criado_em }))).then((set) => {
      if (!cancelado) setBlockedIds(set);
    });
    return () => {
      cancelado = true;
    };
  }, [dados]);

  const pendentes = useMemo(() => dados?.monitoramentos.filter((m) => !m.verificado_por) ?? [], [dados]);
  const jaVerificado = Boolean(dados) && dados!.monitoramentos.length > 0 && pendentes.length === 0;
  // Só os pendentes contam pra bloqueio de turno — um já verificado não precisa mais do turno
  // encerrado (a decisão já foi tomada).
  const bloqueado = pendentes.some((m) => blockedIds.has(m.id));

  function voltarComMensagem(tipo: "success" | "error", texto: string) {
    navigate("/verificacao", { state: { mensagem: { tipo, texto } } });
  }

  if (!perfil) return null;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="mb-10 flex flex-wrap gap-2 items-center justify-between">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="space-y-6">
      {ids.length === 0 && <p className="py-20 text-center text-sm text-destructive">Nenhum registro informado para verificação.</p>}
      {ids.length > 0 && isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando relatório…
        </div>
      )}
      {isError && <p className="py-20 text-center text-sm text-destructive">Falha ao carregar os dados do relatório.</p>}
      {mensagemErro && (
        <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {mensagemErro}
        </div>
      )}

      {dados && dados.monitoramentos.length > 0 && (
        <>
          <RelatorioMonitoramento ids={ids} dados={dados} turnoDe={turnoDe} />

          <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
            {jaVerificado ? (
              <div className="flex items-start gap-3 rounded-lg border border-success bg-success/10 p-4">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
                <div>
                  <p className="font-semibold text-ink">Documento já validado</p>
                  <p className="text-sm text-muted-foreground">
                    Este monitoramento já foi assinado e encontra-se bloqueado para novas validações, de acordo com os protocolos de
                    rastreabilidade SIF.
                  </p>
                </div>
              </div>
            ) : bloqueado ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-warning bg-warning/10 p-4">
                  <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
                  <div>
                    <p className="font-semibold text-ink">Turno do inspetor ainda em aberto</p>
                    <p className="text-sm text-muted-foreground">
                      O inspetor responsável ainda não finalizou o turno no Painel de Bordo — o dia ainda pode receber novas apurações
                      desta ficha. A verificação fica disponível assim que o turno for encerrado, mas você já pode solicitar a inclusão
                      de adendos.
                    </p>
                  </div>
                </div>
                {acao === "adendo" ? (
                  <PainelAdendo
                    pendentes={pendentes}
                    dados={dados}
                    verificadorNome={perfil.nomeCompleto}
                    onCancelar={() => setAcao(null)}
                    onConcluido={voltarComMensagem}
                    onErro={setMensagemErro}
                  />
                ) : (
                  <Button type="button" variant="outline" onClick={() => setAcao("adendo")}>
                    <PenLine className="h-4 w-4" />
                    Incluir Adendo
                  </Button>
                )}
              </div>
            ) : (
              <>
                <h2 className="mb-4 border-b pb-2 text-lg font-semibold">Ação do Verificador da Qualidade</h2>
                {acao === null && (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button type="button" className="flex-1" onClick={() => setAcao("verificar")}>
                      <ShieldCheck className="h-4 w-4" />
                      Verificar
                    </Button>
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setAcao("adendo")}>
                      <PenLine className="h-4 w-4" />
                      Incluir Adendo
                    </Button>
                    <Button type="button" variant="destructive" className="flex-1" onClick={() => setAcao("rejeitar")}>
                      <ShieldAlert className="h-4 w-4" />
                      Rejeitar e Iniciar Tratativa
                    </Button>
                  </div>
                )}
                {acao === "verificar" && (
                  <PainelVerificar pendentes={pendentes} onCancelar={() => setAcao(null)} onConcluido={voltarComMensagem} onErro={setMensagemErro} />
                )}
                {acao === "adendo" && (
                  <PainelAdendo
                    pendentes={pendentes}
                    dados={dados}
                    verificadorNome={perfil.nomeCompleto}
                    onCancelar={() => setAcao(null)}
                    onConcluido={voltarComMensagem}
                    onErro={setMensagemErro}
                  />
                )}
                {acao === "rejeitar" && (
                  <PainelRejeitar pendentes={pendentes} onCancelar={() => setAcao(null)} onConcluido={voltarComMensagem} onErro={setMensagemErro} />
                )}
              </>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

interface PainelAcaoProps {
  pendentes: MonitoramentoRelatorio[];
  onCancelar: () => void;
  onConcluido: (tipo: "success" | "error", texto: string) => void;
  onErro: (mensagem: string | null) => void;
}

/** Aprovar e assinar: a senha é conferida no MODAL único de assinatura (ModalAssinaturaSenha). */
function PainelVerificar({ pendentes, onCancelar, onConcluido, onErro }: PainelAcaoProps) {
  const verificar = useVerificarMonitoramento();
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  async function assinar() {
    setProgresso({ atual: 0, total: pendentes.length });
    let falhas = 0;
    for (const [indice, registro] of pendentes.entries()) {
      try {
        await verificar.mutateAsync({ monitoramentoId: registro.id, decisao: "aprovar" });
      } catch {
        falhas += 1;
      }
      setProgresso({ atual: indice + 1, total: pendentes.length });
    }

    if (falhas === 0) {
      onConcluido("success", `${pendentes.length} ficha(s) verificada(s) e assinada(s) com sucesso.`);
    } else {
      setProgresso(null);
      onErro(`${pendentes.length - falhas} de ${pendentes.length} assinada(s) — ${falhas} falharam. Tente novamente.`);
      onCancelar();
    }
  }

  return (
    <ModalAssinaturaSenha
      titulo="Assinatura Eletrônica do Verificador"
      descricao={`Confirme sua senha para aprovar e assinar eletronicamente ${pendentes.length > 1 ? `os ${pendentes.length} registros deste relatório` : "este registro"}.`}
      onAssinar={assinar}
      onCancelar={onCancelar}
      progresso={progresso}
      testId="modal-assinar-verificacao"
    />
  );
}

/** Rejeitar: o formulário (quais apurações, severidade, descrição) fica na página; a senha é
 * pedida no MODAL único de assinatura só ao confirmar. */
function PainelRejeitar({ pendentes, onCancelar, onConcluido, onErro }: PainelAcaoProps) {
  const verificar = useVerificarMonitoramento();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(pendentes.length === 1 ? [pendentes[0]!.id] : []));
  const [severidade, setSeveridade] = useState<(typeof SEVERIDADES)[number]>("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [pedirSenha, setPedirSenha] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  function alternar(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assinar() {
    const alvos = pendentes.filter((p) => selecionados.has(p.id));
    setProgresso({ atual: 0, total: alvos.length });
    let falhas = 0;
    for (const [indice, registro] of alvos.entries()) {
      try {
        await verificar.mutateAsync({ monitoramentoId: registro.id, decisao: "reprovar", severidade, descricao: descricao || undefined });
      } catch {
        falhas += 1;
      }
      setProgresso({ atual: indice + 1, total: alvos.length });
    }

    if (falhas === 0) {
      const restantes = pendentes.length - alvos.length;
      onConcluido(
        "success",
        `${alvos.length} registro(s) reprovado(s) — RNC aberta automaticamente.${restantes > 0 ? ` ${restantes} registro(s) permanecem pendentes de verificação.` : ""}`
      );
    } else {
      setProgresso(null);
      setPedirSenha(false);
      onErro(`${alvos.length - falhas} de ${alvos.length} reprovado(s) — ${falhas} falharam. Tente novamente.`);
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      {pendentes.length > 1 && (
        <div className="space-y-2">
          <Label>Quais apurações têm o desvio?</Label>
          <div className="space-y-1.5 rounded-lg border p-3">
            {pendentes.map((registro, indice) => (
              <label key={registro.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={selecionados.has(registro.id)} onChange={() => alternar(registro.id)} />
                Monitoramento {indice + 1} — {ensureLocalTime(registro.criado_em).time}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Apurações não marcadas continuam pendentes de verificação — não são aprovadas automaticamente por esta ação.
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label>Severidade</Label>
        <Select value={severidade} onChange={(e) => setSeveridade(e.target.value as (typeof SEVERIDADES)[number])}>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SEVERIDADE[s]}
            </option>
          ))}
        </Select>
        <Label>Descrição da não conformidade</Label>
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descreva o desvio identificado…" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" variant="destructive" className="flex-1" disabled={selecionados.size === 0} onClick={() => setPedirSenha(true)}>
          Confirmar Rejeição (abre RNC)
        </Button>
      </div>

      {pedirSenha && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Verificador"
          descricao="Confirme sua senha para assinar eletronicamente a reprovação. Será aberta uma RNC para o(s) registro(s) selecionado(s)."
          textoConfirmar="Confirmar e Reprovar"
          onAssinar={assinar}
          onCancelar={() => setPedirSenha(false)}
          progresso={progresso}
          legendaProgresso="Registrando reprovação e abrindo RNC…"
          testId="modal-assinar-reprovacao"
        />
      )}
    </div>
  );
}

interface PainelAdendoProps extends PainelAcaoProps {
  dados: { templatesPorId: Map<string, { schema_campos: { chave: string; label?: string; tipo?: string }[] }> };
  verificadorNome: string;
}

function PainelAdendo({ pendentes, dados, verificadorNome, onCancelar, onConcluido, onErro }: PainelAdendoProps) {
  const abrirAdendo = useAbrirAdendo();
  const [registroId, setRegistroId] = useState(pendentes.length === 1 ? pendentes[0]!.id : "");
  const [campo, setCampo] = useState("");
  const [alvoCaminho, setAlvoCaminho] = useState("");
  const [valorNovo, setValorNovo] = useState("");
  const [nota, setNota] = useState("");

  const registro = pendentes.find((p) => p.id === registroId);
  const campos = useMemo(
    () => (registro ? dados.templatesPorId.get(registro.ficha_template_id)?.schema_campos ?? [] : []).filter((c) => c.tipo !== "hora"),
    [registro, dados.templatesPorId]
  );
  // Campos compostos (DOA, Peso por Caixa...) detalham item e dado; os simples têm um único alvo.
  const alvos = useMemo(() => {
    const def = campos.find((c) => c.chave === campo);
    return registro && def ? alvosDoCampo(def, registro.dados_dinamicos[def.chave]) : [];
  }, [campos, campo, registro]);
  const alvo = alvos.find((a) => a.caminho === alvoCaminho) ?? (alvos.length === 1 ? alvos[0] : undefined);

  async function confirmar() {
    if (!registro || !alvo || !nota.trim()) return;
    try {
      await abrirAdendo.mutateAsync({
        monitoramentoId: registro.id,
        campo: alvo.caminho,
        rotulo: alvo.rotulo,
        valorAntigo: alvo.valorAtual ?? "",
        valorNovo,
        notes: nota,
        verificadorNome,
      });
      onConcluido("success", "Adendo aberto — devolvido ao inspetor para assinatura no Painel de Bordo.");
    } catch (erro) {
      onErro(erro instanceof Error ? erro.message : "Falha ao abrir adendo.");
    }
  }

  return (
    <div className="space-y-3 border-t pt-4">
      {pendentes.length > 1 && (
        <div className="space-y-2">
          <Label>Registro a corrigir</Label>
          <Select value={registroId} onChange={(e) => { setRegistroId(e.target.value); setCampo(""); setAlvoCaminho(""); }}>
            <option value="">Selecione…</option>
            {pendentes.map((p, indice) => (
              <option key={p.id} value={p.id}>
                Monitoramento {indice + 1} — {ensureLocalTime(p.criado_em).time}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Campo a corrigir</Label>
        <Select value={campo} onChange={(e) => { setCampo(e.target.value); setAlvoCaminho(""); }} disabled={!registro}>
          <option value="">Selecione…</option>
          {campos.map((c) => (
            <option key={c.chave} value={c.chave}>
              {c.label ?? c.chave}
            </option>
          ))}
        </Select>
        {alvos.length > 1 && (
          <>
            <Label>Item e dado a corrigir</Label>
            <Select value={alvo?.caminho ?? ""} onChange={(e) => setAlvoCaminho(e.target.value)}>
              <option value="">Selecione…</option>
              {alvos.map((a) => (
                <option key={a.caminho} value={a.caminho}>
                  {a.rotulo.split(" › ").slice(1).join(" › ")}
                  {a.valorAtual !== undefined && a.valorAtual !== null && a.valorAtual !== "" ? ` (atual: ${String(a.valorAtual)})` : " (vazio)"}
                </option>
              ))}
            </Select>
          </>
        )}
        <Label>Novo valor</Label>
        <Input value={valorNovo} onChange={(e) => setValorNovo(e.target.value)} disabled={!registro} />
        <Label>Observação</Label>
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} disabled={!registro} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancelar} disabled={abrirAdendo.isPending}>
          Cancelar
        </Button>
        <Button type="button" className="flex-1" disabled={abrirAdendo.isPending || !registro || !alvo || !nota.trim()} onClick={confirmar}>
          {abrirAdendo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {abrirAdendo.isPending ? "Enviando…" : "Enviar Adendo"}
        </Button>
      </div>
    </div>
  );
}
