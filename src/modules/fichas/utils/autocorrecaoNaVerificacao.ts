// Quem pode registrar a autocorreção imediata direto na tela de verificação (em nome próprio, sem esperar o inspetor): o Verificador e o
// Administrador, enquanto o monitoramento tem não conformidade, ainda não foi verificado e não tem RNC nem autocorreção. Espelha a
// política autocorrecoes_insert do banco (20261031120000). Função pura, testada em tests/unit/autocorrecaoNaVerificacao.test.ts.
import { temNaoConformidade } from "./desviosEspeciais";

const PERFIS_QUE_AUTOCORRIGEM = ["VERIFICADOR", "ADMIN_MASTER"];

export function podeAutocorrigirNaVerificacao(
  nivelAcesso: string | undefined,
  registro: { verificado_por: string | null; dados_dinamicos: Record<string, unknown> },
  jaTemRncOuAutocorrecao: boolean
): boolean {
  return (
    !!nivelAcesso &&
    PERFIS_QUE_AUTOCORRIGEM.includes(nivelAcesso) &&
    !registro.verificado_por &&
    !jaTemRncOuAutocorrecao &&
    temNaoConformidade(registro.dados_dinamicos)
  );
}
