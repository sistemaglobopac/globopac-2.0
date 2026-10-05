-- "Encerrar abate": o inspetor encerra, para o dia, uma ficha recorrente que depende de haver abate
-- (ex.: bem-estar nos boxes de espera, que fica sem cargas no fim do dia). Enquanto houver linha
-- para (codigo, dia), o Painel de Bordo e o alerta global não geram aviso de atraso dessa ficha.
-- Vale por CÓDIGO da ficha (não pelo id) porque reeditar a ficha cria um template novo com o mesmo
-- código. "dia" é a data em America/Manaus. Reabrir = apagar a linha.

create table public.fichas_encerradas_dia (
  codigo text not null,
  dia date not null default ((now() at time zone 'America/Manaus')::date),
  encerrado_por uuid not null default auth.uid() references public.perfis_usuarios (id),
  encerrado_em timestamptz not null default now(),
  primary key (codigo, dia)
);

alter table public.fichas_encerradas_dia enable row level security;

create policy fichas_encerradas_dia_select on public.fichas_encerradas_dia
  for select to authenticated
  using (true);

create policy fichas_encerradas_dia_insert on public.fichas_encerradas_dia
  for insert to authenticated
  with check (
    public.meu_perfil() in ('INSPETOR_QUALIDADE', 'ADMIN_MASTER')
    and encerrado_por = auth.uid()
  );

-- Reabrir o abate do dia: qualquer inspetor do setor (cobertura de almoço) ou o administrador.
create policy fichas_encerradas_dia_delete on public.fichas_encerradas_dia
  for delete to authenticated
  using (public.meu_perfil() in ('INSPETOR_QUALIDADE', 'ADMIN_MASTER'));

alter publication supabase_realtime add table public.fichas_encerradas_dia;
