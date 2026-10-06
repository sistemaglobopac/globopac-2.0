import { erroDeFuncao } from "@/lib/erroFuncao";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CAMPOS_AUTOCORRECAO, type AutocorrecaoImediata } from "@/modules/autocorrecao/api";
import { supabase } from "@/lib/supabase";
import type { CampoTemplate } from "@/shared/schema-campos";
import { PRAZO_ONLINE_MS, enfileirarFicha, estaOffline } from "@/lib/offlineQueue";
import { inicioDoDiaManaus } from "@/modules/bordo/api";
import type { Rnc, StatusRnc } from "@/modules/rnc/api";
import type { MonitoramentoVerificacao } from "./utils/recordGrouping";
import { parseConfigExtras } from "@/modules/gestao/api";
import { turnoParaHeranca, type TurnoHeranca } from "./utils/turnoUtils";
import { horaEfetiva } from "./utils/horaMonitoramento";

export interface TemplateAtivo {
  id: string;
  codigo: string;
  versao: number;
  nome: string;
  pac_correspondente: string;
  schema_campos: CampoTemplate[];
  tipo_apontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno" | null;
  tempo_entre_apontamentos_min: number | null;
  tempo_edicao_min: number | null;
  locais_aplicacao: string[];
}

export function useTemplatesAtivos() {
  return useQuery({
    queryKey: ["fichas_templates", "ativos"],
    meta: { offline: true },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .select(
          "id, codigo, versao, nome, pac_correspondente, schema_campos, tipo_apontamento, frequencia, " +
            "tempo_entre_apontamentos_min, tempo_edicao_min, locais_aplicacao"
        )
        .eq("ativo", true)
        .order("nome")
        .overrideTypes<TemplateAtivo[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------------------
// Tela de seleção de ficha (Nova Ficha) — cronômetro de liberado/bloqueado/atrasado por
// ficha, igual à mecânica do v1 (NovoRegistro.jsx): compara o horário do último
// apontamento de HOJE (mesmo setor) com `tempo_entre_apontamentos_min`, com 5 min de
// tolerância antes de virar "atrasado".
// ---------------------------------------------------------------------------------------
export interface UltimosApontamentosHoje {
  /** código da ficha → horário (ISO) do apontamento mais recente de hoje, neste setor (qualquer versão). */
  mapaUltimos: Map<string, string>;
  /** código da ficha com um desvio ainda ativo hoje (não conforme, sem RNC fechada). */
  fichasComDesvio: Set<string>;
}

export function useUltimosApontamentosHoje(setor: string | undefined) {
  return useQuery({
    queryKey: ["monitoramentos", "ultimos-hoje", setor],
    meta: { offline: true },
    enabled: !!setor,
    refetchInterval: 15_000,
    queryFn: async (): Promise<UltimosApontamentosHoje> => {
      const desde = inicioDoDiaManaus(new Date()).toISOString();
      const { data: dados, error } = await supabase
        .from("monitoramentos")
        .select("id, ficha_template_id, criado_em, hora_monitoramento, conformidade")
        .eq("setor", setor as string)
        .or(`hora_monitoramento.gte.${desde},and(hora_monitoramento.is.null,criado_em.gte.${desde})`)
        .overrideTypes<
          { id: string; ficha_template_id: string; criado_em: string; hora_monitoramento: string | null; conformidade: boolean | null }[],
          { merge: false }
        >();
      if (error) throw error;
      // Vale a hora em que o monitoramento foi REALIZADO (informada pelo inspetor), não a da
      // assinatura: o intervalo mínimo conta a partir dela. Mais recente primeiro.
      const hoje = (dados ?? [])
        .map((m) => ({ ...m, criado_em: horaEfetiva(m) }))
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));

      // Ficha reeditada ganha um template novo com o MESMO código, e o inspetor não lê o template
      // antigo (RLS): o código de cada versão vem de uma função do banco, para o cronômetro e o
      // desvio valerem para a ficha e não para uma versão dela.
      const idsDoDia = Array.from(new Set((hoje ?? []).map((m) => m.ficha_template_id)));
      const codigoPorId = new Map<string, string>();
      if (idsDoDia.length > 0) {
        const { data: codigos } = await supabase.rpc("codigos_de_templates", { p_ids: idsDoDia });
        for (const c of (codigos as unknown as { id: string; codigo: string }[] | null) ?? []) codigoPorId.set(c.id, c.codigo);
      }
      const codigoDe = (idTemplate: string) => codigoPorId.get(idTemplate) ?? idTemplate;

      const mapaUltimos = new Map<string, string>();
      for (const m of hoje ?? []) {
        const chave = codigoDe(m.ficha_template_id);
        if (!mapaUltimos.has(chave)) mapaUltimos.set(chave, m.criado_em);
      }

      const naoConformes = (hoje ?? []).filter((m) => m.conformidade === false);
      const fichasComDesvio = new Set<string>();
      if (naoConformes.length > 0) {
        const { data: rncs, error: erroRnc } = await supabase
          .from("rnc")
          .select("monitoramento_id, status")
          .in(
            "monitoramento_id",
            naoConformes.map((m) => m.id)
          )
          .neq("status", "FECHADA")
          .overrideTypes<{ monitoramento_id: string | null; status: StatusRnc }[], { merge: false }>();
        if (erroRnc) throw erroRnc;
        const idsComRncAtiva = new Set((rncs ?? []).map((r) => r.monitoramento_id));
        for (const m of naoConformes) {
          if (idsComRncAtiva.has(m.id)) fichasComDesvio.add(codigoDe(m.ficha_template_id));
        }
      }

      return { mapaUltimos, fichasComDesvio };
    },
  });
}

/** Registro mais recente de HOJE desta ficha+setor — usado para herdar a leitura anterior
 * dos widgets "Especial SIF" (ex.: hidrômetro do chiller), igual a `registrosRecentes[0]`
 * no v1. Não é a fila de "apontamentos recentes para editar" (fora do escopo desta fase).
 *
 * Busca por `codigo` (todas as versões da ficha, ativa ou não) em vez do `ficha_template_id`
 * exato: o versionamento é não-destrutivo (uma edição no Construtor de Fichas no meio do turno
 * cria uma linha NOVA em `fichas_templates`, com um id diferente) — se a busca filtrasse pelo id
 * exato do template selecionado agora, uma edição da ficha entre dois monitoramentos do mesmo
 * dia faria o sistema "esquecer" a leitura anterior e tratar o 2º apontamento como se fosse o
 * primeiro, mesmo sendo a mesma ficha do ponto de vista do inspetor (bug real, encontrado em
 * produção: RAC-001/006 V2 foi editada no meio do dia e o SPR Carcaças voltou a pedir só a
 * leitura atual no apontamento seguinte). */
export function useUltimoRegistroFicha(codigo: string | undefined, setor: string | undefined, turno?: TurnoHeranca, habilitado = true) {
  return useQuery({
    queryKey: ["monitoramentos", "ultimo-registro-ficha", codigo, setor, turno],
    meta: { offline: true },
    enabled: !!codigo && !!setor && habilitado,
    queryFn: async () => {
      // Função do banco: o inspetor só lê templates ativos, e os registros do dia podem apontar
      // para versões já inativas (ficha reeditada no meio do dia).
      const { data: versoes, error: erroVersoes } = await supabase.rpc("ids_versoes_ficha", { p_codigo: codigo as string });
      if (erroVersoes) throw erroVersoes;
      const idsDasVersoes = (versoes as unknown as string[] | null) ?? [];
      if (idsDasVersoes.length === 0) return null;

      const desde = inicioDoDiaManaus(new Date()).toISOString();
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, dados_dinamicos, criado_em, hora_monitoramento")
        .in("ficha_template_id", idsDasVersoes)
        .eq("setor", setor as string)
        .or(`hora_monitoramento.gte.${desde},and(hora_monitoramento.is.null,criado_em.gte.${desde})`)
        .limit(100)
        .overrideTypes<
          { id: string; dados_dinamicos: Record<string, unknown>; criado_em: string; hora_monitoramento: string | null }[],
          { merge: false }
        >();
      if (error) throw error;
      // O "monitoramento anterior" é o mais recente DO MESMO TURNO (ver turnoParaHeranca), pela hora
      // em que foi realizado (criado_em volta já com a hora efetiva).
      return (data ?? [])
        .map((m) => ({ id: m.id, dados_dinamicos: m.dados_dinamicos, criado_em: horaEfetiva(m) }))
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
        .find((m) => !turno || turnoParaHeranca(new Date(m.criado_em)) === turno) ?? null;
    },
  });
}

/** Janela máxima (horas) para continuar um monitoramento anterior que ficou para trás. */
export const CONTINUACAO_JANELA_HORAS = 24;
/** Chave reservada em dados_dinamicos (entra no hash assinado) que marca o registro como
 * continuação de outro monitoramento: { registroId, criadoEm, motivo }. */
export const CHAVE_CONTINUACAO = "continuacao_de";

export interface RegistroContinuavel {
  id: string;
  dados_dinamicos: Record<string, unknown>;
  criado_em: string;
}

/** Último monitoramento finalizado desta ficha+setor nas últimas CONTINUACAO_JANELA_HORAS, ANTERIOR
 * ao início de hoje: candidato a "continuação" quando o turno/dia terminou antes do lançamento. A
 * leitura anterior que o novo registro herda. Hoje vale a herança normal (useUltimoRegistroFicha). */
export function useRegistroContinuavel(codigo: string | undefined, setor: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["monitoramentos", "continuavel", codigo, setor],
    meta: { offline: true },
    enabled: !!codigo && !!setor && habilitado,
    queryFn: async (): Promise<RegistroContinuavel | null> => {
      const { data: versoes, error: erroVersoes } = await supabase.rpc("ids_versoes_ficha", { p_codigo: codigo as string });
      if (erroVersoes) throw erroVersoes;
      const ids = (versoes as unknown as string[] | null) ?? [];
      if (ids.length === 0) return null;
      const desde = new Date(Date.now() - CONTINUACAO_JANELA_HORAS * 3_600_000).toISOString();
      const hoje = inicioDoDiaManaus(new Date()).toISOString();
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, dados_dinamicos, criado_em, hora_monitoramento")
        .in("ficha_template_id", ids)
        .eq("setor", setor as string)
        .eq("status_ficha", "FINALIZADO")
        .or(`and(hora_monitoramento.gte.${desde},hora_monitoramento.lt.${hoje}),and(hora_monitoramento.is.null,criado_em.gte.${desde},criado_em.lt.${hoje})`)
        .limit(50)
        .overrideTypes<(RegistroContinuavel & { hora_monitoramento: string | null })[], { merge: false }>();
      if (error) throw error;
      const maisRecente = (data ?? [])
        .map((m) => ({ id: m.id, dados_dinamicos: m.dados_dinamicos, criado_em: horaEfetiva(m) }))
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0];
      return maisRecente ?? null;
    },
  });
}

