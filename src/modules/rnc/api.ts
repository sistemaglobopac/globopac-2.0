import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type StatusRnc = "ABERTA" | "EM_TRATATIVA" | "TRATADA" | "REABERTA" | "DEVOLVIDA" | "FECHADA";
export type SeveridadeRnc = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface Rnc {
  id: string;
  monitoramento_id: string | null;
  descricao: string;
  /** Ação imediata informada pelo inspetor ao abrir a RNC (null em RNCs antigas/abertas pelo Verificador). */
  acao_imediata: string | null;
  /** Causa do desvio, informada pelo Gestor de Setor ao responder (a ação corretiva fica em `tratativa`). */
  causa_desvio: string | null;
  /** Assinatura eletrônica do Gestor de Setor na resposta — gravada pelo BANCO (hash e hora do servidor). */
  assinatura_gestor_por: string | null;
  assinatura_gestor_em: string | null;
  assinatura_gestor_hash: string | null;
  setor: string;
  status: StatusRnc;
  severidade: SeveridadeRnc;
  aberto_por: string;
  tratado_por: string | null;
  tratativa: string | null;
  prazo_sla: string;
  rnc_anterior_id: string | null;
  /** VERIFICADOR/ADMIN_MASTER que aprovou o fechamento ou devolveu a tratativa — nunca a
   * mesma pessoa que tratou (ver trg_segregacao_funcoes_rnc). */
  revisado_por: string | null;
  /** Preenchido pelo revisor ao devolver a RNC (status = DEVOLVIDA) para nova tratativa. */
  motivo_devolucao: string | null;
  fechado_em: string | null;
  criado_em: string;
}

export function estaAtrasada(rnc: Rnc) {
  return rnc.status !== "FECHADA" && new Date(rnc.prazo_sla).getTime() < Date.now();
}

/** RNCs ainda não fechadas — o que o gestor de setor precisa tratar (RLS já restringe ao
 * próprio setor; para ADMIN_MASTER, todas). */
export function useRncsAbertas(opcoes?: { habilitado?: boolean }) {
  return useQuery({
    queryKey: ["rnc", "abertas"],
    enabled: opcoes?.habilitado ?? true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rnc")
        .select("*")
        .neq("status", "FECHADA")
        .order("prazo_sla", { ascending: true })
        .overrideTypes<Rnc[], { merge: false }>();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

/** Últimas fechadas — só para permitir reabertura (ADMIN_MASTER) quando a tratativa se
 * mostrar insuficiente (seção 7.2, "Novo"). */
export function useRncsFechadasRecentes() {
  return useQuery({
    queryKey: ["rnc", "fechadas-recentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rnc")
        .select("*")
        .eq("status", "FECHADA")
        .order("fechado_em", { ascending: false })
        .limit(20)
        .overrideTypes<Rnc[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

/** Abertura de RNC pelo próprio autor do desvio (Painel de Bordo, seção 7/10) — mesma regra de
 * SLA por severidade usada em useReabrirRnc. `monitoramentoId` é opcional: a matriz de
 * permissões já previa INSPETOR_QUALIDADE abrindo RNC "em campo", vinculada a um monitoramento
 * ou avulsa. */
/** Abre a tela de RNC já vinculada ao monitoramento (usada pelo Painel de Verificação); ao terminar volta para `voltar`. */
export function urlAbrirRnc(monitoramentoId: string, voltar = "/verificacao"): string {
  return `/nova-rnc?vinculo=${monitoramentoId}&voltar=${encodeURIComponent(voltar)}`;
}

export function useAbrirRnc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      monitoramentoId: string | null;
      descricao: string;
      /** Obrigatória para o inspetor (contenção na hora); o Verificador/Administrador pode abrir sem ela. */
      acaoImediata: string | null;
      setor: string;
      severidade: SeveridadeRnc;
      abertoPor: string;
    }) => {
      const { data: config, error: erroConfig } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "sla_rnc_horas_por_severidade")
        .single()
        .overrideTypes<{ valor: Record<string, number> }, { merge: false }>();
      if (erroConfig) throw erroConfig;
      const horas = config.valor[input.severidade] ?? 168;
      const prazoSla = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from("rnc")
        .insert({
          monitoramento_id: input.monitoramentoId,
          descricao: input.descricao,
          acao_imediata: input.acaoImediata,
          setor: input.setor,
          severidade: input.severidade,
          aberto_por: input.abertoPor,
          prazo_sla: prazoSla,
        })
        .select("id")
        .single()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rnc"] }),
  });
}

/** Registra a tratativa (ABERTA/REABERTA/DEVOLVIDA → TRATADA), feita pelo Gestor de Setor.
 * Ação e revisão são passos separados e por atores diferentes — reflete o fluxo E2E nº 3
 * ("Gestor de Setor trata → Verificador revisa"), segregação de funções reforçada por
 * trg_segregacao_funcoes_rnc (tratado_por nunca pode ser igual a revisado_por). */
export function useTratarRnc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; causa: string; tratativa: string; userId: string }) => {
      const { data, error } = await supabase
        .from("rnc")
        // revisado_por volta a null: a nova resposta ainda não foi julgada (a policy de UPDATE do
        // gestor exige isso — sem, responder uma RNC devolvida pelo Verificador era barrado).
        .update({ causa_desvio: input.causa, tratativa: input.tratativa, status: "TRATADA", tratado_por: input.userId, revisado_por: null })
        .eq("id", input.id)
        .select("id");
      if (error) throw error;
      // A RLS filtra sem erro: 0 linhas = a RNC não é de um setor seu (ou já foi fechada).
      if (!data || data.length === 0) {
        throw new Error("Não foi possível responder: esta RNC não pertence a um setor sob sua responsabilidade (ou já foi fechada).");
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rnc"] }),
  });
}

