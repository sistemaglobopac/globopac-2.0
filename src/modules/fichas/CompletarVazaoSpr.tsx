import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Scale } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { ModalAutocorrecao } from "@/modules/autocorrecao/ModalAutocorrecao";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import type { CampoTemplate } from "@/shared/schema-campos";
import { useFinalizarAbsorcao, useSalvarPesosParciais, type MonitoramentoEmAndamento } from "./api";
import { DynamicField } from "./DynamicField";
import { CHAVE_AGUARDANDO_PESO, CHAVE_PESO_COMPLETADO } from "./fields/pesoCaixa";
import { lotesSemPeso } from "./fields/preenchimentoSpr";
import type { ChillerCarcacasValor } from "./fields/tiposCompostos";
import { dataManaus, horaEfetiva } from "./utils/horaMonitoramento";
import { ensureLocalTime } from "./utils/tempo";

const TIPOS_SPR = ["chiller_carcacas", "chiller_partes", "mini_chillers", "lavagem_final"];

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

interface Props {
  registro: MonitoramentoEmAndamento;
  nomeFicha: string;
  campos: CampoTemplate[];
}

/** Etapa 2 da vazão do SPR: o peso vivo das cargas chegou da balança, então a meta, a conformidade e as massas
 * (Partes e Miúdos) são recalculadas com o peso REAL, pelos próprios campos da ficha. O que foi assinado na etapa 1
 * (leituras, gelo, aves, condenas e hora) fica travado — e o banco só aceita mudar o peso e o que deriva dele. O peso de
 * cada carga é buscado sozinho no monitoramento de peso por caixa; enquanto faltar, o registro continua aguardando. */
export function CompletarVazaoSpr({ registro, nomeFicha, campos }: Props) {
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const salvarParciais = useSalvarPesosParciais();
  const finalizar = useFinalizarAbsorcao();

  const camposSpr = useMemo(() => campos.filter((c) => TIPOS_SPR.includes(c.tipo)), [campos]);
  const campoCarcacas = camposSpr.find((c) => c.tipo === "chiller_carcacas");
  const { control, register, getValues, formState } = useForm<FieldValues>({
    defaultValues: Object.fromEntries(camposSpr.map((c) => [c.chave, registro.dados_dinamicos[c.chave]])),
  });
  const valores = useWatch({ control }) as Record<string, unknown>;
  const carcacasAtual = campoCarcacas ? (valores[campoCarcacas.chave] as ChillerCarcacasValor | undefined) : undefined;

  const [pedirSenha, setPedirSenha] = useState(false);
  const [concluido, setConcluido] = useState<{ naoConforme: boolean } | null>(null);
  const [autocorrigindo, setAutocorrigindo] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [agora] = useState(() => new Date());

  const faltam = lotesSemPeso(carcacasAtual);
  const completo = !!carcacasAtual && faltam.length === 0;
  const naoConforme = camposSpr.some((c) => (valores[c.chave] as { conformidade?: boolean } | undefined)?.conformidade === false);

  const inicio = horaEfetiva(registro);
  const hora = ensureLocalTime(inicio);
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(inicio).getTime()) / 60_000));

  function dadosFinais(): Record<string, unknown> {
    const atuais = getValues();
    const base: Record<string, unknown> = { ...registro.dados_dinamicos };
    for (const c of camposSpr) base[c.chave] = atuais[c.chave] ?? registro.dados_dinamicos[c.chave];
    return base;
  }

  async function salvarRecebidos() {
    setMensagem(null);
    try {
      await salvarParciais.mutateAsync({ id: registro.id, dadosDinamicos: dadosFinais() });
      setMensagem("Pesos salvos. As cargas sem peso continuam aguardando a balança.");
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : (e as { message?: string } | null)?.message ?? "Falha ao salvar os pesos.");
    }
  }

  async function assinarFinal() {
    if (!perfil) return;
    const dados = dadosFinais();
    delete dados[CHAVE_AGUARDANDO_PESO];
    dados[CHAVE_PESO_COMPLETADO] = { por: perfil.id, nome: perfil.nomeCompleto, em: new Date().toISOString() };
    await finalizar.mutateAsync({ id: registro.id, dadosDinamicos: dados });
    setPedirSenha(false);
    setConcluido({ naoConforme });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Completar a vazão: {nomeFicha}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <Clock className="h-4 w-4 text-primary" />
        <span>
          Monitoramento realizado em <strong>{hora.datePt} {hora.time}</strong> · aguardando o peso das cargas há <strong>{duracao(minutos)}</strong>
        </span>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs text-muted-foreground">
            O que você assinou na etapa 1 (leituras dos hidrômetros, gelo, aves, condenas e hora) não muda. O peso de cada carga vem do monitoramento de peso por caixa assim que a
            balança passa; a meta e a conformidade são recalculadas com o peso <strong>real</strong>.
          </p>

          {camposSpr.map((campo) => (
            <DynamicField
              key={campo.chave}
              campo={campo}
              register={register}
              errors={formState.errors}
              control={control}
              carcacasAtual={carcacasAtual}
              diaMonitoramento={dataManaus(new Date(inicio))}
              horaMonitoramento={inicio}
              modoCompletarPeso
            />
          ))}

          {!completo && (
            <p className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm">
              <Scale className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Faltam {faltam.length} lote(s) sem peso (GTA {faltam.map((l) => l.gta || "?").join(", ")}). Ligue para a balança; o peso entra sozinho assim que for registrado no monitoramento de
                peso por caixa. Salve os pesos já recebidos e finalize quando todos chegarem.
              </span>
            </p>
          )}
          {completo && naoConforme && (
            <p role="alert" className="flex items-start gap-2 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Com o peso real a vazão ficou NÃO CONFORME: ao finalizar você poderá emitir a RNC ou registrar a ação corretiva imediata.
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
        </CardContent>
      </Card>

      {pedirSenha && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica do Inspetor"
          descricao="Confirme sua senha para finalizar e assinar a vazão com o peso real das cargas."
          onAssinar={assinarFinal}
          onCancelar={() => setPedirSenha(false)}
        />
      )}

      {concluido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-xl border bg-background p-5 shadow-2xl" data-testid="vazao-concluida">
            {concluido.naoConforme ? (
              <>
                <p className="flex items-center gap-2 font-bold text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Vazão finalizada NÃO CONFORME
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
                  <CheckCircle2 className="h-5 w-5" /> Vazão completada com o peso real e assinada
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
