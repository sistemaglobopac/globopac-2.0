import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CampoTemplate } from "@/shared/schema-campos";

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

export function useCriarMonitoramento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fichaTemplateId: string;
      versaoTemplate: number;
      userId: string;
      setor: string;
      dadosDinamicos: Record<string, unknown>;
    }) => {
      const { data: monitoramento, error } = await supabase
        .from("monitoramentos")
        .insert({
          ficha_template_id: input.fichaTemplateId,
          versao_template: input.versaoTemplate,
          user_id: input.userId,
          setor: input.setor,
          dados_dinamicos: input.dadosDinamicos,
        })
        .select("id")
        .single()
        .overrideTypes<{ id: string }, { merge: false }>();
      if (error) throw error;

      // Assina imediatamente como INSPETOR (seção 7.5) — a Edge Function recalcula o hash
      // no servidor a partir do que acabou de ser persistido, nunca do payload do cliente.
      const { error: assinarError } = await supabase.functions.invoke("assinar-documento", {
        body: { monitoramento_id: monitoramento.id, tipo: "INSPETOR" },
      });
      if (assinarError) throw assinarError;

      return monitoramento;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoramentos"] });
    },
  });
}

export interface MonitoramentoPendente {
  id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  criado_em: string;
  ficha_template_id: string;
  nomeTemplate: string;
}

interface MonitoramentoPendenteBruto {
  id: string;
  setor: string;
  dados_dinamicos: Record<string, unknown>;
  criado_em: string;
  ficha_template_id: string;
}

interface TemplateNome {
  id: string;
  nome: string;
}

// Sem embed (`fichas_templates(nome)`): a versão do postgrest-js instalada faz inferência de
// tipo estrita o bastante para que valha mais a pena duas queries simples, cada uma com seu
// tipo fixado via overrideTypes, do que arriscar a sintaxe de embed sem tipos gerados de
// verdade (ver comentário em src/lib/supabase.ts).
export function useMonitoramentosPendentesVerificacao() {
  return useQuery({
    queryKey: ["monitoramentos", "pendentes-verificacao"],
    queryFn: async (): Promise<MonitoramentoPendente[]> => {
      const [{ data: monitoramentos, error: erroMonitoramentos }, { data: templates, error: erroTemplates }] =
        await Promise.all([
          supabase
            .from("monitoramentos")
            .select("id, setor, dados_dinamicos, criado_em, ficha_template_id")
            .is("verificado_por", null)
            .order("criado_em", { ascending: true })
            .overrideTypes<MonitoramentoPendenteBruto[], { merge: false }>(),
          supabase.from("fichas_templates").select("id, nome").overrideTypes<TemplateNome[], { merge: false }>(),
        ]);

      if (erroMonitoramentos) throw erroMonitoramentos;
      if (erroTemplates) throw erroTemplates;

      const nomePorTemplateId = new Map((templates ?? []).map((t) => [t.id, t.nome]));

      return (monitoramentos ?? []).map((m) => ({
        ...m,
        nomeTemplate: nomePorTemplateId.get(m.ficha_template_id) ?? "Ficha",
      }));
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