/** Revisão da tratativa (TRATADA → FECHADA ou DEVOLVIDA), feita pelo VERIFICADOR/ADMIN_MASTER
 * — nunca pelo mesmo usuário que tratou (rnc_update_revisar + trg_segregacao_funcoes_rnc
 * bloqueiam isso no banco, não só na UI). Espelha o Verificador da Qualidade da v1
 * (VerificadorReview.jsx), que aprovava ou devolvia a tratativa do Gestor de Setor antes de a
 * RNC ser considerada concluída. */
export function useRevisarRnc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { id: string; decisao: "aprovar"; userId: string }
        | { id: string; decisao: "devolver"; userId: string; motivo: string }
    ) => {
      const payload =
        input.decisao === "aprovar"
          ? { status: "FECHADA" as const, revisado_por: input.userId, fechado_em: new Date().toISOString() }
          : { status: "DEVOLVIDA" as const, revisado_por: input.userId, motivo_devolucao: input.motivo };
      const { error } = await supabase.from("rnc").update(payload).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rnc"] }),
  });
}

/** A ficha de monitoramento de origem da RNC já foi verificada? Se sim, a RNC NÃO pode ser reaberta
 * (o banco também recusa: trg_rnc_bloqueia_reabertura_verificada). `undefined` enquanto carrega ou
 * quando a RNC não tem monitoramento de origem. */
export function useMonitoramentoVerificado(monitoramentoId: string | null | undefined) {
  return useQuery({
    queryKey: ["monitoramentos", "verificado", monitoramentoId],
    enabled: !!monitoramentoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("verificado_por")
        .eq("id", monitoramentoId as string)
        .maybeSingle()
        .overrideTypes<{ verificado_por: string | null } | null, { merge: false }>();
      if (error) throw error;
      return data ? data.verificado_por !== null : undefined;
    },
  });
}

/** Reabertura (seção 7.2, "Novo") de uma RNC já FECHADA: cria uma NOVA linha referenciando a
 * anterior — nunca sobrescreve a tratativa original. Continua restrita a ADMIN_MASTER: é uma
 * ação distinta e mais sensível do que a revisão de rotina (TRATADA → FECHADA/DEVOLVIDA, essa
 * sim delegada ao VERIFICADOR via useRevisarRnc) — reabrir um caso já encerrado é exceção, não
 * parte do fluxo normal. */
