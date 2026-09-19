import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, Clock, Lock } from "lucide-react";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { zodFromSchemaCampos, valoresIniciaisDe, type CampoTemplate } from "@/shared/schema-campos";
import { useCriarMonitoramento, useTemplatesAtivos, useUltimoRegistroFicha, useUltimosApontamentosHoje, type TemplateAtivo } from "./api";
import { useSincronizacaoOffline } from "./useSincronizacaoOffline";
import { useAudioAlarm } from "./useAudioAlarm";
import { DynamicField } from "./DynamicField";
import type { ChillerCarcacasValor } from "./fields/tiposCompostos";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const ROTULO_STATUS_FILA: Record<string, string> = {
  pendente: "Pendente de sincronização",
  sincronizando: "Sincronizando…",
  falhou: "Falha ao sincronizar — tentando de novo",
  falha_autenticacao: "Sessão expirada — faça login novamente",
};

function FilaOfflinePainel() {
  const { fila } = useSincronizacaoOffline();
  if (fila.length === 0) return null;

  return (
    <Card className="border-warning">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {fila.length} ficha(s) aguardando sincronização (ADR 0002/0014)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fila.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Capturada em {new Date(item.capturadoEm).toLocaleString("pt-BR")}
            </span>
            <Badge variant={item.status === "falha_autenticacao" ? "destructive" : "outline"}>
              {ROTULO_STATUS_FILA[item.status] ?? item.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type StatusFicha = "LIBERADO" | "BLOQUEADO" | "ATRASADO";

/** Cronômetro de liberado/bloqueado/atrasado (mecânica do v1, NovoRegistro.jsx): compara o
 * horário do último apontamento de hoje (mesmo setor) com `tempo_entre_apontamentos_min`,
 * com 5 min de tolerância antes de virar atraso. */
function calcularStatus(
  ficha: TemplateAtivo,
  ultimoApontamentoEm: string | undefined,
  agora: Date
): { status: StatusFicha; texto: string } {
  if (!ultimoApontamentoEm || !ficha.tempo_entre_apontamentos_min) {
    return { status: "LIBERADO", texto: "Liberado" };
  }

  const diffMinutos = (agora.getTime() - new Date(ultimoApontamentoEm).getTime()) / 60_000;
  const minutosRestantes = ficha.tempo_entre_apontamentos_min - diffMinutos;

  if (minutosRestantes > 0) {
    const m = Math.floor(minutosRestantes);
    const s = Math.floor((minutosRestantes - m) * 60);
    return { status: "BLOQUEADO", texto: `Liberado em ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` };
  }
  if (minutosRestantes < -5) {
    const atrasoMs = Math.abs(minutosRestantes + 5) * 60_000;
    const am = Math.floor(atrasoMs / 60_000);
    const as = Math.floor((atrasoMs % 60_000) / 1000);
    return { status: "ATRASADO", texto: `Atrasado em ${String(am).padStart(2, "0")}:${String(as).padStart(2, "0")}` };
  }
  return { status: "LIBERADO", texto: "Pronto para Apontamento" };
}

export function NovaFichaPage() {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: templates, isLoading } = useTemplatesAtivos();
  const { data: masterSetores } = useSetoresCadastrados();
  const setoresDoUsuario = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);
  const [setor, setSetor] = useState(setoresDoUsuario[0] ?? "");
  const [templateId, setTemplateId] = useState("");
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!perfil) return;
    setSetor((atual) => (atual && setoresDoUsuario.includes(atual) ? atual : (setoresDoUsuario[0] ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, masterSetores]);

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const fichasDoSetor = useMemo(
    () => (templates ?? []).filter((f) => f.locais_aplicacao?.includes(setor)),
    [templates, setor]
  );
  const { data: apontamentos } = useUltimosApontamentosHoje(setor);
  const templateSelecionado = fichasDoSetor.find((t) => t.id === templateId);

  const statusPorFicha = useMemo(
    () =>
      new Map(
        fichasDoSetor.map((f) => [f.id, calcularStatus(f, apontamentos?.mapaUltimos.get(f.id), agora)])
      ),
    [fichasDoSetor, apontamentos, agora]
  );

  const statusFichaSelecionada = templateId ? statusPorFicha.get(templateId)?.status : undefined;
  const algumaAtrasada = Array.from(statusPorFicha.values()).some((s) => s.status === "ATRASADO");
  const alarmeAtivo = algumaAtrasada && statusFichaSelecionada !== "ATRASADO";
  useAudioAlarm(alarmeAtivo);

  if (!perfil) return null;

  if (!templateSelecionado) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Nova ficha de monitoramento</h1>
          {setoresDoUsuario.length > 1 && (
            <Select className="w-auto" value={setor} onChange={(e) => setSetor(e.target.value)}>
              {setoresDoUsuario.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
          {setoresDoUsuario.length === 1 && <Badge variant="outline">{setor}</Badge>}
        </div>

        <FilaOfflinePainel />

        {alarmeAtivo && (
          <div className="flex items-center gap-3 rounded-lg bg-destructive p-4 text-destructive-foreground shadow-lg">
            <BellRing className="h-8 w-8 shrink-0 animate-pulse" />
            <div>
              <h3 className="font-bold">Atenção! Monitoramento em atraso crítico</h3>
              <p className="text-sm opacity-90">Existe uma ficha com o tempo de apontamento vencido — clique no cartão em atraso para preencher.</p>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Carregando fichas…</p>}
        {!isLoading && fichasDoSetor.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <p className="text-lg font-semibold text-foreground">Nenhuma ficha ativa disponível</p>
              <p>Não há fichas cadastradas para o setor selecionado: <strong>{setor || "Nenhum setor"}</strong>.</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fichasDoSetor.map((ficha) => {
            const { status, texto } = statusPorFicha.get(ficha.id) ?? { status: "LIBERADO" as StatusFicha, texto: "Liberado" };
            const temDesvio = apontamentos?.fichasComDesvio.has(ficha.id) ?? false;

            return (
              <Card
                key={ficha.id}
                data-testid="ficha-card"
                className={
                  status === "ATRASADO"
                    ? "animate-pulse border-2 border-destructive shadow-lg"
                    : status === "BLOQUEADO"
                      ? "opacity-80"
                      : "hover:shadow-md"
                }
              >
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline">{ficha.codigo}</Badge>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={status === "ATRASADO" ? "destructive" : status === "BLOQUEADO" ? "secondary" : "success"}>
                        {status === "BLOQUEADO" && <Lock className="mr-1 h-3 w-3" />}
                        {status === "ATRASADO" && <AlertTriangle className="mr-1 h-3 w-3" />}
                        {status === "LIBERADO" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {texto}
                      </Badge>
                      {temDesvio && <Badge variant="destructive">DESVIO ATIVO</Badge>}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold">{ficha.nome}</h3>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Frequência: {ficha.tempo_entre_apontamentos_min ?? "—"} min
                    </span>
                  </div>
                  <Button
                    type="button"
                    disabled={status === "BLOQUEADO"}
                    variant={status === "ATRASADO" ? "destructive" : "default"}
                    onClick={() => setTemplateId(ficha.id)}
                  >
                    {status === "BLOQUEADO" ? (
                      <>
                        <Lock className="h-4 w-4" /> Aguarde o tempo
                      </>
                    ) : status === "ATRASADO" ? (
                      <>
                        <AlertTriangle className="h-4 w-4" /> Preencher urgente
                      </>
                    ) : (
                      "Preencher monitoramento"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <FichaForm
      key={templateSelecionado.id}
      templateId={templateSelecionado.id}
      versaoTemplate={templateSelecionado.versao}
      campos={templateSelecionado.schema_campos as CampoTemplate[]}
      nome={templateSelecionado.nome}
      setor={setor}
      perfil={perfil}
      onVoltar={() => setTemplateId("")}
    />
  );
}

interface FichaFormProps {
  templateId: string;
  versaoTemplate: number;
  campos: CampoTemplate[];
  nome: string;
  setor: string;
  perfil: PerfilSessao;
  onVoltar: () => void;
}

function FichaForm({ templateId, versaoTemplate, campos, nome, setor, perfil, onVoltar }: FichaFormProps) {
  const [sucesso, setSucesso] = useState<"online" | "offline" | null>(null);
  const criarMonitoramento = useCriarMonitoramento();
  const { data: ultimoRegistro } = useUltimoRegistroFicha(templateId, setor);

  const schema = zodFromSchemaCampos(campos);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciaisDe(campos),
  });

  // chiller_partes/lavagem_final/mini_chillers dependem AO VIVO do valor do campo
  // chiller_carcacas desta mesma ficha (peso médio de carcaça, aves no período) — igual ao
  // v1, que lia o "campo irmão" do próprio formData em vez de buscar no banco.
  const chaveChillerCarcacas = campos.find((c) => c.tipo === "chiller_carcacas")?.chave;
  const carcacasAtual = useWatch({ control, name: chaveChillerCarcacas ?? "__inexistente__" }) as
    | ChillerCarcacasValor
    | undefined;

  // Campos com `dependeDe` só aparecem quando o campo do qual dependem tem exatamente aquele
  // valor — mesma mecânica do v1 (NovoRegistro.jsx). Observa o formulário inteiro (poucos
  // campos por ficha) para decidir visibilidade e limpar o valor assim que a dependência
  // deixa de ser satisfeita, evitando um valor residual contradizendo o campo principal.
  const valoresForm = useWatch({ control }) as Record<string, unknown>;
  const camposVisiveis = campos.filter((campo) => !campo.dependeDe || valoresForm?.[campo.dependeDe.campo] === campo.dependeDe.valor);

  useEffect(() => {
    for (const campo of campos) {
      if (!campo.dependeDe) continue;
      const condicaoAtendida = valoresForm?.[campo.dependeDe.campo] === campo.dependeDe.valor;
      const valorAtual = valoresForm?.[campo.chave];
      if (!condicaoAtendida && valorAtual !== undefined && valorAtual !== "") {
        setValue(campo.chave, "");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresForm]);

  async function aoEnviar(dados: FieldValues) {
    setSucesso(null);
    try {
      const resultado = await criarMonitoramento.mutateAsync({
        fichaTemplateId: templateId,
        versaoTemplate,
        userId: perfil.id,
        setor,
        dadosDinamicos: dados,
      });
      reset(valoresIniciaisDe(campos));
      setSucesso(resultado.modo);
    } catch {
      // erro já refletido em criarMonitoramento.isError, renderizado abaixo.
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Preenchendo: {nome}</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4" noValidate>
            {camposVisiveis.map((campo) => (
              <DynamicField
                key={campo.chave}
                campo={campo}
                register={register}
                errors={errors}
                control={control}
                prevAppointment={ultimoRegistro?.dados_dinamicos}
                carcacasAtual={carcacasAtual}
              />
            ))}

            {criarMonitoramento.isError && (
              <p className="text-sm text-destructive">Falha ao criar/assinar a ficha. Tente novamente.</p>
            )}
            {sucesso === "online" && <p className="text-sm text-success">Ficha criada e assinada com sucesso.</p>}
            {sucesso === "offline" && (
              <p className="text-sm text-warning">
                Sem conexão — ficha salva no dispositivo e será enviada e assinada automaticamente assim que a rede voltar.
              </p>
            )}

            <Button type="submit" disabled={isSubmitting || criarMonitoramento.isPending}>
              {isSubmitting || criarMonitoramento.isPending ? "Salvando e assinando…" : "Criar e assinar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
