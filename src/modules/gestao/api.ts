import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { inicioDoDiaManaus } from "@/modules/bordo/api";
import type { NivelAcesso } from "@/lib/database.types";
import { type Rnc } from "@/modules/rnc/api";

// ---------------------------------------------------------------------------------------
// Perfil / nível de acesso — rótulos e classes do badge (seção "Aba admin" do Painel de
// Gestão), nas mesmas cores do design system GloboPac (navy/lima) usado no resto do app.
// Secondary (cinza) padrão para Monitor de Qualidade porque é o perfil mais numeroso —
// reservar cor de destaque só pros perfis administrativos/especiais.
// ---------------------------------------------------------------------------------------
export const NIVEL_ACESSO_ROTULO: Record<NivelAcesso, string> = {
  INSPETOR_QUALIDADE: "Monitor de Qualidade",
  INSPETOR_PCM: "Manutenção PCM",
  VERIFICADOR: "Verificador",
  GESTOR_SETOR: "Encarregado de Setor",
  ADMIN_MASTER: "Administrador",
  INSPECAO_FEDERAL: "Auditoria Oficial SIF",
};

export const NIVEL_ACESSO_BADGE: Record<NivelAcesso, { className: string }> = {
  ADMIN_MASTER: { className: "bg-primary text-primary-foreground" },
  VERIFICADOR: { className: "bg-primary-soft text-primary" },
  GESTOR_SETOR: { className: "bg-lime text-primary" },
  INSPECAO_FEDERAL: { className: "bg-surface-dark text-lime" },
  INSPETOR_PCM: { className: "bg-primary-active text-primary-foreground" },
  INSPETOR_QUALIDADE: { className: "bg-secondary text-secondary-foreground" },
};

// ---------------------------------------------------------------------------------------
// Usuários (aba "admin") — perfis_usuarios completo, com os dois campos novos do Painel de
// Gestão (ver migração 20260926000001_painel_gestao.sql).
// ---------------------------------------------------------------------------------------
export interface PerfilGestao {
  id: string;
  nome_completo: string;
  nome_usuario: string;
  matricula: string;
  nivel_acesso: NivelAcesso;
  setores_permitidos: string[];
  ativo: boolean;
  email_alerta: string | null;
  configuracoes_extras: string | null;
  criado_em: string;
}

export interface CoberturaTemporaria {
  setor: string;
  inicio: string;
  fim: string;
}

export interface ConfiguracoesExtrasPerfil {
  setorDia?: string;
  turnoFixo?: "Turno 1" | "Turno 2" | "Ambos";
  coberturaTemporaria?: CoberturaTemporaria | null;
}

/** configuracoes_extras é texto (não jsonb) — ver comentário da coluna na migração: campos
 * sem coluna própria mesclados aqui em vez de crescer o schema a cada novo campo do Painel de
 * Gestão. Parse tolerante: valor ausente ou corrompido nunca deve quebrar a tela. */
export function parseConfigExtras(bruto: string | null): ConfiguracoesExtrasPerfil {
  if (!bruto) return {};
  try {
    return JSON.parse(bruto) as ConfiguracoesExtrasPerfil;
  } catch {
    return {};
  }
}

const COLUNAS_PERFIL_GESTAO =
  "id, nome_completo, nome_usuario, matricula, nivel_acesso, setores_permitidos, ativo, email_alerta, configuracoes_extras, criado_em";