/** Turno fixo configurado para o usuário (Painel de Gestão → configuracoes_extras). Ausente ou
 * "Ambos" → o turno é deduzido pelo horário (ver turnoAlvoHeranca). */
export function useTurnoFixoDoUsuario(userId: string | undefined) {
  return useQuery({
    queryKey: ["perfis_usuarios", "turno-fixo", userId],
    meta: { offline: true },
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis_usuarios")
        .select("configuracoes_extras")
        .eq("id", userId as string)
        .maybeSingle()
        .overrideTypes<{ configuracoes_extras: string | null } | null, { merge: false }>();
      if (error) throw error;
      return parseConfigExtras(data?.configuracoes_extras ?? null).turnoFixo;
    },
  });
}

export function useCriarTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      codigo: string;
      nome: string;
      pacCorrespondente: string;
      schemaCampos: CampoTemplate[];
      criadoPor: string;
    }) => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .insert({
          codigo: input.codigo,
          nome: input.nome,
          pac_correspondente: input.pacCorrespondente,
          schema_campos: input.schemaCampos,
          criado_por: input.criadoPor,
        })
        .select("id")
        .single()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fichas_templates"] });
    },
  });
}

export interface FichaTemplateAdmin {
  id: string;
  codigo: string;
  nome: string;
  pac_correspondente: string;
  tipo_apontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno" | null;
  tempo_entre_apontamentos_min: number | null;
  tempo_edicao_min: number | null;
  locais_aplicacao: string[];
  versao: number;
  ativo: boolean;
  atualizado_em: string;
  schema_campos: CampoTemplate[];
}

