-- Ajusta o fuso horario padrao da sessao/banco para America/Manaus (UTC-4, sem horario de
-- verao) -- so afeta como valores sao EXIBIDOS/interpretados quando nao ha timezone explicito
-- (ex.: now() no SQL Editor, CURRENT_DATE); nenhuma coluna timestamptz muda de valor armazenado
-- (timestamptz sempre guarda o instante absoluto em UTC, independente desta configuracao) e
-- nenhuma migracao/trigger deste projeto depende de CURRENT_DATE ou now()::date implicito, so
-- deixa consistente com o fuso ja usado em todo o app (America/Manaus, ver inicioDoDiaManaus e
-- ensureLocalTime no frontend).
alter database postgres set timezone to 'America/Manaus';
