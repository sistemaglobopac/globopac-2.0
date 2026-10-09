import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Loader2, Waves } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { ModalAutocorrecao } from "@/modules/autocorrecao/ModalAutocorrecao";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent } from "@/shared/ui/card";
import { aguardaChiller2, useFichasTemplatesTodas, useFinalizarAbsorcao, useMonitoramentoEmAndamento, useTemplatesPorIds, type MonitoramentoEmAndamento } from "./api";
import {
  BORBULHAMENTO,
  CHAVE_AGUARDANDO_CHILLER2,
  CHAVE_CHILLER2_COMPLETADO,
  controleAbsorcaoVazio,
  lerTemperatura,
  montarValorControleAbsorcao,
  motivosBloqueioControleAbsorcao,
  rotuloBorbulhamento,
  TANQUES_ETAPA1,
  TANQUES_ABSORCAO,
  temperaturaAbsorcaoAcimaDoLimite,
} from "./fields/controleAbsorcao";
import { LIMITE_AGUA_C } from "./fields/temperaturaResfriamento";
import type { ControleAbsorcaoValor } from "./fields/tiposCompostos";
import { ensureLocalTime } from "./utils/tempo";
import { horaEfetiva } from "./utils/horaMonitoramento";
import type { CampoTemplate } from "@/shared/schema-campos";

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

const apenasTemperatura = (t: string) => t.replace(/[^0-9.,-]/g, "");

/** Etapa 2 do controle de absorção: o inspetor informa a temperatura (e o borbulhamento) do CHILLER 02. O que foi
 * assinado na etapa 1 (tempo de permanência, pré-chiller e chiller 01) não muda: o banco só aceita o chiller 02, a
 * observação e a avaliação. Ao finalizar, o registro é assinado por inteiro e passa a seguir para a verificação. */