const COLUNAS_FICHA_TEMPLATE_ADMIN =
  "id, codigo, nome, pac_correspondente, tipo_apontamento, frequencia, tempo_entre_apontamentos_min, " +
  "tempo_edicao_min, locais_aplicacao, versao, ativo, atualizado_em, schema_campos";

/** Fichas ativas com todos os campos usados pelo Construtor de Fichas (painel administrativo,
 * distinto de useTemplatesAtivos que só traz o essencial para o preenchimento). */
export function useFichasTemplatesAdmin() {
  return useQuery({
    queryKey: ["fichas_templates", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .select(COLUNAS_FICHA_TEMPLATE_ADMIN)
        .eq("ativo", true)
        .order("codigo")
        .order("versao", { ascending: false })
        .overrideTypes<FichaTemplateAdmin[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export interface SalvarFichaTemplateInput {
  /** Linha a inativar (edição de uma ficha existente); null para ficha nova ou duplicada. */
  idAnterior: string | null;
  /** Versão da linha anterior (0 para ficha nova/duplicada, para que a nova linha nasça v1). */
  versaoBase: number;
  codigo: string;
  nome: string;
  pacCorrespondente: string;
  tipoApontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno" | null;
  tempoEntreApontamentosMin: number | null;
  tempoEdicaoMin: number | null;
  locaisAplicacao: string[];
  schemaCampos: CampoTemplate[];
  criadoPor: string;
}

/** Salva uma ficha respeitando o versionamento não-destrutivo (seção 2 do Construtor de
 * Fichas): a linha anterior (se houver) é apenas inativada, nunca sobrescrita — a definição
 * usada por apontamentos já existentes permanece intacta e interpretável. */
export function useSalvarFichaTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarFichaTemplateInput) => {
      if (input.idAnterior) {
        const { error: erroInativar } = await supabase
          .from("fichas_templates")
          .update({ ativo: false })
          .eq("id", input.idAnterior);
        if (erroInativar) throw erroInativar;
      }

      const { data, error } = await supabase
        .from("fichas_templates")
        .insert({
          codigo: input.codigo,
          nome: input.nome,
          pac_correspondente: input.pacCorrespondente,
          tipo_apontamento: input.tipoApontamento,
          frequencia: input.frequencia,
          tempo_entre_apontamentos_min: input.tempoEntreApontamentosMin,
          tempo_edicao_min: input.tempoEdicaoMin,
          locais_aplicacao: input.locaisAplicacao,
          versao: input.versaoBase + 1,
          ativo: true,
          schema_campos: input.schemaCampos,
          criado_por: input.criadoPor,
          atualizado_em: new Date().toISOString(),
        })
        .select("id")
        .single()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fichas_templates"] });
    },
  });
}

/** Inativação (soft delete) de uma ficha — a linha permanece no banco para auditoria de
 * apontamentos que já a referenciam, só deixa de aparecer para os inspetores. */
export function useInativarFichaTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fichas_templates").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["fichas_templates"] });
    },
  });
}

