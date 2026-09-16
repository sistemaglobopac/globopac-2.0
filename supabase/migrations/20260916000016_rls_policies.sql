-- Fase 0 — Políticas de RLS. Deny by default: nenhuma tabela tem política "catch-all"; toda
-- policy checa tem_permissao() e, quando aplicável, restrição de setor/perfil explícita.
--
-- Nota de arquitetura: RLS controla QUAIS LINHAS um papel pode ver/tocar. Ela não faz
-- checagem de COLUNA (ex.: "esta UPDATE só pode alterar liberado_sif, não dados_dinamicos").
-- Esse escopo mais fino é responsabilidade da Edge Function correspondente (payload validado
-- por Zod) — RLS e Edge Function são camadas complementares, não substitutas uma da outra
-- (seção 8: "nenhuma lógica de autorização somente no frontend" — aqui, nenhuma lógica de
-- autorização somente na RLS, tampouco).

-- ============================================================================================
-- perfis_usuarios
-- ============================================================================================
create policy perfis_usuarios_select on perfis_usuarios
  for select
  using (
    id = auth.uid()
    or public.tem_permissao('perfis_usuarios', 'ler')
  );

create policy perfis_usuarios_update on perfis_usuarios
  for update
  using (public.tem_permissao('perfis_usuarios', 'atualizar'))
  with check (public.tem_permissao('perfis_usuarios', 'atualizar'));

-- Sem policy de INSERT para authenticated/anon: criação de perfil acontece via Edge Function
-- com service_role, atrelada à criação do usuário em auth.users (Admin API).

-- ============================================================================================
-- permissoes_perfil
-- ============================================================================================
create policy permissoes_perfil_select on permissoes_perfil
  for select
  using (auth.role() = 'authenticated');

create policy permissoes_perfil_admin on permissoes_perfil
  for all
  using (public.tem_permissao('permissoes_perfil', 'gerenciar'))
  with check (public.tem_permissao('permissoes_perfil', 'gerenciar'));

-- ============================================================================================
-- app_config / centros_custo
-- ============================================================================================
create policy app_config_select on app_config
  for select
  using (auth.role() = 'authenticated');

create policy app_config_admin on app_config
  for all
  using (public.tem_permissao('app_config', 'gerenciar'))
  with check (public.tem_permissao('app_config', 'gerenciar'));

create policy centros_custo_select on centros_custo
  for select
  using (auth.role() = 'authenticated');

create policy centros_custo_admin on centros_custo
  for all
  using (public.tem_permissao('centros_custo', 'gerenciar'))
  with check (public.tem_permissao('centros_custo', 'gerenciar'));

-- ============================================================================================
-- fichas_templates
-- ============================================================================================
create policy fichas_templates_select on fichas_templates
  for select
  using (ativo = true or public.tem_permissao('fichas_templates', 'gerenciar'));

create policy fichas_templates_admin on fichas_templates
  for all
  using (public.tem_permissao('fichas_templates', 'gerenciar'))
  with check (public.tem_permissao('fichas_templates', 'gerenciar'));

-- ============================================================================================
-- monitoramentos
-- ============================================================================================
-- Leitura: ADMIN_MASTER vê tudo; INSPECAO_FEDERAL só o que já foi liberado; os demais perfis
-- só o próprio setor (meus_setores()) — e mesmo assim só com a permissão 'ler' concedida.
create policy monitoramentos_select on monitoramentos
  for select
  using (
    public.tem_permissao('monitoramentos', 'ler')
    and (
      public.meu_perfil() = 'ADMIN_MASTER'
      or (public.meu_perfil() = 'INSPECAO_FEDERAL' and liberado_sif = true)
      or setor = any (public.meus_setores())
    )
  );

-- Criação: o inspetor só cria registro como si mesmo (user_id = auth.uid()) e só no próprio
-- setor — impede que um cliente forje user_id de outra pessoa.
create policy monitoramentos_insert on monitoramentos
  for insert
  with check (
    public.tem_permissao('monitoramentos', 'criar')
    and user_id = auth.uid()
    and setor = any (public.meus_setores())
  );

-- Verificação (aprovar/reprovar): quem tem a ação 'verificar' e está no setor do registro.
-- A checagem de que verificado_por != user_id é reforçada pelo trigger
-- trg_segregacao_funcoes, não apenas por esta policy.
create policy monitoramentos_update_verificar on monitoramentos
  for update
  using (
    public.tem_permissao('monitoramentos', 'verificar')
    and setor = any (public.meus_setores())
  )
  with check (public.tem_permissao('monitoramentos', 'verificar'));

-- Liberação ao SIF: ação distinta de 'verificar' — normalmente concedida a ADMIN_MASTER e/ou
-- VERIFICADOR (ver docs/permissions-matrix.md). Múltiplas policies permissivas de UPDATE são
-- combinadas com OR pelo Postgres.
create policy monitoramentos_update_liberar_sif on monitoramentos
  for update
  using (public.tem_permissao('monitoramentos', 'liberar_sif'))
  with check (public.tem_permissao('monitoramentos', 'liberar_sif'));

