-- RNC: ação imediata informada pelo inspetor de qualidade ao abrir a RNC (o que foi feito na hora
-- para conter o desvio). Coluna nullable: RNCs antigas e as abertas automaticamente na reprovação
-- do Verificador não têm esse campo; a obrigatoriedade para o inspetor é aplicada na tela de
-- abertura (NovaRncPage) e vale só para RNCs novas abertas por ele.

alter table rnc add column if not exists acao_imediata text;

comment on column rnc.acao_imediata is
  'Ação imediata tomada pelo inspetor de qualidade ao abrir a RNC (contenção do desvio). '
  'Preenchida na abertura pelo inspetor; nula em RNCs antigas ou abertas pela reprovação do Verificador.';