interface CriarMonitoramentoInput {
  fichaTemplateId: string;
  versaoTemplate: number;
  userId: string;
  setor: string;
  dadosDinamicos: Record<string, unknown>;
  /** Pesagem inicial da absorção (2 fases): grava EM_ANDAMENTO e assina só como INSPETOR_PARCIAL. */
  statusFicha?: "EM_ANDAMENTO";
}

export type ResultadoCriarMonitoramento = { id: string; modo: "online" | "offline" };

/** Cria e assina a ficha (seção 7.5); se estiver sem rede (ou o próprio envio falhar por
 * falta de rede), enfileira em vez de falhar — ADR 0002/0014: o id é sempre gerado no
 * CLIENTE (nunca pelo default do banco), para que o mesmo id sirva tanto para o INSERT
 * imediato quanto para uma sincronização posterior a partir da fila offline. */
export function useCriarMonitoramento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarMonitoramentoInput): Promise<ResultadoCriarMonitoramento> => {
      const id = crypto.randomUUID();
      const capturadoEm = new Date().toISOString();

      if (!navigator.onLine) {
        await enfileirarFicha({
          id,
          fichaTemplateId: input.fichaTemplateId,
          versaoTemplate: input.versaoTemplate,
          userId: input.userId,
          setor: input.setor,
          dadosDinamicos: input.dadosDinamicos,
          statusFicha: input.statusFicha,
          capturadoEm,
        });
        return { id, modo: "offline" };
      }

      try {
        // Prazo curto via AbortSignal.timeout (mecanismo nativo do fetch, não um race manual
        // em cima da Promise) — uma conexão degradada não pode deixar o inspetor esperando
        // indefinidamente antes de cair na fila offline (ver PRAZO_ONLINE_MS).
        const { data: monitoramento, error } = await supabase
          .from("monitoramentos")
          .insert({
            id,
            ficha_template_id: input.fichaTemplateId,
            versao_template: input.versaoTemplate,
            user_id: input.userId,
            setor: input.setor,
            dados_dinamicos: input.dadosDinamicos,
            ...(input.statusFicha ? { status_ficha: input.statusFicha } : {}),
            capturado_em: capturadoEm,
          })
          .select("id")
          .abortSignal(AbortSignal.timeout(PRAZO_ONLINE_MS))
          .single()
          .overrideTypes<{ id: string }, { merge: false }>();
        if (error) throw error;

        // Assina imediatamente como INSPETOR (seção 7.5) — a Edge Function recalcula o hash
        // no servidor a partir do que acabou de ser persistido, nunca do payload do cliente.
        const { error: assinarError } = await supabase.functions.invoke("assinar-documento", {
          body: { monitoramento_id: monitoramento.id, tipo: input.statusFicha === "EM_ANDAMENTO" ? "INSPETOR_PARCIAL" : "INSPETOR" },
          timeout: PRAZO_ONLINE_MS,
        });
        if (assinarError) throw assinarError;

        return { id: monitoramento.id, modo: "online" };
      } catch (erro) {
        if (!estaOffline(erro)) throw erro;
        // Mesmo id da tentativa que acabou de falhar — se o INSERT já tinha sido bem-sucedido
        // e só a assinatura abortou, a sincronização posterior (mesmo id) encontra a linha já
        // existente (upsert com ignoreDuplicates) e só falta assinar, em vez de deixá-la órfã.
        await enfileirarFicha({
          id,
          fichaTemplateId: input.fichaTemplateId,
          versaoTemplate: input.versaoTemplate,
          userId: input.userId,
          setor: input.setor,
          dadosDinamicos: input.dadosDinamicos,
          statusFicha: input.statusFicha,
          capturadoEm,
        });
        return { id, modo: "offline" };
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
      void queryClient.invalidateQueries({ queryKey: ["fila-offline"] });
    },
  });
}

