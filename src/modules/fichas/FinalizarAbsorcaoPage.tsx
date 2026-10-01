import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Clock, Loader2, ShieldCheck, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { reautenticar } from "@/modules/auth/reautenticar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent } from "@/shared/ui/card";
import { useFichasTemplatesTodas, useFinalizarAbsorcao, useMonitoramentoEmAndamento, type MonitoramentoEmAndamento } from "./api";
import { AbsorcaoAguaField } from "./fields/AbsorcaoAguaField";
import { calcularAbsorcaoAgua, minutosAguardandoPesoFinal, validarFinalizacao, LIMITE_ABSORCAO_AGUA } from "./fields/calculosAbsorcao";
import type { AbsorcaoAguaValor } from "./fields/tiposCompostos";
import { DadosColetados } from "./components/DadosColetadosFicha";
import { ensureLocalTime } from "./utils/tempo";
import type { CampoTemplate } from "@/shared/schema-campos";

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5" />
            {titulo}
          </span>
          {onFechar && (
            <button type="button" onClick={onFechar} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** Pesagem final do Teste de Absorção de Água (fase 2). Reabre o MESMO registro: lacres e pesos
 * iniciais travados (somente leitura); só o peso final de cada lacre (ou o descarte, com motivo)
 * é editável. Finalizar não é uma edição: sem justificativa e sem janela de edição. A hora final é
 * carimbada pelo servidor; a assinatura INSPETOR só é gravada aqui, depois de reconferir a senha. */
export function FinalizarAbsorcaoPage() {
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

  const template = templates?.find((t) => t.id === registro?.ficha_template_id);
  const campos = (template?.schema_campos ?? []) as CampoTemplate[];
  const campoAbsorcao = campos.find((c) => c.tipo === "absorcao_agua");
  const outrosCampos = campos.filter((c) => c.tipo !== "absorcao_agua");

  const [valor, setValor] = useState<AbsorcaoAguaValor | undefined>();
  useEffect(() => {
    if (registro && campoAbsorcao && !valor) setValor(registro.dados_dinamicos[campoAbsorcao.chave] as AbsorcaoAguaValor | undefined);
  }, [registro, campoAbsorcao, valor]);

  const [motivos, setMotivos] = useState<string[]>([]);
  const [confirmarNc, setConfirmarNc] = useState(false);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [autenticando, setAutenticando] = useState(false);
  const [gravado, setGravado] = useState(false); // já FINALIZADO no banco; falta (re)tentar a assinatura
  const [concluido, setConcluido] = useState<{ naoConforme: boolean } | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const resultado = useMemo(() => calcularAbsorcaoAgua(valor?.items ?? []), [valor]);
  const naoConforme = resultado.status === "nao-conforme";

  function tentarFinalizar() {
    if (!valor) return;
    const impedimentos = validarFinalizacao(valor.items);
    setMotivos(impedimentos);
    if (impedimentos.length > 0) return;
    if (naoConforme && !gravado) setConfirmarNc(true);
    else setPedirSenha(true);
  }

  async function confirmarComSenha() {
    if (!registro || !campoAbsorcao || !valor) return;
    setErroSenha(null);
    setAutenticando(true);
    try {
      const erro = await reautenticar(senha);
      if (erro) {
        setErroSenha(erro);
        return;
      }
      await finalizar.mutateAsync({
        id: registro.id,
        jaFinalizado: gravado,
        dadosDinamicos: { ...registro.dados_dinamicos, [campoAbsorcao.chave]: { ...valor, fase: "FINAL", ...calcularAbsorcaoAgua(valor.items) } },
        aoGravar: () => setGravado(true),
      });
      setPedirSenha(false);
      setConcluido({ naoConforme });
    } catch (e) {
      setErroSenha(e instanceof Error ? e.message : "Falha ao finalizar. Tente novamente.");
    } finally {
      setAutenticando(false);
      setSenha("");
    }
  }

  if (!perfil) return null;
  if (isLoading && !registro) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!registro || !campoAbsorcao) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {registro ? "Esta ficha não tem o campo de absorção de água." : "Monitoramento em andamento não encontrado — ele já foi finalizado ou não é seu."}
        </p>
        <Button type="button" variant="outline" onClick={() => navigate("/painel")}>
          <ArrowLeft className="h-4 w-4" /> Voltar ao Painel de Bordo
        </Button>
      </div>
    );
  }

  const inicio = ensureLocalTime(registro.criado_em);
  const minutos = minutosAguardandoPesoFinal(registro.criado_em, agora);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Pesagem final: {template?.nome ?? "Absorção de água"}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <Clock className="h-4 w-4 text-primary" />
        <span>
          Pesagem inicial em <strong>{inicio.datePt} {inicio.time}</strong> (hora do servidor) · aguardando peso final há <strong>{minutos} min</strong>
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {outrosCampos.length > 0 && <DadosColetados dadosDinamicos={registro.dados_dinamicos} campos={outrosCampos} />}
          <AbsorcaoAguaField value={valor} onChange={setValor} fase="FINAL" disabled={gravado} />

          {motivos.length > 0 && (
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-bold">Não é possível finalizar ainda:</p>
              <ul className="list-disc pl-5">
                {motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {gravado && !concluido && (
            <p className="rounded-md border border-warning bg-warning/10 p-2 text-sm">
              A pesagem final já foi gravada; falta assinar. Confirme sua senha para concluir a assinatura.
            </p>
          )}

          <Button type="button" onClick={tentarFinalizar} disabled={!valor || finalizar.isPending}>
            {gravado ? "Assinar" : "Finalizar e assinar"}
          </Button>
        </CardContent>
      </Card>

      {confirmarNc && (
        <Modal titulo="Monitoramento NÃO CONFORME" onFechar={() => setConfirmarNc(false)}>
          <div className="space-y-4" data-testid="confirmar-nao-conforme">
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Este monitoramento será registrado como NÃO CONFORME.
              </p>
              <p>
                A média de absorção ({resultado.averagePercentage.toFixed(2)}%) ultrapassou o limite de {LIMITE_ABSORCAO_AGUA}%.
              </p>
            </div>
            <p className="text-sm font-medium">Deseja assinar o monitoramento não conforme?</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmarNc(false)}>
                Não, voltar e revisar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setConfirmarNc(false);
                  setPedirSenha(true);
                }}
              >
                Sim, assinar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pedirSenha && !concluido && (
        <Modal titulo="Assinatura Eletrônica do Inspetor" onFechar={autenticando ? undefined : () => setPedirSenha(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Confirme sua senha (a mesma do login) para finalizar e assinar eletronicamente este monitoramento.</p>
            <div className="space-y-2">
              <Label htmlFor="senha-final-absorcao">Sua senha</Label>
              <Input
                id="senha-final-absorcao"
                type="password"
                value={senha}
                autoFocus
                disabled={autenticando}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && senha && !autenticando) void confirmarComSenha();
                }}
              />
            </div>
            {erroSenha && <p className="text-sm text-destructive">{erroSenha}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={autenticando} onClick={() => setPedirSenha(false)}>
                Cancelar
              </Button>
              <Button type="button" className="flex-1" disabled={autenticando || !senha} onClick={() => void confirmarComSenha()}>
                {autenticando ? "Assinando…" : "Confirmar e Assinar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {concluido && (
        <Modal titulo={concluido.naoConforme ? "Emita o relatório de não conformidade" : "Monitoramento finalizado"}>
          <div className="space-y-4" data-testid="absorcao-finalizada">
            {concluido.naoConforme ? (
              <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <p className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Você tem um monitoramento finalizado com não conformidade.
                </p>
                <p>Emita agora um relatório de não conformidade (RNC).</p>
              </div>
            ) : (
              <p className="text-sm">Pesagem final gravada e monitoramento assinado com sucesso.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => navigate("/painel")}>
                {concluido.naoConforme ? "Depois" : "Voltar ao Painel de Bordo"}
              </Button>
              {concluido.naoConforme && (
                <Button type="button" variant="destructive" className="flex-1" onClick={() => navigate(`/nova-rnc?vinculo=${registro.id}`)}>
                  Emitir RNC agora
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
