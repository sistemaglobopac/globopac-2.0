// Tipos escritos à mão para a Fase 1, cobrindo só as tabelas usadas pelo frontend até aqui.
// Regenerar com `supabase gen types typescript --local > src/lib/database.types.ts` assim
// que houver stack local rodando (Docker) — este arquivo deve ser descartado em favor do
// gerado automaticamente, não mantido manualmente a longo prazo.
//
// Nota: cada tabela precisa do campo Relationships (mesmo vazio) e o schema precisa de
// Views/Functions/Enums/CompositeTypes (mesmo vazios) — são exigidos pela forma genérica
// GenericSchema do postgrest-js para a inferência de tipos do client funcionar; sem eles,
// toda query resolve silenciosamente para `never`.

import type { CampoTemplate } from "@/shared/schema-campos";

export type { CampoTemplate };

export type NivelAcesso =
  | "INSPETOR_QUALIDADE"
  | "VERIFICADOR"
  | "GESTOR_SETOR"
  | "ADMIN_MASTER"
  | "INSPECAO_FEDERAL"
  | "INSPETOR_PCM";

interface PerfilUsuarioRow {
  id: string;
  nome_completo: string;
  nome_usuario: string;
  matricula: string;
  nivel_acesso: NivelAcesso;
  setores_permitidos: string[];
  ativo: boolean;
  desligado_em: string | null;
  criado_em: string;
  // Painel de Gestão (20260926000001_painel_gestao.sql): e-mail real para alertas de
  // Melhoria Contínua/CAPA e um JSON serializado (texto, não jsonb) com campos sem coluna
  // própria — setor do dia do inspetor e cobertura temporária de almoço.
  email_alerta: string | null;
  configuracoes_extras: string | null;
}

interface FichaTemplateRow {
  id: string;
  codigo: string;
  versao: number;
  nome: string;
  pac_correspondente: string;
  schema_campos: CampoTemplate[];
  criterios_classificacao: string[] | null;
  ativo: boolean;
  criado_por: string | null;
  criado_em: string;
  // Metadados do Construtor de Fichas (painel administrativo) — ver migração
  // 20260924000001_construtor_fichas_metadados.sql.
  tipo_apontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno" | null;
  tempo_entre_apontamentos_min: number | null;
  tempo_edicao_min: number | null;
  locais_aplicacao: string[];
  atualizado_em: string;
}

interface MonitoramentoRow {
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
  liberado_em: string | null;
  lote_liberacao_id: string | null;
  origem_versao: "v2" | "v1_legado";
  aditivo_de: string | null;
  criado_em: string;
  capturado_em: string | null;
}

interface RncRow {
  id: string;
  monitoramento_id: string | null;
  descricao: string;
  setor: string;
  status: "ABERTA" | "EM_TRATATIVA" | "TRATADA" | "REABERTA" | "DEVOLVIDA" | "FECHADA";
  severidade: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
  aberto_por: string;
  tratado_por: string | null;
  tratativa: string | null;
  prazo_sla: string;
  rnc_anterior_id: string | null;
  // Fase 11 (20260927000001_rnc_revisor_verificador.sql): revisão do VERIFICADOR.
  revisado_por: string | null;
  motivo_devolucao: string | null;
  fechado_em: string | null;
  criado_em: string;
}

interface AssinaturaEletronicaRow {
  id: string;
  monitoramento_id: string;
  user_id: string;
  tipo: "INSPETOR" | "VERIFICADOR" | "GESTOR" | "ADMIN" | "LIBERACAO_DIARIA";
  hash_documento: string;
  algoritmo: string;
  tsr_base64: string | null;
  tsa_emitido_em: string | null;
  tsa_utilizada: string | null;
  criado_em: string;
}

interface AppConfigRow {
  chave: string;
  valor: unknown;
  atualizado_em: string;
}

interface TurnoInspetorRow {
  id: string;
  user_id: string;
  setor: string | null;
  inicio: string;
  fim: string | null;
  criado_em: string;
}

interface PausaInspetorRow {
  id: string;
  user_id: string;
  tipo_pausa: "CURTA_20M" | "ALMOCO_72M" | "JANTAR_72M";
  status: "EM_ANDAMENTO" | "CONCLUIDA";
  hora_inicio: string;
  hora_fim: string | null;
  criado_em: string;
}

interface ParadaProcessoRow {
  id: string;
  inspetor_id: string;
  setor: string;
  equipamento: string | null;
  motivo: string;
  detalhes: string | null;
  hora_inicio: string;
  hora_fim: string | null;
  criado_em: string;
}

export interface Database {
  public: {
    Tables: {
      perfis_usuarios: {
        Row: PerfilUsuarioRow;
        Insert: Partial<PerfilUsuarioRow> &
          Pick<PerfilUsuarioRow, "id" | "nome_completo" | "nome_usuario" | "matricula" | "nivel_acesso">;
        Update: Partial<PerfilUsuarioRow>;
        Relationships: [];
      };
      fichas_templates: {
        Row: FichaTemplateRow;
        Insert: Partial<FichaTemplateRow> &
          Pick<FichaTemplateRow, "codigo" | "nome" | "pac_correspondente" | "schema_campos">;
        Update: Partial<FichaTemplateRow>;
        Relationships: [];
      };
      monitoramentos: {
        Row: MonitoramentoRow;
        Insert: Partial<MonitoramentoRow> &
          Pick<
            MonitoramentoRow,
            "ficha_template_id" | "versao_template" | "user_id" | "setor" | "dados_dinamicos"
          >;
        Update: Partial<MonitoramentoRow>;
        Relationships: [];
      };
      rnc: {
        Row: RncRow;
        Insert: Partial<RncRow> &
          Pick<RncRow, "descricao" | "setor" | "severidade" | "aberto_por" | "prazo_sla">;
        Update: Partial<RncRow>;
        Relationships: [];
      };
      assinaturas_eletronicas: {
        Row: AssinaturaEletronicaRow;
        // Escrita só via Edge Function com service_role — nunca do cliente. Ainda assim
        // tipado como Partial<Row> (não `never`) para não quebrar a inferência genérica do
        // postgrest-js; nenhum código do frontend chama .insert()/.update() nesta tabela.
        Insert: Partial<AssinaturaEletronicaRow>;
        Update: Partial<AssinaturaEletronicaRow>;
        Relationships: [];
      };
      app_config: {
        Row: AppConfigRow;
        Insert: Partial<AppConfigRow> & Pick<AppConfigRow, "chave" | "valor">;
        Update: Partial<AppConfigRow>;
        Relationships: [];
      };
      turnos_inspetores: {
        Row: TurnoInspetorRow;
        Insert: Partial<TurnoInspetorRow> & Pick<TurnoInspetorRow, "user_id" | "inicio">;
        Update: Partial<TurnoInspetorRow>;
        Relationships: [];
      };
      pausas_inspetores: {
        Row: PausaInspetorRow;
        Insert: Partial<PausaInspetorRow> & Pick<PausaInspetorRow, "user_id" | "tipo_pausa">;
        Update: Partial<PausaInspetorRow>;
        Relationships: [];
      };
      paradas_processo: {
        Row: ParadaProcessoRow;
        Insert: Partial<ParadaProcessoRow> &
          Pick<ParadaProcessoRow, "inspetor_id" | "setor" | "motivo" | "hora_inicio">;
        Update: Partial<ParadaProcessoRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      email_por_matricula: {
        Args: { p_matricula: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
