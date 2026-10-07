import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, Clock, Lock, ShieldCheck, X } from "lucide-react";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { zodFromSchemaCampos, valoresIniciaisDe, type CampoTemplate } from "@/shared/schema-campos";
import { conferirSenha } from "@/modules/auth/reautenticar";
import { CHAVE_CONTINUACAO, buscarRegistrosRecentesFicha, chaveRegistrosRecentes, useCriarMonitoramento, useRegistroContinuavel, useTemplatesAtivos, useTurnoFixoDoUsuario, useUltimoRegistroFicha, useUltimosApontamentosHoje, type TemplateAtivo } from "./api";
import { ContinuacaoMonitoramento, MOTIVO_CONTINUACAO_MIN_CARACTERES } from "./components/ContinuacaoMonitoramento";
import { RascunhosPainel } from "./components/RascunhosPainel";
import { useAtualizarRascunhos, useRascunhos } from "./useRascunhos";
import { cargasEmRascunhoPorTipo, cargasEmRascunhos, combinarAnterior } from "./utils/rascunhosAnterior";
import { CHAVE_HORA_MONITORAMENTO, dataManaus, horaManaus, isoDeManaus, validarHoraMonitoramento } from "./utils/horaMonitoramento";
import { salvarRascunho } from "@/lib/rascunhos";
import { listarFichasEnfileiradas } from "@/lib/offlineQueue";
import { dadosJaRegistrados, chavesDeConfirmacao } from "./utils/dadosDuplicados";
import { CHAVE_AGUARDANDO_PESO, cargasSemPeso } from "./fields/pesoCaixa";
import { lotesSemPeso } from "./fields/preenchimentoSpr";
import { motivosDeBloqueioSpr } from "./utils/bloqueiosSpr";
import { desviosEspeciais, temNaoConformidade } from "./utils/desviosEspeciais";
import { ModalAutocorrecao } from "@/modules/autocorrecao/ModalAutocorrecao";
import { drippingEmFase1, validarFaseInicial } from "./fields/calculosAbsorcao";
import type { AbsorcaoAguaValor, DrippingTestValor } from "./fields/tiposCompostos";
import { MonitoramentosEmAndamento } from "./components/MonitoramentosEmAndamento";
import { turnoAlvoHeranca } from "./utils/turnoUtils";
import { useSincronizacaoOffline } from "./useSincronizacaoOffline";
import { useAudioAlarm } from "./useAudioAlarm";
import { DynamicField } from "./DynamicField";
import type { ChillerCarcacasValor, PesoCaixaValor } from "./fields/tiposCompostos";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
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
          <div key={item.id} className="flex flex-wrap gap-2 items-center justify-between">
            <span className="text-muted-foreground">
              Capturada em {new Date(item.capturadoEm).toLocaleString("pt-BR")}
            </span>
            <Badge variant={item.status === "falha_autenticacao" ? "destructive" : "outline"}>
              {ROTULO_STATUS_FILA[item.status] ?? item.status}
            </Badge>
            {item.status === "falhou" && /72 horas/.test(item.ultimoErro ?? "") && (
              <p role="alert" className="basis-full text-xs text-destructive">
                O prazo de 72 h passou e o servidor não confirmou queda de rede para este aparelho. Os dados continuam salvos aqui — procure o verificador/gestão antes de apagar ou refazer.
              </p>
            )}
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
  // Deep link do Painel de Bordo (card "Fichas Atrasadas"): abre direto a ficha no setor certo.
  const [searchParams] = useSearchParams();
  const setorDoLink = searchParams.get("setor") ?? "";
  const [setor, setSetor] = useState(setorDoLink || (setoresDoUsuario[0] ?? ""));
  const [templateId, setTemplateId] = useState(searchParams.get("ficha") ?? "");
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!perfil) return;
    setSetor((atual) =>
      atual && setoresDoUsuario.includes(atual)
        ? atual
        : setorDoLink && setoresDoUsuario.includes(setorDoLink)
          ? setorDoLink
          : (setoresDoUsuario[0] ?? "")
    );
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
  const { data: apontamentosServidor } = useUltimosApontamentosHoje(setor);
  const { data: rascunhos } = useRascunhos(perfil?.id);
  // Rascunho = monitoramento já realizado (só não assinado): conta para o intervalo mínimo e o atraso.
  const apontamentos = useMemo(() => {
    if (!apontamentosServidor) return apontamentosServidor;
    const mapaUltimos = new Map(apontamentosServidor.mapaUltimos);
    for (const r of rascunhos ?? []) {
      if (r.setor !== setor) continue;
      const atual = mapaUltimos.get(r.codigo);
      if (!atual || r.horaMonitoramento > atual) mapaUltimos.set(r.codigo, r.horaMonitoramento);
    }
    return { ...apontamentosServidor, mapaUltimos };
  }, [apontamentosServidor, rascunhos, setor]);
  const templateSelecionado = fichasDoSetor.find((t) => t.id === templateId);

  const statusPorFicha = useMemo(
    () =>
      new Map(
        fichasDoSetor.map((f) => [f.id, calcularStatus(f, apontamentos?.mapaUltimos.get(f.codigo), agora)])
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

        <RascunhosPainel />
        <FilaOfflinePainel />
        <MonitoramentosEmAndamento />

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
            const temDesvio = apontamentos?.fichasComDesvio.has(ficha.codigo) ?? false;

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
                  <div className="flex flex-wrap items-start justify-between gap-2">
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
      codigo={templateSelecionado.codigo}
      versaoTemplate={templateSelecionado.versao}
      campos={templateSelecionado.schema_campos as CampoTemplate[]}
      nome={templateSelecionado.nome}
      intervaloMin={templateSelecionado.tempo_entre_apontamentos_min}
      setor={setor}
      perfil={perfil}
      onVoltar={() => setTemplateId("")}
    />
  );
}

