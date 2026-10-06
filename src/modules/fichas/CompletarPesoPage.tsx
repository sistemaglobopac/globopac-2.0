import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Loader2, Scale } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { ModalAutocorrecao } from "@/modules/autocorrecao/ModalAutocorrecao";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent } from "@/shared/ui/card";
import {
  aguardaPesoDaBalanca,
  useFichasTemplatesTodas,
  useFinalizarAbsorcao,
  useMonitoramentoEmAndamento,
  useSalvarPesosParciais,
  useTemplatesPorIds,
  type MonitoramentoEmAndamento,
} from "./api";
import { acimaDoLimite, CHAVE_AGUARDANDO_PESO, CHAVE_PESO_COMPLETADO, cargasSemPeso, LIMITE_PESO_CAIXA_KG, montarValorPesoCaixa, pesoPorCaixa } from "./fields/pesoCaixa";
import type { PesoCaixaValor } from "./fields/tiposCompostos";
import { ensureLocalTime } from "./utils/tempo";
import { horaEfetiva } from "./utils/horaMonitoramento";
import type { CampoTemplate } from "@/shared/schema-campos";
import { CompletarVazaoSpr } from "./CompletarVazaoSpr";

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Etapa 2 do peso por caixa: completa o peso médio das cargas quando a balança passa, calcula o peso por caixa,
 * avalia a conformidade (limite de 25 kg) e finaliza/assina o monitoramento. O que foi assinado na etapa 1
 * (cargas, aves por caixa, hora) não muda: o banco só aceita os pesos e a avaliação. Qualquer inspetor do
 * setor pode completar. É possível salvar pesos parciais (cargas que a balança já passou) e finalizar depois. */