export function usePerfisGestao() {
  return useQuery({
    queryKey: ["perfis_usuarios", "gestao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis_usuarios")
        .select(COLUNAS_PERFIL_GESTAO)
        .order("nome_completo")
        .overrideTypes<PerfilGestao[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CriarUsuarioInput {
  nomeCompleto: string;
  nomeUsuario: string;
  matricula: string;
  senha: string;
  nivelAcesso: NivelAcesso;
  setoresPermitidos: string[];
  emailAlerta: string | null;
  configuracoesExtras: ConfiguracoesExtrasPerfil;
}

/** Criação passa por Edge Function (service_role): a RLS de perfis_usuarios só libera UPDATE
 * pra ADMIN_MASTER, nunca INSERT (o perfil nasce junto com o usuário do Auth, que a anon key
 * não pode criar sozinha) — ver supabase/functions/criar-usuario. */
export function useCriarUsuarioGestao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarUsuarioInput) => {
      const { data, error } = await supabase.functions.invoke("criar-usuario", {
        body: {
          nome_completo: input.nomeCompleto,
          nome_usuario: input.nomeUsuario,
          matricula: input.matricula,
          senha: input.senha,
          nivel_acesso: input.nivelAcesso,
          setores_permitidos: input.setoresPermitidos,
          email_alerta: input.emailAlerta,
          configuracoes_extras: JSON.stringify(input.configuracoesExtras),
        },
      });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["perfis_usuarios"] }),
  });
}

export interface EditarUsuarioInput {
  id: string;
  nomeCompleto: string;
  nivelAcesso: NivelAcesso;
  setoresPermitidos: string[];
  emailAlerta: string | null;
  configuracoesExtras: ConfiguracoesExtrasPerfil;
}

/** Edição é update direto (nome, perfil, setores e o blob de configurações extras) — nunca
 * mexe em nome_usuario (login) nem reinsere a linha, como a RLS já permite pra ADMIN_MASTER. */
export function useEditarUsuarioGestao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditarUsuarioInput) => {
      const { error } = await supabase
        .from("perfis_usuarios")
        .update({
          nome_completo: input.nomeCompleto,
          nivel_acesso: input.nivelAcesso,
          setores_permitidos: input.setoresPermitidos,
          email_alerta: input.emailAlerta,
          configuracoes_extras: JSON.stringify(input.configuracoesExtras),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["perfis_usuarios"] }),
  });
}

/** Atualiza só o blob de configurações extras (usado pelo troca-de-setor inline do
 * ModalUsuariosAtivos) — mescla por cima do que já existia em vez de sobrescrever o objeto
 * inteiro, para não perder cobertura temporária/turno já configurados noutra tela. */
export function useAtualizarConfigExtras() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; atual: string | null; patch: Partial<ConfiguracoesExtrasPerfil> }) => {
      const mesclado = { ...parseConfigExtras(input.atual), ...input.patch };
      const { error } = await supabase
        .from("perfis_usuarios")
        .update({ configuracoes_extras: JSON.stringify(mesclado) })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["perfis_usuarios"] }),
  });
}

/** perfis_usuarios nunca é fisicamente apagado (trigger trg_bloqueia_delete_perfil) — "excluir"
 * aqui é desligar: ativo=false + desligado_em. O botão continua desabilitado para o próprio
 * usuário logado (checado no componente). */
export function useDesligarUsuarioGestao() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("perfis_usuarios")
        .update({ ativo: false, desligado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["perfis_usuarios"] }),
  });
}

export function useRedefinirSenhaGestao() {
  return useMutation({
    mutationFn: async (input: { userId: string; novaSenha: string }) => {
      const { error } = await supabase.functions.invoke("redefinir-senha", {
        body: { user_id: input.userId, nova_senha: input.novaSenha },
      });
      if (error) throw error;
    },
  });
}

// ---------------------------------------------------------------------------------------
// Segurança de Login — IPs em CAPTCHA/bloqueados (ver ADR 0015 e migração
// 20260928000001_seguranca_login_bloqueio_ip.sql). Pedido explícito do responsável do
// projeto: 5 falhas de login do mesmo IP exigem CAPTCHA, 10 bloqueiam o IP até um
// ADMIN_MASTER liberar de volta.
// ---------------------------------------------------------------------------------------
export interface BloqueioLoginIp {
  ip: string;
  tentativas_falhas: number;
  status: "aguardando_captcha" | "bloqueado";
  primeira_falha_em: string | null;
  ultima_falha_em: string | null;
  bloqueado_em: string | null;
  desbloqueado_por: string | null;
  desbloqueado_em: string | null;
}