-- Sem policy de DELETE: além de negado por RLS por ausência de política, o trigger
-- trg_bloqueia_delete_monitoramento também bloqueia fisicamente (defesa em profundidade).

-- ============================================================================================
-- rnc
-- ============================================================================================
create policy rnc_select on rnc
  for select
  using (
    public.tem_permissao('rnc', 'ler')
    and (public.meu_perfil() = 'ADMIN_MASTER' or setor = any (public.meus_setores()))
  );

create policy rnc_insert on rnc
  for insert
  with check (
    public.tem_permissao('rnc', 'criar')
    and aberto_por = auth.uid()
  );

create policy rnc_update on rnc
  for update
  using (
    public.tem_permissao('rnc', 'tratar')
    and setor = any (public.meus_setores())
  )
  with check (public.tem_permissao('rnc', 'tratar'));

-- ============================================================================================
-- assinaturas_eletronicas / assinaturas_os_eletronicas
-- Sem policy de INSERT para authenticated: a única via de escrita é a Edge Function
-- assinar-documento (Fase 2), executando com service_role (que ignora RLS por padrão) —
-- isso é intencional e é justamente o que impede um cliente malicioso de gravar um hash
-- arbitrário (débito técnico da v1, seção 12). UPDATE/DELETE já são bloqueados por trigger
-- independentemente de RLS.
-- ============================================================================================
create policy assinaturas_eletronicas_select on assinaturas_eletronicas
  for select
  using (
    public.tem_permissao('assinaturas_eletronicas', 'ler')
    and exists (
      select 1 from monitoramentos m
      where m.id = assinaturas_eletronicas.monitoramento_id
        and (
          public.meu_perfil() = 'ADMIN_MASTER'
          or (public.meu_perfil() = 'INSPECAO_FEDERAL' and m.liberado_sif = true)
          or m.setor = any (public.meus_setores())
        )
    )
  );

create policy assinaturas_os_eletronicas_select on assinaturas_os_eletronicas
  for select
  using (
    public.tem_permissao('assinaturas_os_eletronicas', 'ler')
    and exists (
      select 1 from manutencao_os os
      where os.id = assinaturas_os_eletronicas.os_id
        and (public.meu_perfil() = 'ADMIN_MASTER' or os.setor = any (public.meus_setores()))
    )
  );

-- ============================================================================================
-- fila_carimbo_tempo / lote_liberacao_sif / log_acessos_verificacao
-- Escrita exclusiva via service_role (Edge Functions); somente leitura para quem administra.
-- ============================================================================================
create policy fila_carimbo_select on fila_carimbo_tempo
  for select
  using (public.tem_permissao('fila_carimbo_tempo', 'ler'));

create policy lote_liberacao_select on lote_liberacao_sif
  for select
  using (public.tem_permissao('lote_liberacao_sif', 'ler'));

create policy log_acessos_select on log_acessos_verificacao
  for select
  using (public.tem_permissao('log_acessos_verificacao', 'ler'));

-- ============================================================================================
-- manutencao_os / manutencao_os_historico / manutencao_relatorios_sif
-- ============================================================================================
create policy manutencao_os_select on manutencao_os
  for select
  using (
    public.tem_permissao('manutencao_os', 'ler')
    and (
      public.meu_perfil() = 'ADMIN_MASTER'
      or public.meu_perfil() = 'INSPECAO_FEDERAL'
      or setor = any (public.meus_setores())
    )
  );

create policy manutencao_os_insert on manutencao_os
  for insert
  with check (
    public.tem_permissao('manutencao_os', 'abrir')
    and aberto_por = auth.uid()
  );

create policy manutencao_os_update on manutencao_os
  for update
  using (public.tem_permissao('manutencao_os', 'avancar_etapa'))
  with check (public.tem_permissao('manutencao_os', 'avancar_etapa'));

create policy manutencao_historico_select on manutencao_os_historico
  for select
  using (public.tem_permissao('manutencao_os_historico', 'ler'));

create policy manutencao_relatorios_select on manutencao_relatorios_sif
  for select
  using (public.tem_permissao('manutencao_relatorios_sif', 'ler'));

create policy manutencao_relatorios_insert on manutencao_relatorios_sif
  for insert
  with check (public.tem_permissao('manutencao_relatorios_sif', 'criar'));

create policy manutencao_relatorios_liberar on manutencao_relatorios_sif
  for update
  using (public.tem_permissao('manutencao_relatorios_sif', 'liberar'))
  with check (public.tem_permissao('manutencao_relatorios_sif', 'liberar'));

-- ============================================================================================
-- turnos_inspetores — cada inspetor só vê/edita o próprio turno; ADMIN_MASTER vê todos.
-- ============================================================================================
create policy turnos_select on turnos_inspetores
  for select
  using (
    public.tem_permissao('turnos_inspetores', 'ler')
    and (public.meu_perfil() = 'ADMIN_MASTER' or user_id = auth.uid())
  );

create policy turnos_insert on turnos_inspetores
  for insert
  with check (user_id = auth.uid());

create policy turnos_update on turnos_inspetores
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