export function useReabrirRnc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rncAnterior: Rnc; userId: string; novaDescricao: string }) => {
      const { data: config, error: erroConfig } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", "sla_rnc_horas_por_severidade")
        .single()
        .overrideTypes<{ valor: Record<string, number> }, { merge: false }>();
      if (erroConfig) throw erroConfig;
      const horas = config.valor[input.rncAnterior.severidade] ?? 168;
      const prazoSla = new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from("rnc").insert({
        monitoramento_id: input.rncAnterior.monitoramento_id,
        descricao: input.novaDescricao,
        setor: input.rncAnterior.setor,
        severidade: input.rncAnterior.severidade,
        aberto_por: input.userId,
        prazo_sla: prazoSla,
        rnc_anterior_id: input.rncAnterior.id,
        status: "REABERTA",
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rnc"] }),
  });
}

// ------------------------------------------------------------------------------------------
// Anexos da RNC (foto da não conformidade na abertura; fotos/documentos da tratativa)
// ------------------------------------------------------------------------------------------

export type EtapaAnexoRnc = "ABERTURA" | "TRATATIVA";

export interface AnexoRnc {
  id: string;
  rnc_id: string;
  etapa: EtapaAnexoRnc;
  nome: string;
  caminho: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  enviado_por: string;
  criado_em: string;
}

const BUCKET_ANEXOS_RNC = "rnc-anexos";
export const TAMANHO_MAXIMO_ANEXO_BYTES = 10 * 1024 * 1024;
export const ACEITA_ANEXOS_RNC = "image/*,.pdf,.doc,.docx,.xls,.xlsx";

/** Nome seguro para o caminho no storage (sem acentos/espaços/caracteres especiais). */
export function nomeSeguroArquivo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}

/** Envia os arquivos para o storage privado e registra cada um em rnc_anexos. Devolve quantos
 * falharam (a RNC em si já foi gravada — o anexo não pode derrubar a abertura/tratativa). */
export async function enviarAnexosRnc(rncId: string, etapa: EtapaAnexoRnc, arquivos: File[], userId: string): Promise<number> {
  let falhas = 0;
  for (const arquivo of arquivos) {
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
      falhas += 1;
      continue;
    }
    const caminho = `rnc/${rncId}/${crypto.randomUUID()}-${nomeSeguroArquivo(arquivo.name)}`;
    const { error: erroUpload } = await supabase.storage.from(BUCKET_ANEXOS_RNC).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
    if (erroUpload) {
      falhas += 1;
      continue;
    }
    const { error: erroRegistro } = await supabase.from("rnc_anexos").insert({
      rnc_id: rncId,
      etapa,
      nome: arquivo.name,
      caminho,
      tipo_mime: arquivo.type || null,
      tamanho_bytes: arquivo.size,
      enviado_por: userId,
    });
    if (erroRegistro) falhas += 1;
  }
  return falhas;
}

export function useAnexosRnc(rncId: string | undefined) {
  return useQuery({
    queryKey: ["rnc", "anexos", rncId],
    enabled: !!rncId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rnc_anexos")
        .select("*")
        .eq("rnc_id", rncId as string)
        .order("criado_em", { ascending: true })
        .overrideTypes<AnexoRnc[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

/** URL temporária (5 min) para abrir/baixar um anexo do bucket privado. */
export async function urlAnexoRnc(caminho: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_ANEXOS_RNC).createSignedUrl(caminho, 300);
  if (error || !data) throw error ?? new Error("Não foi possível abrir o anexo.");
  return data.signedUrl;
}

/** Status das RNCs vinculadas a um conjunto de monitoramentos (qualquer status, inclusive
 * FECHADA) — usado para mostrar "TRATADO" nos cards e no relatório. */
export function useRncsDosMonitoramentos(monitoramentoIds: string[]) {
  const chave = [...monitoramentoIds].sort().join(",");
  return useQuery({
    queryKey: ["rnc", "por-monitoramento", chave],
    enabled: monitoramentoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rnc")
        .select("id, monitoramento_id, status")
        .in("monitoramento_id", monitoramentoIds)
        .overrideTypes<{ id: string; monitoramento_id: string | null; status: StatusRnc }[], { merge: false }>();
      if (error) throw error;
      return new Map((data ?? []).filter((r) => r.monitoramento_id).map((r) => [r.monitoramento_id as string, r.status]));
    },
  });
}