export function useVerificarMonitoramento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { monitoramentoId: string; decisao: "aprovar" }
        | {
            monitoramentoId: string;
            decisao: "reprovar";
            severidade: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
            descricao?: string;
          }
    ) => {
      const body =
        input.decisao === "aprovar"
          ? { monitoramento_id: input.monitoramentoId, decisao: "aprovar" as const }
          : {
              monitoramento_id: input.monitoramentoId,
              decisao: "reprovar" as const,
              severidade: input.severidade,
              descricao: input.descricao,
            };
      const { data, error } = await supabase.functions.invoke("verificar-monitoramento", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

// ---------------------------------------------------------------------------------------
// Painel de Verificação (fila de QA do VERIFICADOR/ADMIN_MASTER) — ver PainelVerificacao.tsx.
// ---------------------------------------------------------------------------------------

export interface TemplateResumo {
  id: string;
  codigo: string;
  nome: string;
  pac_correspondente: string;
  schema_campos: CampoTemplate[];
}

/** Todos os templates (ativos ou não) — uma verificação pode envolver monitoramentos criados
 * com uma ficha já desativada depois, então não dá pra filtrar por `ativo` aqui como
 * `useTemplatesAtivos` faz. Inclui schema_campos: é a fonte de rótulo/ordem/tipo dos campos
 * usada por DadosColetados (card da lista, modal "Ver" e relatório impresso) — sem isso, essas
 * telas caem no dump bruto de `Object.entries(dados_dinamicos)` (chave técnica ao invés de
 * rótulo, "[object Object]" nos widgets "Especial SIF"). */
export function useFichasTemplatesTodas() {
  return useQuery({
    queryKey: ["fichas_templates", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .select("id, codigo, nome, pac_correspondente, schema_campos")
        .overrideTypes<TemplateResumo[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Templates (inclusive inativos) pelos ids de registros que o inspetor tem em mãos. O inspetor só
 * lê templates ativos (RLS), mas um monitoramento em andamento continua com o template da versão em
 * que foi iniciado, mesmo que a ficha tenha ganhado versão nova depois. */
export function useTemplatesPorIds(ids: string[]) {
  const chave = Array.from(new Set(ids)).sort();
  return useQuery({
    queryKey: ["fichas_templates", "por-ids", chave],
    enabled: chave.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("templates_por_ids", { p_ids: chave });
      if (error) throw error;
      return (data as unknown as TemplateResumo[] | null) ?? [];
    },
  });
}

/** PAC(s) de um template: usa `pac_correspondente` (pode ser uma lista separada por vírgula);
 * se vazio, cai para o prefixo do nome antes do primeiro "-" (convenção usada nos códigos de
 * ficha mais antigos). */
export function pacsDoTemplate(template: Pick<TemplateResumo, "pac_correspondente" | "nome">): string[] {
  const bruto = template.pac_correspondente?.trim();
  if (bruto) {
    return bruto
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  const prefixo = template.nome.split("-")[0]?.trim();
  return prefixo ? [prefixo] : [];
}

interface UsuarioResumo {
  id: string;
  nome_completo: string;
}

/** Mapa id → nome completo de todos os perfis — usado para resolver o nome do inspetor nos
 * cards e no filtro avançado (sem embed FK — ver comentário em src/lib/supabase.ts). */
export function useUsuariosMap() {
  return useQuery({
    queryKey: ["perfis_usuarios", "mapa-nomes"],
    queryFn: async () => {
      // Via função do banco: Verificador/Gestor não leem perfis_usuarios e viam "Inspetor" no lugar do nome.
      const { data, error } = await supabase.rpc("nomes_usuarios");
      if (error) throw error;
      return new Map(((data ?? []) as UsuarioResumo[]).map((u) => [u.id, u.nome_completo]));
    },
  });
}

export interface FiltrosVerificacao {
  setor: string | null;
  pac: string | null;
}

const CAMPOS_MONITORAMENTO_VERIFICACAO =
  "id, ficha_template_id, user_id, setor, dados_dinamicos, conformidade, verificado_por, verificado_em, criado_em, capturado_em, aditivo_de";

/** Fila de verificação: pendências (verificado_por IS NULL — fila crônica, qualquer dia) +
 * verificados recentes (últimos 500, qualquer dia — a filtragem por dia local/intervalo
 * selecionado é feita no componente via `ensureLocalTime`, não aqui, porque o mesmo conjunto
 * também precisa ser varrido em busca de adendos pendentes, que não têm recorte de data). A
 * RLS já restringe por setor para VERIFICADOR (ADMIN_MASTER vê tudo); setor/PAC aqui são
 * filtros extras aplicados por cima. */
export function useFilaVerificacao(filtros: FiltrosVerificacao, templateIdsDoPac: string[] | null) {
  return useQuery({
    queryKey: ["monitoramentos", "fila-verificacao", filtros, templateIdsDoPac],
    queryFn: async () => {
      let pendentesQuery = supabase
        .from("monitoramentos")
        .select(CAMPOS_MONITORAMENTO_VERIFICACAO)
        .is("verificado_por", null)
        .neq("status_ficha", "EM_ANDAMENTO") // absorção só com pesagem inicial: ainda não vai à verificação
        .order("criado_em", { ascending: false })
        .limit(1000);
      if (filtros.setor) pendentesQuery = pendentesQuery.eq("setor", filtros.setor);
      if (templateIdsDoPac) pendentesQuery = pendentesQuery.in("ficha_template_id", templateIdsDoPac);

      let verificadosQuery = supabase
        .from("monitoramentos")
        .select(CAMPOS_MONITORAMENTO_VERIFICACAO)
        .not("verificado_por", "is", null)
        .order("verificado_em", { ascending: false })
        .limit(500);
      if (filtros.setor) verificadosQuery = verificadosQuery.eq("setor", filtros.setor);
      if (templateIdsDoPac) verificadosQuery = verificadosQuery.in("ficha_template_id", templateIdsDoPac);

      const [{ data: pendentes, error: erroPendentes }, { data: verificados, error: erroVerificados }] = await Promise.all([
        pendentesQuery.overrideTypes<MonitoramentoVerificacao[], { merge: false }>(),
        verificadosQuery.overrideTypes<MonitoramentoVerificacao[], { merge: false }>(),
      ]);
      if (erroPendentes) throw erroPendentes;
      if (erroVerificados) throw erroVerificados;

      return { pendentes: pendentes ?? [], verificados: verificados ?? [] };
    },
  });
}

interface ResultadoAssinaturaLote {
  id: string;
  ok: boolean;
  erro?: string;
}

/** Assinatura em lote: chama a Edge Function `verificar-monitoramento` (decisão "aprovar")
 * uma vez por documento selecionado — é a mesma function usada na verificação individual, só
 * que em sequência, reportando progresso. Erro num documento não interrompe os demais. */
export function useVerificarLote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[]; onProgress?: (atual: number, total: number) => void }) => {
      const resultados: ResultadoAssinaturaLote[] = [];
      for (const [indice, id] of input.ids.entries()) {
        try {
          const { error } = await supabase.functions.invoke("verificar-monitoramento", {
            body: { monitoramento_id: id, decisao: "aprovar" },
          });
          if (error) throw error;
          resultados.push({ id, ok: true });
        } catch (erro) {
          console.error(`useVerificarLote: falha ao assinar ${id}`, erro);
          resultados.push({ id, ok: false, erro: (await erroDeFuncao(erro)).message || "erro desconhecido" });
        }
        input.onProgress?.(indice + 1, input.ids.length);
      }
      return resultados;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

interface AdendoBruto {
  id: string;
  status: "pending_monitor" | "completed";
  notes: string;
  verificadorName: string;
  corrections: Record<string, { old: unknown; new: unknown; rotulo?: string }>;
  /** Inspetor dono do monitoramento: é quem vê e assina o adendo no Painel de Bordo. */
  monitorId?: string;
  criadoEm: string;
}

/** Verificador abre um adendo (pedido de correção) num monitoramento — nunca sobrescreve o
 * valor original direto, só registra a correção pedida em `dados_dinamicos.adendos[]` com
 * status "pending_monitor"; quem assina e aplica de fato é o próprio inspetor, no Painel de
 * Bordo (`useAssinarAdendo`, mesmo array). */
export function useAbrirAdendo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      monitoramentoId: string;
      campo: string;
      rotulo?: string;
      valorAntigo: unknown;
      valorNovo: unknown;
      notes: string;
      verificadorNome: string;
    }) => {
      const { data: original, error: erroOriginal } = await supabase
        .from("monitoramentos")
        .select("dados_dinamicos, user_id")
        .eq("id", input.monitoramentoId)
        .single()
        .overrideTypes<{ dados_dinamicos: Record<string, unknown>; user_id: string }, { merge: false }>();
      if (erroOriginal) throw erroOriginal;

      const dadosOriginais = original.dados_dinamicos as { adendos?: AdendoBruto[] } & Record<string, unknown>;
      const novoAdendo: AdendoBruto = {
        id: crypto.randomUUID(),
        status: "pending_monitor",
        monitorId: original.user_id,
        notes: input.notes,
        verificadorName: input.verificadorNome,
        corrections: { [input.campo]: { old: input.valorAntigo, new: input.valorNovo, rotulo: input.rotulo } },
        criadoEm: new Date().toISOString(),
      };
      const novosDados: Record<string, unknown> = {
        ...dadosOriginais,
        adendos: [...(dadosOriginais.adendos ?? []), novoAdendo],
      };

      const { error } = await supabase.from("monitoramentos").update({ dados_dinamicos: novosDados }).eq("id", input.monitoramentoId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

// ---------------------------------------------------------------------------------------
// Relatório imprimível (dossiê de verificação) — busca tudo que useFilaVerificacao não
// carrega hoje (schema_campos completo da ficha, nomes completos dos perfis envolvidos,
// assinaturas eletrônicas e RNC vinculada), para um ou mais monitoramento_id de uma vez
// (dossiê consolidado = vários ids do mesmo grupo).
// ---------------------------------------------------------------------------------------
export interface MonitoramentoRelatorio {
  id: string;
  ficha_template_id: string;
  versao_template: number;
  user_id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  conformidade: boolean | null;
  verificado_por: string | null;
  verificado_em: string | null;
  liberado_sif: boolean;
  origem_versao: string;
  aditivo_de: string | null;
  criado_em: string;
  capturado_em: string | null;
  /** EM_ANDAMENTO (só pesagem inicial) ou FINALIZADO. Início = criado_em; fim = finalizado_em (servidor). */
  status_ficha: "EM_ANDAMENTO" | "FINALIZADO";
  finalizado_em: string | null;
}

export interface AssinaturaRelatorio {
  id: string;
  monitoramento_id: string;
  user_id: string;
  tipo: "INSPETOR" | "INSPETOR_PARCIAL" | "VERIFICADOR" | "GESTOR" | "ADMIN" | "LIBERACAO_DIARIA";
  hash_documento: string;
  criado_em: string;
  tsa_emitido_em: string | null;
  tsa_utilizada: string | null;
}

export interface TemplateRelatorio {
  id: string;
  codigo: string;
  nome: string;
  pac_correspondente: string;
  schema_campos: CampoTemplate[];
}

export interface DadosRelatorio {
  monitoramentos: MonitoramentoRelatorio[];
  assinaturas: AssinaturaRelatorio[];
  rncs: Rnc[];
  /** Autocorreções imediatas (alternativa à RNC) dos monitoramentos do relatório. */
  autocorrecoes: AutocorrecaoImediata[];
  templatesPorId: Map<string, TemplateRelatorio>;
  nomesPorId: Map<string, string>;
}

const CAMPOS_MONITORAMENTO_RELATORIO =
  "id, ficha_template_id, versao_template, user_id, setor, dados_dinamicos, conformidade, verificado_por, " +
  "verificado_em, liberado_sif, origem_versao, aditivo_de, criado_em, capturado_em, status_ficha, finalizado_em";
const CAMPOS_ASSINATURA_RELATORIO = "id, monitoramento_id, user_id, tipo, hash_documento, criado_em, tsa_emitido_em, tsa_utilizada";
// "*": a RNC ganha colunas (ação imediata, causa, assinatura do gestor…) — um select explícito quebraria o
// relatório inteiro num banco que ainda não recebeu a migração mais recente.
const CAMPOS_RNC_RELATORIO = "*";

export function useDadosRelatorio(ids: string[]) {
  const idsKey = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["monitoramentos", "relatorio", idsKey],
    enabled: ids.length > 0,
    queryFn: async (): Promise<DadosRelatorio> => {
      const [
        { data: monitoramentos, error: erroMonitoramentos },
        { data: assinaturas, error: erroAssinaturas },
        { data: rncs, error: erroRncs },
        { data: autocorrecoes },
      ] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select(CAMPOS_MONITORAMENTO_RELATORIO)
          .in("id", ids)
          .overrideTypes<MonitoramentoRelatorio[], { merge: false }>(),
        supabase
          .from("assinaturas_eletronicas")
          .select(CAMPOS_ASSINATURA_RELATORIO)
          .in("monitoramento_id", ids)
          .order("criado_em", { ascending: true })
          .overrideTypes<AssinaturaRelatorio[], { merge: false }>(),
        supabase.from("rnc").select(CAMPOS_RNC_RELATORIO).in("monitoramento_id", ids).overrideTypes<Rnc[], { merge: false }>(),
        // Sem a tabela (migração ainda não aplicada) o erro é ignorado: só não há autocorreções a mostrar.
        supabase.from("autocorrecoes_imediatas").select(CAMPOS_AUTOCORRECAO).in("monitoramento_id", ids).overrideTypes<AutocorrecaoImediata[], { merge: false }>(),
      ]);
      if (erroMonitoramentos) throw erroMonitoramentos;
      if (erroAssinaturas) throw erroAssinaturas;
      if (erroRncs) throw erroRncs;

      const templateIds = [...new Set((monitoramentos ?? []).map((m) => m.ficha_template_id))];
      const userIds = [
        ...new Set(
          [
            ...(monitoramentos ?? []).flatMap((m) => [m.user_id, m.verificado_por]),
            ...(assinaturas ?? []).map((a) => a.user_id),
            ...(rncs ?? []).flatMap((r) => [r.tratado_por, r.revisado_por]),
            ...(autocorrecoes ?? []).map((c) => c.user_id),
          ].filter((id): id is string => Boolean(id))
        ),
      ];

      const [{ data: templates, error: erroTemplates }, { data: perfis, error: erroPerfis }] = await Promise.all([
        supabase
          .from("fichas_templates")
          .select("id, codigo, nome, pac_correspondente, schema_campos")
          .in("id", templateIds)
          .overrideTypes<TemplateRelatorio[], { merge: false }>(),
        // Função do banco: o Verificador não lê perfis_usuarios (RLS) e o selo saía "Usuário do Sistema".
        supabase.rpc("nomes_usuarios", { p_ids: userIds }),
      ]);
      if (erroTemplates) throw erroTemplates;
      if (erroPerfis) throw erroPerfis;

      return {
        monitoramentos: monitoramentos ?? [],
        assinaturas: assinaturas ?? [],
        rncs: rncs ?? [],
        autocorrecoes: autocorrecoes ?? [],
        templatesPorId: new Map((templates ?? []).map((t) => [t.id, t])),
        nomesPorId: new Map(((perfis ?? []) as { id: string; nome_completo: string }[]).map((p) => [p.id, p.nome_completo])),
      };
    },
  });
}

// ---------------------------------------------------------------------------------------
// Teste de Absorção de Água em duas fases: registros EM_ANDAMENTO (só pesagem inicial) do
// inspetor e a finalização (pesagem final + assinatura INSPETOR). Início = criado_em e fim =
// finalizado_em são horas do SERVIDOR.
// ---------------------------------------------------------------------------------------
export interface MonitoramentoEmAndamento {
  id: string;
  ficha_template_id: string;
  setor: string;
  user_id: string;
  dados_dinamicos: Record<string, unknown>;
  criado_em: string;
  hora_monitoramento?: string | null;
  status_ficha: "EM_ANDAMENTO";
}

const CAMPOS_EM_ANDAMENTO = "id, ficha_template_id, setor, user_id, dados_dinamicos, criado_em, hora_monitoramento, status_ficha";

/** Monitoramentos em andamento: as absorções abertas (só pesagem inicial) do PRÓPRIO inspetor e os
 * monitoramentos que aguardam o peso da balança (peso por caixa) de QUALQUER inspetor dos setores dele
 * — o turno pode ter mudado enquanto o peso não chegava. */
export function useMonitoramentosEmAndamento(userId: string | undefined, setores: string[] = []) {
  return useQuery({
    queryKey: ["monitoramentos", "em-andamento", userId, setores],
    meta: { offline: true },
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [proprios, doSetor] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select(CAMPOS_EM_ANDAMENTO)
          .eq("user_id", userId as string)
          .eq("status_ficha", "EM_ANDAMENTO")
          .order("criado_em", { ascending: true })
          .overrideTypes<MonitoramentoEmAndamento[], { merge: false }>(),
        setores.length === 0
          ? Promise.resolve({ data: [] as MonitoramentoEmAndamento[], error: null })
          : supabase
              .from("monitoramentos")
              .select(CAMPOS_EM_ANDAMENTO)
              .eq("status_ficha", "EM_ANDAMENTO")
              .in("setor", setores)
              .filter("dados_dinamicos->>aguardando_peso", "eq", "true")
              .order("criado_em", { ascending: true })
              .overrideTypes<MonitoramentoEmAndamento[], { merge: false }>(),
      ]);
      if (proprios.error) throw proprios.error;
      if (doSetor.error) throw doSetor.error;
      const porId = new Map<string, MonitoramentoEmAndamento>();
      for (const m of [...(proprios.data ?? []), ...(doSetor.data ?? [])]) porId.set(m.id, m);
      return Array.from(porId.values()).sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
    },
  });
}

