import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type StatusRnc = "ABERTA" | "EM_TRATATIVA" | "TRATADA" | "REABERTA" | "DEVOLVIDA" | "FECHADA";
export type SeveridadeRnc = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export interface Rnc {
  id: string;
  monitoramento_id: string | null;
  descricao: string;
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

/** RNCs ainda não fechadas — o que o gestor de setor precisa tratar (RLS já restringe ao
 * próprio setor; para ADMIN_MASTER, todas). */
export function useRncsAbertas() {
  return useQuery({
    queryKey: ["rnc", "abertas"],
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
export function useAbrirRnc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      monitoramentoId: string | null;
      descricao: string;
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
    mutationFn: async (input: { id: string; tratativa: string; userId: string }) => {
      const { error } = await supabase
        .from("rnc")
        .update({ tratativa: input.tratativa, status: "TRATADA", tratado_por: input.userId })
        .eq("id", input.id);
      if (error) throw error;
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
