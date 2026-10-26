import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Droplet, Loader2 } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { ModalAutocorrecao } from "@/modules/autocorrecao/ModalAutocorrecao";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { aguardaDripping, useFichasTemplatesTodas, useFinalizarAbsorcao, useMonitoramentoEmAndamento, useTemplatesPorIds, type MonitoramentoEmAndamento } from "./api";
import { DrippingTestField } from "./fields/DrippingTestField";
import { calcularDrippingTest, CHAVE_AGUARDANDO_DRIPPING, CHAVE_DRIPPING_COMPLETADO, motivosFinalizacaoDripping } from "./fields/calculosAbsorcao";
import type { DrippingTestValor } from "./fields/tiposCompostos";
import { DadosColetados } from "./components/DadosColetadosFicha";
import { ensureLocalTime } from "./utils/tempo";
import { horaEfetiva } from "./utils/horaMonitoramento";
import type { CampoTemplate } from "@/shared/schema-campos";

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Etapa 2 do Dripping Test: depois da drenagem o inspetor volta ao MESMO registro e informa a Retirada, o M3 e o M2 de cada
 * carcaça. O que foi assinado na etapa 1 (lote, hora de início, lacre, M0 e M1) não muda: o banco só aceita esses três
 * campos. Ao finalizar, o registro é assinado por inteiro e passa a seguir para a verificação. */
export function CompletarDrippingPage() {
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

  // Ficha reeditada depois da 1ª etapa: o registro continua com o template da versão em que foi iniciado.
  const { data: templatesDoRegistro } = useTemplatesPorIds(registro ? [registro.ficha_template_id] : []);
  const template = templates?.find((t) => t.id === registro?.ficha_template_id) ?? templatesDoRegistro?.find((t) => t.id === registro?.ficha_template_id);
  const campos = (template?.schema_campos ?? []) as CampoTemplate[];
  const campo = campos.find((c) => c.tipo === "dripping_test");
  const outrosCampos = campos.filter((c) => c.tipo !== "dripping_test");

  const [valor, setValor] = useState<DrippingTestValor | undefined>();
  useEffect(() => {
    if (registro && campo && !valor) setValor(registro.dados_dinamicos[campo.chave] as DrippingTestValor | undefined);
  }, [registro, campo, valor]);

  const [motivos, setMotivos] = useState<string[]>([]);
  const [pedirSenha, setPedirSenha] = useState(false);
  const [concluido, setConcluido] = useState<{ naoConforme: boolean } | null>(null);
  const [autocorrigindo, setAutocorrigindo] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const resultado = valor ? calcularDrippingTest(valor.items, valor.horaInicio) : undefined;
  const naoConforme = resultado?.status === "nao-conforme";

  function tentarFinalizar() {
    if (!valor) return;
    const faltas = motivosFinalizacaoDripping(valor.items);
    setMotivos(faltas);
    if (faltas.length === 0) setPedirSenha(true);
  }

  async function assinarFinal() {
    if (!registro || !campo || !valor || !resultado || !perfil) return;
    const dados: Record<string, unknown> = { ...registro.dados_dinamicos, [campo.chave]: { ...valor, ...resultado } };
    delete dados[CHAVE_AGUARDANDO_DRIPPING];
    dados[CHAVE_DRIPPING_COMPLETADO] = { por: perfil.id, nome: perfil.nomeCompleto, em: new Date().toISOString() };
    await finalizar.mutateAsync({ id: registro.id, dadosDinamicos: dados });
    setPedirSenha(false);
    setConcluido({ naoConforme: resultado.status === "nao-conforme" });
  }

  if (!perfil) return null;
  if (isLoading && !registro) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!registro || !campo || !valor || !aguardaDripping(registro)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {registro && !campo
            ? "Esta ficha não tem o campo de Dripping Test."
            : "Dripping Test em andamento não encontrado — ele já foi finalizado ou não é do seu setor."}
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

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">2ª etapa — Retirada, M3 e M2: {template?.nome ?? "Dripping Test"}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <Clock className="h-4 w-4 text-primary" />
        <span>
          1ª etapa feita em{" "}
          <strong>
            {hora.datePt} {hora.time}
          </strong>{" "}
          · aguardando a retirada há <strong>{duracao(minutos)}</strong>
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {outrosCampos.length > 0 && <DadosColetados dadosDinamicos={registro.dados_dinamicos} campos={outrosCampos} />}
          <DrippingTestField value={valor} onChange={setValor} primeiraEtapaTravada semAcoes disabled={finalizar.isPending} />

          {motivos.length > 0 && (
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive" data-testid="dripping-faltas">
              <p className="font-bold">Não é possível finalizar ainda:</p>
              <ul className="list-disc pl-5">
                {motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {naoConforme && (
            <p role="alert" className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Dripping Test NÃO CONFORME (média acima do limite ou tempo de drenagem abaixo do mínimo). Ao finalizar, você poderá emitir a RNC ou registrar a ação corretiva imediata.
            </p>
          )}
          {finalizar.isError && <p className="text-sm text-destructive">Falha ao finalizar. Tente novamente.</p>}

          <Button type="button" disabled={finalizar.isPending} onClick={tentarFinalizar} data-testid="finalizar-dripping">
            <Droplet className="h-4 w-4" /> Finalizar e assinar
          </Button>
        </CardContent>
      </Card>

      {pedirSenha && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Inspetor"
          descricao="Confirme sua senha para finalizar e assinar o Dripping Test."
          onAssinar={assinarFinal}
          onCancelar={() => setPedirSenha(false)}
        />
      )}

      {concluido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-2xl" data-testid="dripping-concluido">
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
                  <CheckCircle2 className="h-5 w-5" /> Dripping Test finalizado e assinado
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
          fichaNome={template?.nome}
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