export function useBloqueiosLoginIp() {
  return useQuery({
    queryKey: ["gestao", "bloqueios-login-ip"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bloqueios_login_ip")
        .select(
          "ip, tentativas_falhas, status, primeira_falha_em, ultima_falha_em, bloqueado_em, desbloqueado_por, desbloqueado_em"
        )
        .neq("status", "normal")
        .order("ultima_falha_em", { ascending: false })
        .overrideTypes<BloqueioLoginIp[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Só ADMIN_MASTER desbloqueia — a RLS de bloqueios_login_ip não libera UPDATE para nenhum
 * papel de cliente (mesmo padrão de assinaturas_eletronicas), por isso passa por Edge
 * Function com service_role. Ver supabase/functions/desbloquear-ip-login. */
export function useDesbloquearIp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ip: string) => {
      const { error } = await supabase.functions.invoke("desbloquear-ip-login", { body: { ip } });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["gestao", "bloqueios-login-ip"] }),
  });
}

// ---------------------------------------------------------------------------------------
// KPI "Usuários Ativos": a contagem em si vem do usePresenceStore (efêmero, ver
// presenceStore.ts) — não há query aqui, só os dados de perfil pra cruzar no modal.
// ---------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------
// KPI "Pausa dos Inspetores"
// ---------------------------------------------------------------------------------------
export type TipoPausaGestao = "CURTA_20M" | "ALMOCO_72M" | "JANTAR_72M";

export interface PausaDetalhe {
  id: string;
  user_id: string;
  tipo_pausa: TipoPausaGestao;
  status: "EM_ANDAMENTO" | "CONCLUIDA";
  hora_inicio: string;
  hora_fim: string | null;
}

export const LIMITE_MIN_POR_TIPO_PAUSA: Record<TipoPausaGestao, number> = {
  CURTA_20M: 20,
  ALMOCO_72M: 72,
  JANTAR_72M: 72,
};