export function CompletarChiller2Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: registroAtual, isLoading } = useMonitoramentoEmAndamento(id);
  const { data: templates } = useFichasTemplatesTodas();
  const finalizar = useFinalizarAbsorcao();

  // Guarda o registro na primeira leitura: depois de finalizar ele deixa de ser "em andamento".
  const [registro, setRegistro] = useState<MonitoramentoEmAndamento | null>(null);
  useEffect(() => {
    if (registroAtual && !registro) setRegistro(registroAtual);
  }, [registroAtual, registro]);

  const { data: templatesDoRegistro } = useTemplatesPorIds(registro ? [registro.ficha_template_id] : []);
  const template = templates?.find((t) => t.id === registro?.ficha_template_id) ?? templatesDoRegistro?.find((t) => t.id === registro?.ficha_template_id);
  const campo = ((template?.schema_campos ?? []) as CampoTemplate[]).find((c) => c.tipo === "controle_absorcao");
  const original = useMemo(
    () => (registro && campo ? ({ ...controleAbsorcaoVazio(), ...(registro.dados_dinamicos[campo.chave] as ControleAbsorcaoValor | undefined) } as ControleAbsorcaoValor) : undefined),
    [registro, campo]
  );

  const [temperatura, setTemperatura] = useState("");
  const [borbulhamento, setBorbulhamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [iniciado, setIniciado] = useState(false);
  useEffect(() => {
    if (original && !iniciado) {
      setTemperatura(original.temperaturas?.chiller2 ?? "");
      setBorbulhamento(original.borbulhamento?.chiller2 ?? "");
      setObservacao(original.observacao ?? "");
      setIniciado(true);
    }
  }, [original, iniciado]);

  const [pedirSenha, setPedirSenha] = useState(false);
  const [concluido, setConcluido] = useState<{ naoConforme: boolean } | null>(null);
  const [autocorrigindo, setAutocorrigindo] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const valor: ControleAbsorcaoValor | undefined = useMemo(
    () =>
      original
        ? montarValorControleAbsorcao({
            ...original,
            temperaturas: { ...original.temperaturas, chiller2: temperatura },
            borbulhamento: { ...original.borbulhamento, chiller2: borbulhamento },
            observacao,
          })
        : undefined,
    [original, temperatura, borbulhamento, observacao]
  );
  const faltas = motivosBloqueioControleAbsorcao(valor, 2);
  const completo = !!valor && faltas.length === 0;
  const naoConforme = !!valor && !valor.conformidade;
  const ncChiller2 = temperaturaAbsorcaoAcimaDoLimite("chiller2", lerTemperatura(temperatura));

  async function assinarFinal() {
    if (!registro || !campo || !valor || !perfil) return;
    const dados: Record<string, unknown> = { ...registro.dados_dinamicos, [campo.chave]: valor };
    delete dados[CHAVE_AGUARDANDO_CHILLER2];
    dados[CHAVE_CHILLER2_COMPLETADO] = { por: perfil.id, nome: perfil.nomeCompleto, em: new Date().toISOString() };
    await finalizar.mutateAsync({ id: registro.id, dadosDinamicos: dados });
    setPedirSenha(false);
    setConcluido({ naoConforme });
  }

  if (!perfil) return null;
  if (isLoading && !registro) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!registro || !campo || !original || !valor || !aguardaChiller2(registro)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {registro && !campo
            ? "Esta ficha não tem o campo de controle de absorção."
            : "Monitoramento aguardando o chiller 02 não encontrado — ele já foi completado ou foi aberto por outro inspetor."}
        </p>
        <Button type="button" variant="outline" onClick={() => navigate("/fichas/nova")}>
          <ArrowLeft className="h-4 w-4" /> Voltar às fichas
        </Button>
      </div>
    );
  }

  const inicio = horaEfetiva(registro);
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(inicio).getTime()) / 60_000));
  const hora = ensureLocalTime(inicio);
  const limite2 = LIMITE_AGUA_C.chiller2;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Etapa 2 — Chiller 02: {template?.nome ?? "Controle de absorção"}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <Clock className="h-4 w-4 text-primary" />
        <span>
          Etapa 1 feita em{" "}
          <strong>
            {hora.datePt} {hora.time}
          </strong>{" "}
          · aguardando o chiller 02 há <strong>{duracao(minutos)}</strong>
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="resumo-etapa1">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Etapa 1 (já assinada)</p>
            <p className="text-sm">
              Tempo de permanência no pré-chiller: <strong>{original.tempoPermanenciaMin || "—"} min</strong>
            </p>
            {TANQUES_ABSORCAO.filter((t) => TANQUES_ETAPA1.includes(t.chave)).map((t) => {
              const nc = temperaturaAbsorcaoAcimaDoLimite(t.chave, lerTemperatura(original.temperaturas?.[t.chave]));
              return (
                <p key={t.chave} className={`text-sm ${nc ? "font-semibold text-destructive" : ""}`}>
                  {t.rotulo}: <strong>{original.temperaturas?.[t.chave] || "—"} ºC</strong> · borbulhamento {rotuloBorbulhamento(original.borbulhamento?.[t.chave]).toLowerCase()}
                  {nc ? " — acima do limite" : ""}
                </p>
              );
            })}
          </div>

          <div className="space-y-3 rounded-md border p-3" data-testid="absorcao-chiller2">
            <strong className="flex items-center gap-2 text-sm">
              <Waves className="h-4 w-4 text-primary" /> Chiller 02
            </strong>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="temp-chiller2">
                  Temperatura da água (ºC){limite2 !== null && <span className="text-xs text-muted-foreground"> — máx. {limite2.toLocaleString("pt-BR")} ºC</span>}
                </Label>
                <Input
                  id="temp-chiller2"
                  inputMode="decimal"
                  placeholder="4,0"
                  disabled={finalizar.isPending}
                  className={ncChiller2 ? "border-destructive text-destructive" : ""}
                  value={temperatura}
                  onChange={(e) => setTemperatura(apenasTemperatura(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium">Borbulhamento</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Borbulhamento — Chiller 02">
                  {BORBULHAMENTO.map((b) => (
                    <label
                      key={b.valor}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${borbulhamento === b.valor ? "border-success bg-success/10 text-success" : ""}`}
                    >
                      <input type="radio" name="borbulhamento-chiller2" checked={borbulhamento === b.valor} onChange={() => setBorbulhamento(b.valor)} />
                      {b.rotulo}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="observacao-chiller2">Observações (opcional)</Label>
            <Textarea id="observacao-chiller2" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {naoConforme && (
            <p role="alert" className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {valor.detalhesRNC}. Ao finalizar, o monitoramento fica NÃO CONFORME e você poderá emitir a RNC ou registrar a ação corretiva imediata.
            </p>
          )}
          {finalizar.isError && <p className="text-sm text-destructive">Falha ao finalizar. Tente novamente.</p>}

          <Button type="button" disabled={!completo || finalizar.isPending} onClick={() => setPedirSenha(true)} data-testid="finalizar-chiller2">
            <Waves className="h-4 w-4" /> Finalizar e assinar
          </Button>
          {!completo && <p className="text-xs text-muted-foreground">Informe a temperatura e o borbulhamento do chiller 02 para finalizar.</p>}
        </CardContent>
      </Card>

      {pedirSenha && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Inspetor"
          descricao="Confirme sua senha para finalizar e assinar o controle de absorção."
          onAssinar={assinarFinal}
          onCancelar={() => setPedirSenha(false)}
        />
      )}

      {concluido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-2xl" data-testid="chiller2-concluido">
            {concluido.naoConforme ? (
              <>
                <p className="flex items-center gap-2 font-bold text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Monitoramento finalizado NÃO CONFORME
                </p>
                <p className="text-sm">Emita agora a RNC ou registre a autocorreção imediata (medida de autocontrole), que restabelece a conformidade.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/fichas/nova")}>
                    Depois
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setAutocorrigindo(true)}>
                    Autocorreção imediata
                  </Button>
                  <Button type="button" variant="destructive" className="flex-1" onClick={() => navigate(`/nova-rnc?vinculo=${registro.id}`)}>
                    Emitir RNC agora
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 font-bold text-success">
                  <CheckCircle2 className="h-5 w-5" /> Chiller 02 informado e monitoramento assinado
                </p>
                <Button type="button" className="w-full" onClick={() => navigate("/fichas/nova")}>
                  Voltar às fichas
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {autocorrigindo && (
        <ModalAutocorrecao
          monitoramentoId={registro.id}
          onFechar={() => setAutocorrigindo(false)}
          onRegistrada={() => {
            setAutocorrigindo(false);
            navigate("/fichas/nova");
          }}
        />
      )}
    </div>
  );
}
