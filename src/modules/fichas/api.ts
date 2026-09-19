import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CampoTemplate } from "@/shared/schema-campos";
import { PRAZO_ONLINE_MS, enfileirarFicha, estaOffline } from "@/lib/offlineQueue";
import type { MonitoramentoVerificacao } from "./utils/recordGrouping";

interface TemplateAtivo {
  id: string;
  codigo: string;
  versao: number;
  nome: string;
  pac_correspondente: string;
  schema_campos: CampoTemplate[];
}

export function useTemplatesAtivos() {
  return useQuery({
    queryKey: ["fichas_templates", "ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .select("id, codigo, versao, nome, pac_correspondente, schema_campos")
        .eq("ativo", true)
        .order("nome")
        .overrideTypes<TemplateAtivo[], { merge: false }>();
      if (error) throw error;
      return data;
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
          body: { monitoramento_id: monitoramento.id, tipo: "INSPETOR" },
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
}

/** Todos os templates (ativos ou não) — uma verificação pode envolver monitoramentos criados
 * com uma ficha já desativada depois, então não dá pra filtrar por `ativo` aqui como
 * `useTemplatesAtivos` faz. */
export function useFichasTemplatesTodas() {
  return useQuery({
    queryKey: ["fichas_templates", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fichas_templates")
        .select("id, codigo, nome, pac_correspondente")
        .overrideTypes<TemplateResumo[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
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
      const { data, error } = await supabase
        .from("perfis_usuarios")
        .select("id, nome_completo")
        .overrideTypes<UsuarioResumo[], { merge: false }>();
      if (error) throw error;
      return new Map((data ?? []).map((u) => [u.id, u.nome_completo]));
    },
  });
}

export interface FiltrosVerificacao {
  setor: string | null;
  pac: string | null;
}

const CAMPOS_MONITORAMENTO_VERIFICACAO =
  "id, ficha_template_id, user_id, setor, dados_dinamicos, conformidade, verificado_por, verificado_em, criado_em, capturado_em";

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
          resultados.push({ id, ok: false, erro: erro instanceof Error ? erro.message : "erro desconhecido" });
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
  corrections: Record<string, { old: unknown; new: unknown }>;
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
      valorAntigo: unknown;
      valorNovo: unknown;
      notes: string;
      verificadorNome: string;
    }) => {
      const { data: original, error: erroOriginal } = await supabase
        .from("monitoramentos")
        .select("dados_dinamicos")
        .eq("id", input.monitoramentoId)
        .single()
        .overrideTypes<{ dados_dinamicos: Record<string, unknown> }, { merge: false }>();
      if (erroOriginal) throw erroOriginal;

      const dadosOriginais = original.dados_dinamicos as { adendos?: AdendoBruto[] } & Record<string, unknown>;
      const novoAdendo: AdendoBruto = {
        id: crypto.randomUUID(),
        status: "pending_monitor",
        notes: input.notes,
        verificadorName: input.verificadorNome,
        corrections: { [input.campo]: { old: input.valorAntigo, new: input.valorNovo } },
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