export function usePausasEmAndamento() {
  return useQuery({
    queryKey: ["pausas_inspetores", "em_andamento"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pausas_inspetores")
        .select("id, user_id, tipo_pausa, status, hora_inicio, hora_fim")
        .eq("status", "EM_ANDAMENTO")
        .overrideTypes<PausaDetalhe[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Todo mundo "ativo hoje": turno aberto hoje OU alguma pausa hoje — a lista de inspetores do
 * modal parte daqui, não só de quem tem pausa (um inspetor sem pausa nenhuma ainda hoje
 * também deve aparecer, com as duas colunas zeradas). */
export function usePausasHojeDetalhado() {
  return useQuery({
    queryKey: ["pausas_inspetores", "hoje-detalhado"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const desde = inicioDoDiaManaus(new Date()).toISOString();
      const [
        { data: pausas, error: erroPausas },
        { data: turnos, error: erroTurnos },
      ] = await Promise.all([
        supabase
          .from("pausas_inspetores")
          .select("id, user_id, tipo_pausa, status, hora_inicio, hora_fim")
          .gte("hora_inicio", desde)
          .overrideTypes<PausaDetalhe[], { merge: false }>(),
        supabase
          .from("turnos_inspetores")
          .select("user_id")
          .gte("inicio", desde)
          .overrideTypes<{ user_id: string }[], { merge: false }>(),
      ]);
      if (erroPausas) throw erroPausas;
      if (erroTurnos) throw erroTurnos;

      const idsAtivos = new Set<string>([...(turnos ?? []).map((t) => t.user_id), ...(pausas ?? []).map((p) => p.user_id)]);
      return { pausas: pausas ?? [], idsInspetoresAtivos: Array.from(idsAtivos) };
    },
  });
}

// ---------------------------------------------------------------------------------------
// KPI "Monitoramentos em Andamento"
// ---------------------------------------------------------------------------------------
export interface MonitoramentoHojeResumo {
  id: string;
  setor: string;
  ficha_template_id: string;
  user_id: string;
  criado_em: string;
  conformidade: boolean | null;
}

export function useMonitoramentosHoje() {
  return useQuery({
    queryKey: ["monitoramentos", "hoje-resumo"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const desde = inicioDoDiaManaus(new Date()).toISOString();
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, ficha_template_id, user_id, criado_em, conformidade")
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .overrideTypes<MonitoramentoHojeResumo[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface FichaAtrasoInfo {
  id: string;
  codigo: string;
  nome: string;
  tipo_apontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno" | null;
  tempo_entre_apontamentos_min: number | null;
  locais_aplicacao: string[];
}

export interface MonitoramentoAtrasado {
  fichaTemplateId: string;
  codigo: string;
  nome: string;
  setor: string;
  motivo: string;
}

export interface MonitoramentosHojeDetalhado {
  total: number;
  itens: MonitoramentoHojeResumo[];
  porSetor: { setor: string; quantidade: number; itens: MonitoramentoHojeResumo[] }[];
  atrasados: MonitoramentoAtrasado[];
}

/** "Atraso" (seção do KPI "Monitoramentos em Andamento", bloco vermelho do modal): para fichas
 * "Diário" sem nenhum apontamento hoje no setor onde se aplicam; para fichas recorrentes com
 * intervalo configurado, quando o último apontamento do dia passou do intervalo esperado. Sem
 * apontamento algum hoje ainda para uma ficha de intervalo (turno acabou de começar) não é
 * tratado como atraso — não há uma referência de início de turno por setor neste projeto para
 * calcular isso com segurança, então só a regra "Diário" cobre a ausência total. */
export function useMonitoramentosHojeDetalhado() {
  return useQuery({
    queryKey: ["monitoramentos", "hoje-detalhado"],
    refetchInterval: 20_000,
    queryFn: async (): Promise<MonitoramentosHojeDetalhado> => {
      const desde = inicioDoDiaManaus(new Date()).toISOString();
      const [{ data: hoje, error: erroHoje }, { data: fichas, error: erroFichas }] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select("id, setor, ficha_template_id, user_id, criado_em, conformidade")
          .gte("criado_em", desde)
          .order("criado_em", { ascending: false })
          .overrideTypes<MonitoramentoHojeResumo[], { merge: false }>(),
        supabase
          .from("fichas_templates")
          .select("id, codigo, nome, tipo_apontamento, frequencia, tempo_entre_apontamentos_min, locais_aplicacao")
          .eq("ativo", true)
          .overrideTypes<FichaAtrasoInfo[], { merge: false }>(),
      ]);
      if (erroHoje) throw erroHoje;
      if (erroFichas) throw erroFichas;

      const itens = hoje ?? [];
      const porSetorMapa = new Map<string, MonitoramentoHojeResumo[]>();
      for (const m of itens) {
        const lista = porSetorMapa.get(m.setor) ?? [];
        lista.push(m);
        porSetorMapa.set(m.setor, lista);
      }
      const porSetor = Array.from(porSetorMapa.entries())
        .map(([setor, setorItens]) => ({ setor, quantidade: setorItens.length, itens: setorItens }))
        .sort((a, b) => b.quantidade - a.quantidade);

      const agora = Date.now();
      const atrasados: MonitoramentoAtrasado[] = [];
      for (const ficha of fichas ?? []) {
        if (ficha.tipo_apontamento !== "Recorrente") continue;
        const setoresAlvo = ficha.locais_aplicacao.length > 0 ? ficha.locais_aplicacao : Array.from(porSetorMapa.keys());
        for (const setor of setoresAlvo) {
          const registrosSetor = itens.filter((m) => m.setor === setor && m.ficha_template_id === ficha.id);
          if (ficha.frequencia === "Diário") {
            if (registrosSetor.length === 0) {
              atrasados.push({ fichaTemplateId: ficha.id, codigo: ficha.codigo, nome: ficha.nome, setor, motivo: "Apontamento diário ainda não realizado hoje" });
            }
          } else if (ficha.tempo_entre_apontamentos_min && registrosSetor.length > 0) {
            const ultimo = registrosSetor.reduce((max, m) => Math.max(max, new Date(m.criado_em).getTime()), 0);
            if (agora - ultimo > ficha.tempo_entre_apontamentos_min * 60_000) {
              atrasados.push({
                fichaTemplateId: ficha.id,
                codigo: ficha.codigo,
                nome: ficha.nome,
                setor,
                motivo: `Sem apontamento há mais de ${ficha.tempo_entre_apontamentos_min} min`,
              });
            }
          }
        }
      }

      return { total: itens.length, itens, porSetor, atrasados };
    },
  });
}

// ---------------------------------------------------------------------------------------
// KPI "RNCs Pendentes"
// ---------------------------------------------------------------------------------------
export interface FichaSemRnc {
  id: string;
  setor: string;
  user_id: string;
  criado_em: string;
  ficha_template_id: string;
}

export interface RncsPendentesDetalhado {
  emTratativa: Rnc[];
  pendenteVerificacao: Rnc[];
  fichasSemRnc: FichaSemRnc[];
}

/** Mapeamento dos três grupos do modal para o enum status_rnc real deste projeto (ABERTA /
 * EM_TRATATIVA / TRATADA / REABERTA / DEVOLVIDA / FECHADA): "Em Tratativa com Encarregados de
 * Setor" = ABERTA/REABERTA/EM_TRATATIVA/DEVOLVIDA (ainda não recebeu tratativa do Gestor de
 * Setor, ou o Verificador devolveu para nova tratativa); "Pendente de Verificação" = TRATADA
 * (Gestor já respondeu, aguardando revisão do Verificador — useRevisarRnc); "Histórico de
 * Fichas com Desvios" = monitoramentos reprovados nos últimos 30 dias que ainda não têm
 * nenhuma RNC vinculada. */
export function useRncsPendentesDetalhado() {
  return useQuery({
    queryKey: ["gestao", "rncs-pendentes"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<RncsPendentesDetalhado> => {
      const { data: rncs, error } = await supabase
        .from("rnc")
        .select("*")
        .neq("status", "FECHADA")
        .order("criado_em", { ascending: false })
        .overrideTypes<Rnc[], { merge: false }>();
      if (error) throw error;

      const emTratativa = (rncs ?? []).filter(
        (r) => r.status === "ABERTA" || r.status === "REABERTA" || r.status === "EM_TRATATIVA" || r.status === "DEVOLVIDA"
      );
      const pendenteVerificacao = (rncs ?? []).filter((r) => r.status === "TRATADA");

      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: naoConformes, error: erroNaoConformes }, { data: comRnc, error: erroComRnc }] = await Promise.all([
        supabase
          .from("monitoramentos")
          .select("id, setor, user_id, criado_em, ficha_template_id")
          .eq("conformidade", false)
          .gte("criado_em", desde)
          .order("criado_em", { ascending: false })
          .overrideTypes<FichaSemRnc[], { merge: false }>(),
        supabase.from("rnc").select("monitoramento_id").not("monitoramento_id", "is", null).overrideTypes<{ monitoramento_id: string }[], { merge: false }>(),
      ]);
      if (erroNaoConformes) throw erroNaoConformes;
      if (erroComRnc) throw erroComRnc;

      const idsComRnc = new Set((comRnc ?? []).map((r) => r.monitoramento_id));
      const fichasSemRnc = (naoConformes ?? []).filter((m) => !idsComRnc.has(m.id));

      return { emTratativa, pendenteVerificacao, fichasSemRnc };
    },
  });
}

// ---------------------------------------------------------------------------------------
// Dossiê (documento de auditoria) de um monitoramento — reaproveitado pelos modais de
// Monitoramentos em Andamento e RNCs Pendentes ("abre o dossiê completo... com botão Voltar").
// ---------------------------------------------------------------------------------------
export interface DossieMonitoramento {
  id: string;
  setor: string;
  criado_em: string;
  conformidade: boolean | null;
  verificado_em: string | null;
  liberado_sif: boolean;
  dados_dinamicos: Record<string, unknown>;
  fichaCodigo: string | null;
  fichaNome: string | null;
  inspetorNome: string | null;
  verificadorNome: string | null;
  assinaturas: { tipo: string; criado_em: string }[];
}

export function useDossieMonitoramento(monitoramentoId: string | null) {
  return useQuery({
    queryKey: ["gestao", "dossie-monitoramento", monitoramentoId],
    enabled: !!monitoramentoId,
    queryFn: async (): Promise<DossieMonitoramento> => {
      const { data: m, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, criado_em, conformidade, verificado_em, liberado_sif, dados_dinamicos, ficha_template_id, user_id, verificado_por")
        .eq("id", monitoramentoId as string)
        .single()
        .overrideTypes<
          {
            id: string;
            setor: string;
            criado_em: string;
            conformidade: boolean | null;
            verificado_em: string | null;
            liberado_sif: boolean;
            dados_dinamicos: Record<string, unknown>;
            ficha_template_id: string;
            user_id: string;
            verificado_por: string | null;
          },
          { merge: false }
        >();
      if (error) throw error;

      const [{ data: ficha }, { data: inspetor }, { data: verificador }, { data: assinaturas }] = await Promise.all([
        supabase.from("fichas_templates").select("codigo, nome").eq("id", m.ficha_template_id).maybeSingle().overrideTypes<{ codigo: string; nome: string } | null, { merge: false }>(),
        supabase.from("perfis_usuarios").select("nome_completo").eq("id", m.user_id).maybeSingle().overrideTypes<{ nome_completo: string } | null, { merge: false }>(),
        m.verificado_por
          ? supabase.from("perfis_usuarios").select("nome_completo").eq("id", m.verificado_por).maybeSingle().overrideTypes<{ nome_completo: string } | null, { merge: false }>()
          : Promise.resolve({ data: null }),
        supabase.from("assinaturas_eletronicas").select("tipo, criado_em").eq("monitoramento_id", monitoramentoId as string).order("criado_em").overrideTypes<{ tipo: string; criado_em: string }[], { merge: false }>(),
      ]);

      return {
        id: m.id,
        setor: m.setor,
        criado_em: m.criado_em,
        conformidade: m.conformidade,
        verificado_em: m.verificado_em,
        liberado_sif: m.liberado_sif,
        dados_dinamicos: m.dados_dinamicos,
        fichaCodigo: ficha?.codigo ?? null,
        fichaNome: ficha?.nome ?? null,
        inspetorNome: inspetor?.nome_completo ?? null,
        verificadorNome: verificador?.nome_completo ?? null,
        assinaturas: assinaturas ?? [],
      };
    },
  });
}

// ---------------------------------------------------------------------------------------
// Áreas de Inspeção / PCM — Centros de Custo (aba "admin_areas"). Tabela relacional de
// verdade (não app_config): já existe como `centros_custo` desde a Fase 1, para o módulo de
// PCM/manutenção — nunca confundir com app_config.setores_cadastrados (setor operacional de
// inspeção), são conceitos diferentes mesmo namespace de UI ("Áreas").
// ---------------------------------------------------------------------------------------
export interface CentroCusto {
  id: string;
  codigo: string;
  nome: string;
}

export function useCentrosCusto() {
  return useQuery({
    queryKey: ["centros_custo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("centros_custo").select("id, codigo, nome").order("nome").overrideTypes<CentroCusto[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSalvarCentroCusto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string | null; codigo: string; nome: string }) => {
      const { error } = input.id
        ? await supabase.from("centros_custo").update({ codigo: input.codigo, nome: input.nome }).eq("id", input.id)
        : await supabase.from("centros_custo").insert({ codigo: input.codigo, nome: input.nome });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["centros_custo"] }),
  });
}

export function useExcluirCentroCusto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("centros_custo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["centros_custo"] }),
  });
}

// ---------------------------------------------------------------------------------------
// Listas simples em app_config (equipamentos, desvios, comunicados, controle de pragas) —
// mesmo padrão de src/modules/admin/api.ts (setores_cadastrados): um único registro jsonb por
// chave, reescrito por inteiro a cada criar/editar/excluir. Um helper genérico evita repetir a
// leitura/gravação quatro vezes.
// ---------------------------------------------------------------------------------------
function useListaAppConfig<T>(chave: string) {
  return useQuery({
    queryKey: ["app_config", chave],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("valor")
        .eq("chave", chave)
        .maybeSingle()
        .overrideTypes<{ valor: T[] } | null, { merge: false }>();
      if (error) throw error;
      return data?.valor ?? [];
    },
  });
}

function useSalvarListaAppConfig<T>(chave: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lista: T[]) => {
      const { error } = await supabase.from("app_config").upsert({ chave, valor: lista }, { onConflict: "chave" });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["app_config", chave] }),
  });
}