/** O monitoramento aguarda o peso da balança (etapa 1 do peso por caixa)? */
export function aguardaPesoDaBalanca(m: Pick<MonitoramentoEmAndamento, "dados_dinamicos">): boolean {
  return m.dados_dinamicos.aguardando_peso === true;
}

/** Um registro em andamento (para reabrir na pesagem final). `null` se não existir, já foi
 * finalizado ou a RLS não deixa ver. */
export function useMonitoramentoEmAndamento(id: string | undefined) {
  return useQuery({
    queryKey: ["monitoramentos", "em-andamento-um", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select(CAMPOS_EM_ANDAMENTO)
        .eq("id", id as string)
        .eq("status_ficha", "EM_ANDAMENTO")
        .maybeSingle()
        .overrideTypes<MonitoramentoEmAndamento | null, { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

/** Peso por caixa aguardando o peso: grava os pesos que a balança já passou SEM finalizar (o registro continua
 * em andamento). O banco só aceita mudar o peso médio das cargas e a avaliação; o resto da etapa 1 é imutável. */
export function useSalvarPesosParciais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; dadosDinamicos: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .update({ dados_dinamicos: input.dadosDinamicos })
        .eq("id", input.id)
        .eq("status_ficha", "EM_ANDAMENTO")
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Não foi possível salvar: o registro já foi finalizado ou você não tem acesso a ele.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

/** Finaliza a absorção: grava a pesagem final (o banco valida que lacres/pesos iniciais não
 * mudaram, que toda linha tem peso final ou descarte com motivo, e carimba `finalizado_em` no
 * servidor) e, só então, assina como INSPETOR (hash recalculado no servidor sobre o conjunto
 * completo). Não é uma "edição": não marca justificativa nem depende de tempo_edicao_min. A senha
 * já deve ter sido reconferida por quem chama. */
export function useFinalizarAbsorcao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; dadosDinamicos: Record<string, unknown>; jaFinalizado?: boolean; aoGravar?: () => void }) => {
      if (!input.jaFinalizado) {
        const { data, error } = await supabase
          .from("monitoramentos")
          .update({ dados_dinamicos: input.dadosDinamicos, status_ficha: "FINALIZADO" })
          .eq("id", input.id)
          .eq("status_ficha", "EM_ANDAMENTO")
          .select("id");
        if (error) throw error;
        // A RLS filtra sem erro: 0 linhas = já finalizado, ou não é o inspetor que abriu.
        if (!data || data.length === 0) throw new Error("Não foi possível finalizar: o registro já foi finalizado ou você não é quem o abriu.");
        input.aoGravar?.(); // pesagem final gravada; se a assinatura falhar, dá para só re-assinar
      }
      const { error: erroAssinar } = await supabase.functions.invoke("assinar-documento", {
        body: { monitoramento_id: input.id, tipo: "INSPETOR" },
      });
      if (erroAssinar) throw erroAssinar;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}