interface FichaFormProps {
  templateId: string;
  codigo: string;
  versaoTemplate: number;
  campos: CampoTemplate[];
  nome: string;
  intervaloMin: number | null;
  setor: string;
  perfil: PerfilSessao;
  onVoltar: () => void;
}

function FichaForm({ templateId, codigo, versaoTemplate, campos, nome, intervaloMin, setor, perfil, onVoltar }: FichaFormProps) {
  const [sucesso, setSucesso] = useState<"online" | "offline" | "em_andamento" | "rascunho" | "rascunho_nc" | "aguardando_peso" | null>(null);
  // Avisos de carga já NÃO CONFORME ao salvar a etapa 1 do peso por caixa (as demais cargas ainda sem peso).
  const [avisosEtapa1, setAvisosEtapa1] = useState<string[]>([]);
  // Hora do monitoramento: informada MANUALMENTE (abrir a ficha só para olhar não registra hora).
  const [horaData, setHoraData] = useState(() => dataManaus(new Date()));
  const [horaHora, setHoraHora] = useState("");
  const [erroHora, setErroHora] = useState<string | null>(null);
  // Monitoramento NÃO CONFORME salvo como rascunho: avisa na hora, pois a RNC/ação corretiva imediata só existe depois de assinar.
  const [ncRascunho, setNcRascunho] = useState<{ dados: FieldValues; avisos: string[] } | null>(null);
  const atualizarRascunhos = useAtualizarRascunhos();
  const queryClient = useQueryClient();
  // Aviso (modal) de monitoramento com os mesmos dados de outro já registrado (assinado, na fila ou rascunho).
  const [avisoRepetido, setAvisoRepetido] = useState(false);
  const [dadosPendentes, setDadosPendentes] = useState<FieldValues | null>(null);
  const [senha, setSenha] = useState("");
  const [autenticando, setAutenticando] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const criarMonitoramento = useCriarMonitoramento();
  // Leitura anterior herdada: mesmo tipo de ficha, setor e TURNO, criada hoje. O turno fixo do
  // usuário vale; "Ambos" deduz pelo horário de Manaus (05h–17h = 1º Turno). A consulta só roda
  // depois de o turno ser conhecido, para não travar uma leitura de outro turno.
  const { data: turnoFixo, isSuccess: turnoConhecido } = useTurnoFixoDoUsuario(
    perfil.id,
  );
  const turnoAlvo = turnoAlvoHeranca(turnoFixo, new Date());
  const { data: ultimoServidor } = useUltimoRegistroFicha(
    codigo,
    setor,
    turnoAlvo,
    turnoConhecido,
  );
  const { data: rascunhosLocais } = useRascunhos(perfil.id);
  // A leitura anterior vem do mais recente entre o servidor e os rascunhos locais desta ficha: o 2º
  // monitoramento feito sem internet herda do 1º.
  const ultimoRegistro = useMemo(
    () => combinarAnterior(ultimoServidor, rascunhosLocais, codigo, setor, turnoAlvo, new Date()),
    [ultimoServidor, rascunhosLocais, codigo, setor, turnoAlvo]
  );
  // Continuação de um monitoramento de antes de hoje (turno encerrado antes do lançamento): só é
  // oferecida quando hoje ainda não há registro desta ficha para herdar.
  const camposComHeranca = campos.some((c) => ["chiller_carcacas", "chiller_partes", "mini_chillers", "lavagem_final", "potabilidade_agua"].includes(c.tipo));
  const { data: registroContinuavel } = useRegistroContinuavel(codigo, setor, turnoConhecido && camposComHeranca && ultimoRegistro === null);
  const [continuando, setContinuando] = useState(false);
  const [motivoContinuacao, setMotivoContinuacao] = useState("");
  // Em continuação, a leitura anterior é a do mais recente entre o registro continuado e os rascunhos
  // desta ficha (de qualquer dia): vários monitoramentos de ontem se encadeiam entre si.
  const anteriorContinuacao = useMemo(
    () => (continuando ? combinarAnterior(registroContinuavel, rascunhosLocais, codigo, setor, undefined, new Date(), "continuacao") : null),
    [continuando, registroContinuavel, rascunhosLocais, codigo, setor]
  );
  const registroPrevio = ultimoRegistro ?? anteriorContinuacao;
  const cargasEmRascunho = useMemo(() => cargasEmRascunhos(rascunhosLocais, codigo, setor), [rascunhosLocais, codigo, setor]);
  // Carga já monitorada em rascunho (ainda não assinado) não volta à lista no monitoramento seguinte.
  const cargasUsadasEmRascunho = useMemo(() => cargasEmRascunhoPorTipo(rascunhosLocais), [rascunhosLocais]);
  const [motivosBloqueio, setMotivosBloqueio] = useState<string[]>([]);
  const [avisosDesvio, setAvisosDesvio] = useState<string[]>([]);
  // Dados aguardando a confirmação "assinar monitoramento NÃO CONFORME?" (antes do modal de senha).
  const [confirmarNc, setConfirmarNc] = useState<FieldValues | null>(null);
  // Monitoramento JÁ assinado com não conformidade: avisa na hora para emitir a RNC (vale para qualquer
  // perfil e não depende de turno aberto nem do painel de bordo carregar).
  const [ncAposAssinar, setNcAposAssinar] = useState<{ id: string; offline: boolean } | null>(null);
  const [autocorrigindoNc, setAutocorrigindoNc] = useState(false);
  const navigate = useNavigate();

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

  // Peso por caixa: a balança pode não ter passado o peso de alguma carga. Nesse caso o botão salva a ETAPA 1
  // (aguardando peso: já vale para a frequência) e o peso é completado depois, em "Monitoramentos em andamento".
  const campoPeso = camposVisiveis.find((c) => c.tipo === "peso_caixa");
  // SPR Carcaças: lote com aves e sem peso vivo (a balança ainda não passou o peso da carga) também fica aguardando.
  const campoCarcacasForm = camposVisiveis.find((c) => c.tipo === "chiller_carcacas");
  const pesoPendente =
    (!!campoPeso && cargasSemPeso(valoresForm?.[campoPeso.chave] as PesoCaixaValor | undefined).length > 0) ||
    (!!campoCarcacasForm && lotesSemPeso(valoresForm?.[campoCarcacasForm.chave] as ChillerCarcacasValor | undefined).length > 0);
  const horaMonitoramentoIso = isoDeManaus(horaData, horaHora) ?? undefined;

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

  /** A assinatura eletrônica avançada (Lei 14.063/2020, Art. 4º §2º) exige reautenticação por
   * senha no momento de assinar — mesmo mecanismo de PainelVerificacao (confirmarComSenha):
   * sem rede, não há como validar a senha contra o servidor, então esse passo é pulado e o
   * registro vai direto para a fila offline (useCriarMonitoramento já assina automaticamente
   * ao sincronizar, seção 7.5/ADR 0002). */
  /** Valida a hora informada (obrigatória, não futura, dentro de 72 h, posterior à anterior e respeitando o
   * intervalo mínimo) e a devolve em ISO; null (com a mensagem na tela) se inválida. */
  /** Hora do monitoramento anterior desta ficha+setor: o mais recente entre o anterior herdado e os
   * rascunhos locais (de qualquer dia, dentro da janela de 72 h). */
  function anteriorParaValidar(): string | null {
    const horas = [registroPrevio?.criado_em, ...(rascunhosLocais ?? []).filter((r) => r.codigo === codigo && r.setor === setor).map((r) => r.horaMonitoramento)].filter(
      (h): h is string => !!h
    );
    return horas.length > 0 ? horas.sort().at(-1)! : null;
  }

  function horaValidada(): string | null {
    const iso = isoDeManaus(horaData, horaHora);
    const erro = validarHoraMonitoramento({
      hora: iso,
      agora: new Date(),
      anteriorEm: anteriorParaValidar(),
      intervaloMin,
    });
    setErroHora(erro);
    return erro ? null : iso;
  }

  /** Os dados são idênticos aos de um monitoramento já registrado desta ficha+setor (assinado, aguardando sincronização
   * ou rascunho)? Se sim, abre o aviso e devolve true. Sem rede, vale o último levantamento em cache + a fila + os rascunhos. */
  async function bloqueadoPorDadosRepetidos(dados: FieldValues): Promise<boolean> {
    const chave = chaveRegistrosRecentes(codigo, setor);
    let doServidor: Record<string, unknown>[] = [];
    try {
      doServidor = await queryClient.fetchQuery({ queryKey: chave, queryFn: () => buscarRegistrosRecentesFicha(codigo, setor), staleTime: 0, meta: { offline: true } });
    } catch {
      doServidor = queryClient.getQueryData<Record<string, unknown>[]>(chave) ?? [];
    }
    const daFila = (await listarFichasEnfileiradas().catch(() => [])).filter((f) => f.setor === setor && f.fichaTemplateId === templateId).map((f) => f.dadosDinamicos);
    const rascunhos = (rascunhosLocais ?? []).filter((r) => r.codigo === codigo && r.setor === setor).map((r) => r.dadosDinamicos);
    if (!dadosJaRegistrados(dados, [...doServidor, ...daFila, ...rascunhos], chavesDeConfirmacao(campos))) return false;
    setAvisoRepetido(true);
    return true;
  }

  async function aoEnviar(dadosForm: FieldValues) {
    const hora = horaValidada();
    if (!hora) return;
    const dados: FieldValues = { ...dadosForm, [CHAVE_HORA_MONITORAMENTO]: hora };
    if (pesoPendente) {
      await salvarEtapa1Peso(dados);
      return;
    }
    // Dripping em 1ª etapa (sem Retirada/M2): não assina — só "Salvar 1ª etapa do teste" (Enter no formulário não pode furar isso).
    if (drippingFase1) {
      setMotivosBloqueio(['Dripping Test: salve a 1ª etapa do teste. A assinatura só vem depois da Retirada e do M2 (2ª etapa).']);
      return;
    }
    // Partes/Miúdos/Chuveiro dependem do SPR Carcaças: sem a base vinda dele (fora do 1º
    // monitoramento do dia) a ficha não pode ser assinada nem enfileirada offline.
    const motivos = motivosDeBloqueioSpr(camposVisiveis, dados);
    if (continuando && motivoContinuacao.trim().length < MOTIVO_CONTINUACAO_MIN_CARACTERES) {
      motivos.push(`Continuação: informe o motivo (mínimo ${MOTIVO_CONTINUACAO_MIN_CARACTERES} caracteres).`);
    }
    setMotivosBloqueio(motivos);
    if (motivos.length > 0) return;
    if (await bloqueadoPorDadosRepetidos(dados)) return;

    // Absorção de Água / Dripping Test 'nao-conforme': a ficha é NÃO CONFORME e o aviso de desvio
    // aparece ANTES da assinatura (não bloqueia — o desvio segue o fluxo normal de RNC).
    const desvios = desviosEspeciais(camposVisiveis, dados);
    setAvisosDesvio(desvios);

    // Ficha NÃO CONFORME: pede confirmação ANTES do modal de assinatura (e antes de enfileirar offline).
    if (desvios.length > 0) {
      setConfirmarNc(dados);
      return;
    }
    await seguirParaAssinatura(dados);
  }

  /** Teste de Absorção em duas fases — fase 1: grava só a pesagem inicial (EM_ANDAMENTO), sem
   * conformidade, e assina como INSPETOR_PARCIAL. A pesagem final vem depois, no mesmo registro. */
  const campoAbsorcao = campos.find((c) => c.tipo === "absorcao_agua");
  // Dripping Test: enquanto só a 1ª etapa foi preenchida (sem Retirada/M2) não existe "Criar e assinar".
  const campoDripping = campos.find((c) => c.tipo === "dripping_test");
  const drippingFase1 = Boolean(campoDripping) && drippingEmFase1((valoresForm?.[campoDripping?.chave ?? ""] as DrippingTestValor | null | undefined)?.items);

  async function aoSalvarDepois(dadosForm: FieldValues) {
    if (!campoAbsorcao) return;
    const hora = horaValidada();
    if (!hora) return;
    const dados: FieldValues = { ...dadosForm, [CHAVE_HORA_MONITORAMENTO]: hora };
    const valor = dados[campoAbsorcao.chave] as AbsorcaoAguaValor | null | undefined;
    const impedimentos = validarFaseInicial(valor?.items ?? []);
    setMotivosBloqueio(impedimentos);
    if (impedimentos.length > 0) return;
    if (await bloqueadoPorDadosRepetidos({ ...dados, [campoAbsorcao.chave]: { ...valor, fase: "INICIAL" } })) return;

    setSucesso(null);
    try {
      await criarMonitoramento.mutateAsync({
        fichaTemplateId: templateId,
        versaoTemplate,
        userId: perfil.id,
        setor,
        statusFicha: "EM_ANDAMENTO",
        dadosDinamicos: { ...dados, [campoAbsorcao.chave]: { ...valor, fase: "INICIAL" } },
      });
      reset(valoresIniciaisDe(campos));
      setSucesso("em_andamento");
      setTimeout(onVoltar, 1800);
    } catch {
      // erro refletido em criarMonitoramento.isError (ex.: lacre já em andamento em outro registro).
    }
  }

  /** Marca de continuação (monitoramento pendente de antes de hoje), se for o caso. */
  function comContinuacao(dados: FieldValues): FieldValues {
    return continuando && registroPrevio
      ? { ...dados, [CHAVE_CONTINUACAO]: { registroId: registroPrevio.id, criadoEm: registroPrevio.criado_em, motivo: motivoContinuacao.trim() } }
      : dados;
  }

  /** Peso por caixa — ETAPA 1: grava o monitoramento sem o peso médio das cargas que a balança ainda não passou
   * (EM_ANDAMENTO, assinatura parcial). Já vale para a frequência e para herdar as leituras; o peso é completado
   * depois e só então o registro é finalizado, assinado e avaliado. */
  async function salvarEtapa1Peso(dados: FieldValues) {
    const motivos = motivosDeBloqueioSpr(camposVisiveis, dados, { permitirPesoPendente: true });
    if (continuando && motivoContinuacao.trim().length < MOTIVO_CONTINUACAO_MIN_CARACTERES) {
      motivos.push(`Continuação: informe o motivo (mínimo ${MOTIVO_CONTINUACAO_MIN_CARACTERES} caracteres).`);
    }
    setMotivosBloqueio(motivos);
    if (motivos.length > 0) return;
    if (await bloqueadoPorDadosRepetidos(dados)) return;

    setSucesso(null);
    setAvisosEtapa1(desviosEspeciais(camposVisiveis, dados));
    try {
      await criarMonitoramento.mutateAsync({
        fichaTemplateId: templateId,
        versaoTemplate,
        userId: perfil.id,
        setor,
        statusFicha: "EM_ANDAMENTO",
        dadosDinamicos: { ...comContinuacao(dados), [CHAVE_AGUARDANDO_PESO]: true },
      });
      setContinuando(false);
      setMotivoContinuacao("");
      reset(valoresIniciaisDe(campos));
      setSucesso("aguardando_peso");
      setTimeout(onVoltar, 3500);
    } catch {
      // erro refletido em criarMonitoramento.isError.
    }
  }

  /** Salva o monitoramento como RASCUNHO neste aparelho (com ou sem internet), para assinar depois em lote.
   * Mesmas validações do "Criar e assinar"; se estiver NÃO CONFORME, avisa na hora. */
  async function aoSalvarRascunho(dadosForm: FieldValues) {
    const hora = horaValidada();
    if (!hora) return;
    const dados: FieldValues = { ...dadosForm, [CHAVE_HORA_MONITORAMENTO]: hora };
    const motivos = motivosDeBloqueioSpr(camposVisiveis, dados, { permitirPesoPendente: true });
    if (continuando && motivoContinuacao.trim().length < MOTIVO_CONTINUACAO_MIN_CARACTERES) {
      motivos.push(`Continuação: informe o motivo (mínimo ${MOTIVO_CONTINUACAO_MIN_CARACTERES} caracteres).`);
    }
    setMotivosBloqueio(motivos);
    if (motivos.length > 0) return;
    if (await bloqueadoPorDadosRepetidos(dados)) return;

    const avisos = desviosEspeciais(camposVisiveis, dados);
    const naoConforme = avisos.length > 0 || temNaoConformidade(dados);
    if (naoConforme && navigator.onLine && !pesoPendente) {
      // Com internet dá para assinar já e tratar na hora (RNC ou ação corretiva imediata).
      setNcRascunho({ dados, avisos });
      return;
    }
    await gravarRascunho(dados, naoConforme, avisos);
  }

  async function gravarRascunho(dados: FieldValues, naoConforme: boolean, avisos: string[]) {
    setNcRascunho(null);
    const dadosFinais = pesoPendente ? { ...comContinuacao(dados), [CHAVE_AGUARDANDO_PESO]: true } : comContinuacao(dados);
    await salvarRascunho({
      id: crypto.randomUUID(),
      fichaTemplateId: templateId,
      codigo,
      nomeFicha: nome,
      versaoTemplate,
      userId: perfil.id,
      setor,
      dadosDinamicos: dadosFinais,
      horaMonitoramento: dados[CHAVE_HORA_MONITORAMENTO] as string,
      naoConforme,
      motivosNc: avisos,
      ...(pesoPendente ? { statusFicha: "EM_ANDAMENTO" as const } : {}),
    });
    void atualizarRascunhos();
    setContinuando(false);
    setMotivoContinuacao("");
    reset(valoresIniciaisDe(campos));
    setSucesso(naoConforme ? "rascunho_nc" : "rascunho");
    setTimeout(onVoltar, naoConforme ? 4000 : 1500);
  }

  // Com ou sem internet o inspetor confirma com a senha: sem rede ela é conferida neste aparelho e a assinatura
  // oficial sai quando a rede voltar (ADR 0016).
  async function seguirParaAssinatura(dados: FieldValues) {
    setDadosPendentes(dados);
  }

  async function confirmarAssinarNaoConforme() {
    if (!confirmarNc) return;
    const dados = confirmarNc;
    setConfirmarNc(null);
    await seguirParaAssinatura(dados);
  }

  function cancelarConfirmacaoNc() {
    setConfirmarNc(null);
    setAvisosDesvio([]);
  }

  async function salvar(dados: FieldValues, confirmacaoSenha?: { modo: "servidor" | "aparelho"; matricula?: string }) {
    setSucesso(null);
    try {
      const resultado = await criarMonitoramento.mutateAsync({
        fichaTemplateId: templateId,
        versaoTemplate,
        userId: perfil.id,
        setor,
        confirmacaoSenha,
        dadosDinamicos:
          continuando && registroPrevio
            ? { ...dados, [CHAVE_CONTINUACAO]: { registroId: registroPrevio.id, criadoEm: registroPrevio.criado_em, motivo: motivoContinuacao.trim() } }
            : dados,
      });
      setContinuando(false);
      setMotivoContinuacao("");
      reset(valoresIniciaisDe(campos));
      setSucesso(resultado.modo);
      setDadosPendentes(null);
      if (temNaoConformidade(dados)) {
        // Fica na tela até o inspetor decidir emitir a RNC agora ou depois.
        setNcAposAssinar({ id: resultado.id, offline: resultado.modo === "offline" });
        return;
      }
      // A ficha "fecha" (volta para a lista, onde o cronômetro de calcularStatus passa a
      // mostrar BLOQUEADO até vencer tempo_entre_apontamentos_min) em vez de ficar aberta
      // permitindo reenvio imediato do mesmo monitoramento.
      setTimeout(onVoltar, 1500);
    } catch {
      // erro já refletido em criarMonitoramento.isError, renderizado abaixo — dadosPendentes
      // permanece preenchido para o usuário tentar assinar de novo sem perder os dados.
    }
  }

  async function confirmarComSenha() {
    if (!dadosPendentes) return;
    setErroSenha(null);
    setAutenticando(true);
    try {
      const conferencia = await conferirSenha(senha);
      if (!conferencia.ok) {
        setErroSenha(conferencia.erro);
        return;
      }
      await salvar(dadosPendentes, conferencia.modo === "aparelho" ? { modo: "aparelho", matricula: conferencia.matricula } : { modo: "servidor" });
    } finally {
      setAutenticando(false);
      setSenha("");
    }
  }

  function cancelarAssinatura() {
    setDadosPendentes(null);
    setSenha("");
    setErroSenha(null);
    setAvisosDesvio([]);
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
          {/* Ficha com absorção de água: 1ª etapa (pesagem inicial) — não há "Criar e assinar" aqui; a pesagem
              final e a assinatura vêm depois, pela lista "Monitoramentos em andamento". */}
          <form onSubmit={handleSubmit(campoAbsorcao ? aoSalvarDepois : aoEnviar)} className="space-y-4" noValidate>
            <section className="space-y-2 rounded-lg border-2 border-primary/30 bg-primary/5 p-3" data-testid="hora-monitoramento">
              <Label htmlFor="hora-monitoramento-hora" className="text-xs font-black uppercase tracking-wider text-primary">
                Hora do monitoramento *
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="hora-monitoramento-data"
                  aria-label="Data do monitoramento"
                  type="date"
                  className="w-auto"
                  value={horaData}
                  onChange={(e) => setHoraData(e.target.value)}
                />
                <Input
                  id="hora-monitoramento-hora"
                  aria-label="Hora do monitoramento"
                  type="time"
                  className="w-auto"
                  value={horaHora}
                  onChange={(e) => setHoraHora(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const agoraLocal = new Date();
                    setHoraData(dataManaus(agoraLocal));
                    setHoraHora(horaManaus(agoraLocal));
                  }}
                >
                  Agora
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Informe a hora em que você <strong>realizou</strong> a medição (horário de Manaus). Só abrir a ficha não registra hora. O intervalo mínimo entre monitoramentos conta a partir dela.
              </p>
              {erroHora && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {erroHora}
                </p>
              )}
            </section>
            {ultimoRegistro === null && registroContinuavel && !campoAbsorcao && (
              <ContinuacaoMonitoramento
                registro={anteriorContinuacao ?? registroContinuavel}
                ativo={continuando}
                motivo={motivoContinuacao}
                onMotivo={setMotivoContinuacao}
                onAtivar={() => {
                  setContinuando(true);
                  // O monitoramento pendente é do dia do registro continuado (ex.: ontem): já sugere essa data.
                  setHoraData(dataManaus(new Date(registroContinuavel.criado_em)));
                }}
                onCancelar={() => {
                  setContinuando(false);
                  setMotivoContinuacao("");
                  setHoraData(dataManaus(new Date()));
                  reset(valoresIniciaisDe(campos));
                }}
              />
            )}
            {camposVisiveis.map((campo) => (
              <DynamicField
                key={`${campo.chave}-${continuando ? "continuacao" : "novo"}`}
                campo={campo}
                register={register}
                errors={errors}
                control={control}
                prevAppointment={registroPrevio?.dados_dinamicos}
                carcacasAtual={carcacasAtual}
                diaMonitoramento={horaData}
                horaMonitoramento={horaMonitoramentoIso}
                cargasEmRascunho={cargasEmRascunho}
                cargasUsadasEmRascunho={cargasUsadasEmRascunho}
                faseAbsorcao={campoAbsorcao ? "INICIAL" : undefined}
                aoSalvarPrimeiraEtapaDripping={onVoltar}
              />
            ))}

            {motivosBloqueio.length > 0 && (
              <div
                role="alert"
                className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive"
              >
                <p className="font-bold">
                  Não é possível assinar esta ficha ainda:
                </p>
                <ul className="list-disc pl-5">
                  {motivosBloqueio.map((motivo) => (
                    <li key={motivo}>{motivo}</li>
                  ))}
                </ul>
              </div>
            )}
            {criarMonitoramento.isError && (
              <p className="text-sm text-destructive">
                Falha ao criar/assinar a ficha. Tente novamente.
                {(criarMonitoramento.error as { message?: string } | null)?.message?.includes("lacre") && ` ${(criarMonitoramento.error as { message: string }).message}`}
              </p>
            )}
            {sucesso === "em_andamento" && (
              <p className="text-sm text-success">
                Primeira etapa salva. O monitoramento ficou em andamento — faça a pesagem final pela lista "Monitoramentos em andamento".
              </p>
            )}
            {sucesso === "online" && <p className="text-sm text-success">Ficha criada e assinada com sucesso.</p>}
            {sucesso === "aguardando_peso" && (
              <div role="status" className="space-y-1 rounded border border-warning bg-warning/10 p-2 text-sm">
                <p className="font-medium">
                  Monitoramento salvo <strong>aguardando o peso da balança</strong>. Já vale para a frequência; quando o peso chegar, complete em "Monitoramentos em andamento".
                </p>
                {avisosEtapa1.length > 0 && (
                  <ul className="list-disc pl-5 font-medium text-destructive">
                    {avisosEtapa1.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {sucesso === "rascunho" && (
              <p className="text-sm text-success">Rascunho salvo neste aparelho. Assine pela lista de rascunhos em até 72 h.</p>
            )}
            {sucesso === "rascunho_nc" && (
              <p role="alert" className="rounded border border-destructive bg-destructive/10 p-2 text-sm font-medium text-destructive">
                Rascunho salvo como NÃO CONFORME. Sem conexão não dá para emitir a RNC nem a ação corretiva agora: assine assim que houver internet.
              </p>
            )}
            {sucesso === "offline" && (
              <p className="text-sm text-warning">
                Sem conexão — ficha confirmada com a sua senha e salva no aparelho. Ela será enviada e assinada automaticamente (assinatura oficial e carimbo de tempo) assim que a rede voltar.
              </p>
            )}

            {campoAbsorcao ? (
              <Button type="submit" disabled={isSubmitting || criarMonitoramento.isPending}>
                {isSubmitting || criarMonitoramento.isPending ? "Salvando…" : "Salvar primeira etapa"}
              </Button>
            ) : drippingFase1 ? (
              <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm text-muted-foreground">
                Dripping Test: a assinatura só vem na 2ª etapa, depois da drenagem (Retirada e M2). Na 1ª etapa use "Salvar 1ª etapa do teste".
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={isSubmitting || criarMonitoramento.isPending}>
                  {isSubmitting || criarMonitoramento.isPending ? "Salvando…" : pesoPendente ? "Salvar e aguardar o peso" : "Criar e assinar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || criarMonitoramento.isPending}
                  onClick={() => void handleSubmit(aoSalvarRascunho)()}
                >
                  Salvar rascunho (assinar depois)
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {ncRascunho && (
        <ModalAssinatura titulo="Monitoramento NÃO CONFORME" onFechar={() => setNcRascunho(null)}>
          <div className="space-y-4" data-testid="nc-no-rascunho">
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Este monitoramento está NÃO CONFORME.
              </p>
              {ncRascunho.avisos.length > 0 && (
                <ul className="list-disc pl-5">
                  {ncRascunho.avisos.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              )}
              <p>Para emitir a RNC ou registrar a ação corretiva imediata agora, é preciso assinar o monitoramento.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => void gravarRascunho(ncRascunho.dados, true, ncRascunho.avisos)}>
                Salvar rascunho mesmo assim
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  const dados = ncRascunho.dados;
                  setNcRascunho(null);
                  void seguirParaAssinatura(dados);
                }}
              >
                Assinar agora e tratar
              </Button>
            </div>
          </div>
        </ModalAssinatura>
      )}

      {avisoRepetido && (
        <ModalAssinatura titulo="Atenção" onFechar={() => setAvisoRepetido(false)}>
          <div className="space-y-4" data-testid="aviso-dados-repetidos">
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Atenção: os dados informados já foram registrados.
              </p>
              <p>Não é possível gravar dois monitoramentos com os mesmos dados. Revise as informações e registre a leitura atual.</p>
            </div>
            <Button type="button" className="w-full" autoFocus onClick={() => setAvisoRepetido(false)}>
              Entendi, voltar e revisar
            </Button>
          </div>
        </ModalAssinatura>
      )}

      {confirmarNc && (
        <ModalAssinatura titulo="Monitoramento NÃO CONFORME" onFechar={cancelarConfirmacaoNc}>
          <div className="space-y-4" data-testid="confirmar-nao-conforme">
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Este monitoramento será registrado como NÃO CONFORME.
              </p>
              <ul className="list-disc pl-5">
                {avisosDesvio.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm font-medium">Deseja assinar o monitoramento não conforme?</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={cancelarConfirmacaoNc}>
                Não, voltar e revisar
              </Button>
              <Button type="button" variant="destructive" className="flex-1" onClick={() => void confirmarAssinarNaoConforme()}>
                Sim, assinar
              </Button>
            </div>
          </div>
        </ModalAssinatura>
      )}

      {ncAposAssinar && (
        <ModalAssinatura titulo="Emita o relatório de não conformidade" onFechar={onVoltar}>
          <div className="space-y-4" data-testid="nc-apos-assinar">
            <div role="alert" className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <p className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Você tem um monitoramento finalizado com não conformidade.
              </p>
              <p>Emita agora um relatório de não conformidade (RNC) ou registre a autocorreção imediata (medida de autocontrole), que restabelece a conformidade.</p>
              {ncAposAssinar.offline && (
                <p className="text-xs">
                  Sem conexão: o monitoramento será enviado quando a rede voltar. Emita a RNC ou registre a autocorreção pelo Painel de Bordo depois de sincronizar.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onVoltar}>
                Depois
              </Button>
              <Button type="button" variant="outline" className="flex-1" disabled={ncAposAssinar.offline} onClick={() => setAutocorrigindoNc(true)}>
                Autocorreção imediata
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={ncAposAssinar.offline}
                onClick={() => navigate(`/nova-rnc?vinculo=${ncAposAssinar.id}`)}
              >
                Emitir RNC agora
              </Button>
            </div>
          </div>
        </ModalAssinatura>
      )}

      {autocorrigindoNc && ncAposAssinar && (
        <ModalAutocorrecao
          monitoramentoId={ncAposAssinar.id}
          onFechar={() => setAutocorrigindoNc(false)}
          onRegistrada={() => {
            setNcAposAssinar(null);
            setTimeout(onVoltar, 800);
          }}
        />
      )}

      {dadosPendentes && (
        <ModalAssinatura titulo="Assinatura Eletrônica do Inspetor" onFechar={autenticando ? () => undefined : cancelarAssinatura}>
          <div className="space-y-4">
            {avisosDesvio.length > 0 && (
              <div
                role="alert"
                className="space-y-1 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive"
              >
                <p className="font-bold">
                  ⚠️ Desvio: esta ficha será registrada como NÃO CONFORME.
                </p>
                <ul className="list-disc pl-5">
                  {avisosDesvio.map((aviso) => (
                    <li key={aviso}>{aviso}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Confirme sua senha (a mesma do login) para assinar eletronicamente este monitoramento.
            </p>
            {!navigator.onLine && (
              <p role="status" className="rounded-md border border-warning bg-warning/15 p-2 text-xs text-warning-foreground">
                Sem conexão: sua senha será conferida neste aparelho e a ficha entra na fila. A assinatura eletrônica oficial (com carimbo de tempo) é concluída automaticamente quando a internet voltar.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="senha-assinatura-ficha">Sua senha</Label>
              <Input
                id="senha-assinatura-ficha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={autenticando}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && senha && !autenticando) void confirmarComSenha();
                }}
              />
            </div>
            {erroSenha && <p className="text-sm text-destructive">{erroSenha}</p>}
            {criarMonitoramento.isError && (
              <p className="text-sm text-destructive">Falha ao criar/assinar a ficha. Tente novamente.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={autenticando} onClick={cancelarAssinatura}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={autenticando || !senha || criarMonitoramento.isPending}
                onClick={confirmarComSenha}
              >
                {autenticando || criarMonitoramento.isPending ? "Assinando…" : "Confirmar e Assinar"}
              </Button>
            </div>
          </div>
        </ModalAssinatura>
      )}
    </div>
  );
}

/** Ambiente de assinatura do Inspetor de Qualidade — sempre um modal por cima do formulário
 * preenchido (nunca substitui a tela), mesmo padrão visual do modal de "Assinatura de Adendo"
 * de Painel de Bordo (ModalBase local ali). */
function ModalAssinatura({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label={titulo} className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5" />
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