export interface EquipamentoCadastrado {
  id: string;
  codigo: string;
  tag: string;
  nome: string;
  setor: string;
}
export const useEquipamentosCadastrados = () => useListaAppConfig<EquipamentoCadastrado>("equipamentos_cadastrados");
export const useSalvarEquipamentos = () => useSalvarListaAppConfig<EquipamentoCadastrado>("equipamentos_cadastrados");

export const GRUPOS_DESVIO = [
  "Manutenção Mecânica",
  "Manutenção Elétrica",
  "Mecânica com Risco BPF",
  "Elétrica com Risco BPF",
  "Qualidade/Contaminação/BPF",
  "Processo Operacional (Gargalos)",
  "Infraestrutura Externa",
  "Auditoria/Inspeção (SIF/DAE/VOEC)",
  "Negligência com a Qualidade",
  "Negligência com as BPF",
  "Violação de PCC1B",
  "Violação de PCC2B",
  "Pane Mecânica/Elétrica",
  "Contaminação Cruzada - Produto",
  "Contaminação Cruzada - Fômites",
  "Outros",
] as const;
export type GrupoDesvio = (typeof GRUPOS_DESVIO)[number];

// Classes (não hex) — badge sólido por grupo de desvio, restrito à paleta do design system
// GloboPac (navy/lima/warning/destructive + os neutros de superfície escura/cinza).
export const COR_GRUPO_DESVIO: Record<GrupoDesvio, string> = {
  "Manutenção Mecânica": "bg-primary text-ondark",
  "Manutenção Elétrica": "bg-primary-active text-ondark",
  "Mecânica com Risco BPF": "bg-warning text-warning-foreground",
  "Elétrica com Risco BPF": "bg-warning text-warning-foreground",
  "Qualidade/Contaminação/BPF": "bg-destructive text-destructive-foreground",
  "Processo Operacional (Gargalos)": "bg-primary-active text-ondark",
  "Infraestrutura Externa": "bg-muted-foreground text-ondark",
  "Auditoria/Inspeção (SIF/DAE/VOEC)": "bg-surface-dark text-lime",
  "Negligência com a Qualidade": "bg-destructive text-destructive-foreground",
  "Negligência com as BPF": "bg-destructive text-destructive-foreground",
  "Violação de PCC1B": "bg-destructive text-destructive-foreground",
  "Violação de PCC2B": "bg-destructive text-destructive-foreground",
  "Pane Mecânica/Elétrica": "bg-primary text-ondark",
  "Contaminação Cruzada - Produto": "bg-destructive text-destructive-foreground",
  "Contaminação Cruzada - Fômites": "bg-destructive text-destructive-foreground",
  Outros: "bg-muted-foreground text-ondark",
};

