-- Fase 1 — VERIFICADOR precisa poder abrir RNC ao reprovar um monitoramento (seção 7.1:
-- "abrindo RNC automaticamente se reprovado"). A Edge Function verificar-monitoramento
-- insere a RNC usando o cliente do próprio chamador (não service_role), para que a
-- autoria (aberto_por = auth.uid()) seja reforçada pela mesma RLS de rnc_insert usada em
-- qualquer outra criação de RNC — por isso a permissão precisa existir na matriz, não só na
-- lógica da função.

insert into permissoes_perfil (perfil, recurso, acao) values
  ('VERIFICADOR', 'rnc', 'criar')
on conflict (perfil, recurso, acao) do nothing;
