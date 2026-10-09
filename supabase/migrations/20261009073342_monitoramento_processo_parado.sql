-- "Processo parado": alguns monitoramentos só podem ser feitos com o processo em andamento. Quando o
-- alarme de atraso soa e o processo está parado, o inspetor justifica aqui por que o monitoramento não
-- foi realizado. A justificativa dispensa o período em atraso: o sistema só volta a cobrar no próximo
-- período (referencia_em + tempo_entre_apontamentos_min da ficha). Registro de auditoria: só se insere,
-- nunca se edita nem se apaga. Vale por CÓDIGO da ficha (reeditar a ficha cria um template novo com o
-- mesmo código), como fichas_encerradas_dia.

-- Só as fichas marcadas aqui (Construtor de Fichas) oferecem "Processo parado" ao inspetor. Padrão: desligado.
alter table public.fichas_templates
  add column exige_processo_em_andamento boolean not null default false;

comment on column public.fichas_templates.exige_processo_em_andamento is
  'Monitoramento que só pode ser feito com o processo em andamento: em atraso, o inspetor pode justificar "processo parado" '
  '(monitoramentos_processo_parado) e a cobrança só volta no período seguinte.';

create table public.monitoramentos_processo_parado (
  id uuid primary key default gen_random_uuid(),
  ficha_codigo text not null,
  setor text,
  -- Início do período em atraso que foi dispensado (o último "horário devido" até o instante do registro).
  referencia_em timestamptz not null,
  motivo text not null check (length(btrim(motivo)) > 0),
  detalhes text,
  registrado_por uuid not null default auth.uid() references public.perfis_usuarios (id),
  registrado_em timestamptz not null default now()
);

create index idx_processo_parado_ficha on public.monitoramentos_processo_parado (ficha_codigo, registrado_em desc);

alter table public.monitoramentos_processo_parado enable row level security;

-- Quem cobre o almoço de outro inspetor precisa enxergar a justificativa para não ser cobrado de novo.
create policy processo_parado_select on public.monitoramentos_processo_parado
  for select to authenticated
  using (public.meu_perfil() in ('INSPETOR_QUALIDADE', 'VERIFICADOR', 'GESTOR_SETOR', 'ADMIN_MASTER'));

create policy processo_parado_insert on public.monitoramentos_processo_parado
  for insert to authenticated
  with check (
    public.meu_perfil() in ('INSPETOR_QUALIDADE', 'ADMIN_MASTER')
    and registrado_por = auth.uid()
  );

alter publication supabase_realtime add table public.monitoramentos_processo_parado;