export interface DesvioCadastrado {
  id: string;
  nome: string;
  grupo: GrupoDesvio;
}
export const useDesviosCadastrados = () => useListaAppConfig<DesvioCadastrado>("desvios_cadastrados");
export const useSalvarDesvios = () => useSalvarListaAppConfig<DesvioCadastrado>("desvios_cadastrados");

export interface ComunicadoCadastrado {
  id: string;
  titulo: string;
  mensagem: string;
  autor: string;
  criadoEm: string;
}
export const useComunicadosCadastrados = () => useListaAppConfig<ComunicadoCadastrado>("comunicados_publicados");
export const useSalvarComunicados = () => useSalvarListaAppConfig<ComunicadoCadastrado>("comunicados_publicados");

export interface RegistroControlePraga {
  id: string;
  data: string;
  setor: string;
  tipoPraga: string;
  acaoTomada: string;
  responsavel: string;
}
export const useRegistrosControlePragas = () => useListaAppConfig<RegistroControlePraga>("controle_pragas_registros");
export const useSalvarControlePragas = () => useSalvarListaAppConfig<RegistroControlePraga>("controle_pragas_registros");

// ---------------------------------------------------------------------------------------
// Relatório "Folhas de Pausa" (Jornada) — turnos + pausas do(s) inspetor(es) no mês de
// referência, America/Manaus.
// ---------------------------------------------------------------------------------------
export function rangeDoMesManaus(mes: string): { inicio: string; fim: string } {
  const partes = mes.split("-");
  const ano = Number(partes[0]);
  const mesNum = Number(partes[1]);
  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1, 4, 0, 0));
  const fim = new Date(Date.UTC(ano, mesNum, 1, 4, 0, 0));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export interface TurnoJornada {
  id: string;
  user_id: string;
  inicio: string;
  fim: string | null;
  setor: string | null;
}