export function CompletarPesoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: registroAtual, isLoading } = useMonitoramentoEmAndamento(id);
  const { data: templates } = useFichasTemplatesTodas();
  const salvarParciais = useSalvarPesosParciais();
  const finalizar = useFinalizarAbsorcao();

  // Guarda o registro na primeira leitura: depois de finalizar ele deixa de ser "em andamento".
  const [registro, setRegistro] = useState<MonitoramentoEmAndamento | null>(null);
  useEffect(() => {
    if (registroAtual && !registro) setRegistro(registroAtual);
  }, [registroAtual, registro]);

  const { data: templatesDoRegistro } = useTemplatesPorIds(registro ? [registro.ficha_template_id] : []);
  const template =
    templates?.find((t) => t.id === registro?.ficha_template_id) ?? templatesDoRegistro?.find((t) => t.id === registro?.ficha_template_id);
  const campo = ((template?.schema_campos ?? []) as CampoTemplate[]).find((c) => c.tipo === "peso_caixa");
  const original = registro && campo ? (registro.dados_dinamicos[campo.chave] as PesoCaixaValor | undefined) : undefined;

  const [pesos, setPesos] = useState<string[] | null>(null);
  useEffect(() => {
    if (original && !pesos) setPesos(original.cargas.map((c) => c.pesoMedioKg));
  }, [original, pesos]);

  const [pedirSenha, setPedirSenha] = useState(false);
  const [concluido, setConcluido] = useState<{ naoConforme: boolean } | null>(null);
  const [autocorrigindo, setAutocorrigindo] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const valor: PesoCaixaValor | undefined = useMemo(
    () => (original && pesos ? montarValorPesoCaixa({ ...original, cargas: original.cargas.map((c, i) => ({ ...c, pesoMedioKg: pesos[i] ?? "" })) }) : undefined),
    [original, pesos]
  );
  const faltam = cargasSemPeso(valor);
  const completo = !!valor && faltam.length === 0;
  const naoConforme = !!valor && !valor.conformidade;

  function dadosFinais(): Record<string, unknown> {
    const base: Record<string, unknown> = { ...(registro?.dados_dinamicos ?? {}), [campo!.chave]: valor };
    return base;
  }

  async function salvarRecebidos() {
    if (!registro || !campo || !valor) return;
    setMensagem(null);
    try {
      await salvarParciais.mutateAsync({ id: registro.id, dadosDinamicos: dadosFinais() });
      setMensagem("Pesos salvos. As cargas sem peso continuam aguardando a balança.");
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? "Falha ao salvar os pesos.");
    }
  }

  async function assinarFinal() {
    if (!registro || !campo || !valor || !perfil) return;
    const dados = dadosFinais();
    delete dados[CHAVE_AGUARDANDO_PESO];
    dados[CHAVE_PESO_COMPLETADO] = { por: perfil.id, nome: perfil.nomeCompleto, em: new Date().toISOString() };
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
  // Vazão do SPR aguardando o peso das cargas: tela própria (recalcula os campos com o peso real).
  const camposDaFicha = (template?.schema_campos ?? []) as CampoTemplate[];
  if (registro && !campo && aguardaPesoDaBalanca(registro) && camposDaFicha.some((c) => c.tipo === "chiller_carcacas")) {
    return <CompletarVazaoSpr registro={registro} nomeFicha={template?.nome ?? "Vazão do SPR"} campos={camposDaFicha} />;
  }
  if (!registro || !campo || !original || !valor || !aguardaPesoDaBalanca(registro)) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {registro && !campo
            ? "Esta ficha não tem o campo de peso por caixa."
            : "Monitoramento aguardando peso não encontrado — o peso já foi completado ou ele é de outro setor."}
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Completar o peso: {template?.nome ?? "Peso por caixa"}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <Clock className="h-4 w-4 text-primary" />
        <span>
          Monitoramento realizado em <strong>{hora.datePt} {hora.time}</strong> · aguardando o peso da balança há <strong>{duracao(minutos)}</strong>
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs text-muted-foreground">
            O que você assinou na etapa 1 (cargas, aves por caixa e hora) não muda. Informe o peso médio das aves de cada carga quando a balança passar; o peso por caixa e a
            conformidade (limite de {LIMITE_PESO_CAIXA_KG} kg) são calculados aqui.
          </p>

          {valor.cargas.map((c, i) => {
            const jaTinha = original.cargas[i]?.pesoMedioKg.trim() !== "";
            const peso = pesoPorCaixa(c);
            const acima = acimaDoLimite(c);
            return (
              <div key={c.cargaId || i} className={`space-y-3 rounded-md border p-3 ${acima ? "border-destructive bg-destructive/5" : ""}`} data-testid={`completar-carga-${i}`}>
                <p className="text-sm font-bold">
                  GTA {c.gta} — {c.integrado} · Aviário {c.aviario}
                  {c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · {c.qtdAves.toLocaleString("pt-BR")} aves
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Aves por caixa</Label>
                    <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">{c.avesPorCaixa}</div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`completar-peso-${i}`}>Peso médio das aves (kg)</Label>
                    <Input
                      id={`completar-peso-${i}`}
                      inputMode="decimal"
                      placeholder="2,850"
                      disabled={jaTinha || finalizar.isPending}
                      value={pesos?.[i] ?? ""}
                      onChange={(e) => setPesos((atual) => (atual ?? []).map((p, j) => (j === i ? e.target.value.replace(/[^0-9.,]/g, "") : p)))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Peso por caixa</Label>
                    <div className={`flex h-10 items-center rounded-md border px-3 text-sm font-black ${peso === null ? "text-muted-foreground" : acima ? "border-destructive text-destructive" : "border-success text-success"}`}>
                      {peso === null ? "aguardando" : `${peso.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg · ${acima ? "NÃO CONFORME" : "CONFORME"}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {naoConforme && (
            <p role="alert" className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Peso por caixa acima de {LIMITE_PESO_CAIXA_KG} kg: ao finalizar, o monitoramento fica NÃO CONFORME e você poderá emitir a RNC ou registrar a ação corretiva imediata.
            </p>
          )}
          {mensagem && <p className="text-sm text-muted-foreground">{mensagem}</p>}
          {finalizar.isError && <p className="text-sm text-destructive">Falha ao finalizar. Tente novamente.</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={salvarParciais.isPending || finalizar.isPending} onClick={() => void salvarRecebidos()}>
              Salvar pesos recebidos
            </Button>
            <Button type="button" disabled={!completo || finalizar.isPending} onClick={() => setPedirSenha(true)}>
              <Scale className="h-4 w-4" /> Finalizar e assinar
            </Button>
          </div>
          {!completo && (
            <p className="text-xs text-muted-foreground">
              Faltam {faltam.length} carga(s) sem peso. Salve os pesos já recebidos e finalize quando a balança passar o restante.
            </p>
          )}
        </CardContent>
      </Card>

      {pedirSenha && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Inspetor"
          descricao="Confirme sua senha para finalizar e assinar o monitoramento de peso por caixa."
          onAssinar={assinarFinal}
          onCancelar={() => setPedirSenha(false)}
        />
      )}

      {concluido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-2xl" data-testid="peso-concluido">
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
                  <CheckCircle2 className="h-5 w-5" /> Peso completado e monitoramento assinado
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
