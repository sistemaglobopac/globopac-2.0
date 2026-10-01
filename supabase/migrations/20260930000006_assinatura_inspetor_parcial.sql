-- Teste de Absorção de Água em duas fases: a pesagem inicial é assinada como INSPETOR_PARCIAL
-- (prova, com carimbo de tempo RFC 3161, que o peso inicial existia ANTES do final); a
-- assinatura INSPETOR completa só vem na finalização.
--
-- Migração separada e anterior à 20260930000007: o Postgres proíbe usar um valor de enum
-- recém-adicionado na mesma transação em que ele foi criado.

alter type tipo_assinatura_ficha add value if not exists 'INSPETOR_PARCIAL';