export interface RelatorioJornadaInspetor {
  id: string;
  nome: string;
  turnos: TurnoJornada[];
  pausas: PausaDetalhe[];
}

export function useRelatorioJornada(inspetorIds: string[], mes: string) {
  return useQuery({
    queryKey: ["gestao", "relatorio-jornada", inspetorIds, mes],
    enabled: inspetorIds.length > 0 && !!mes,
    queryFn: async (): Promise<RelatorioJornadaInspetor[]> => {
      const { inicio, fim } = rangeDoMesManaus(mes);
      const [{ data: perfis, error: erroPerfis }, { data: turnos, error: erroTurnos }, { data: pausas, error: erroPausas }] = await Promise.all([
        supabase.from("perfis_usuarios").select("id, nome_completo").in("id", inspetorIds).overrideTypes<{ id: string; nome_completo: string }[], { merge: false }>(),
        supabase
          .from("turnos_inspetores")
          .select("id, user_id, inicio, fim, setor")
          .in("user_id", inspetorIds)
          .gte("inicio", inicio)
          .lt("inicio", fim)
          .order("inicio")
          .overrideTypes<TurnoJornada[], { merge: false }>(),
        supabase
          .from("pausas_inspetores")
          .select("id, user_id, tipo_pausa, status, hora_inicio, hora_fim")
          .in("user_id", inspetorIds)
          .gte("hora_inicio", inicio)
          .lt("hora_inicio", fim)
          .order("hora_inicio")
          .overrideTypes<PausaDetalhe[], { merge: false }>(),
      ]);
      if (erroPerfis) throw erroPerfis;
      if (erroTurnos) throw erroTurnos;
      if (erroPausas) throw erroPausas;

      return (perfis ?? []).map((p) => ({
        id: p.id,
        nome: p.nome_completo,
        turnos: (turnos ?? []).filter((t) => t.user_id === p.id),
        pausas: (pausas ?? []).filter((pa) => pa.user_id === p.id),
      }));
    },
  });
}
