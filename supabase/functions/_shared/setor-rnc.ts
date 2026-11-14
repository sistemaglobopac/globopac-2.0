// Setor que recebe a RNC de um monitoramento não conforme. Alguns campos (ex.: hematomas nas carcaças) mandam a RNC para
// um setor diferente do de quem monitora: o valor do campo grava `setorRnc` e, estando `conformidade: false`, a RNC vai para lá.
// Fonte única, usada pela tela de abertura da RNC (frontend) e pela Edge Function verificar-monitoramento. Sem imports:
// roda igual no navegador e no Deno. Testada em tests/unit/setorRnc.test.ts.

/** Nome do setor como aparece no cadastro de setores (a comparação ignora acento, caixa e espaços repetidos). */
export const SETOR_FOMENTO_AVICOLA = "FOMENTO AVÍCOLA";

const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** Setor de destino pedido pelos campos NÃO CONFORMES do registro (o primeiro, na ordem em que foram gravados), ou null
 * quando nenhum campo pede um setor específico — aí vale o setor do próprio monitoramento. */
export function setorDestinoDaRnc(dados: Record<string, unknown> | null | undefined): string | null {
  for (const valor of Object.values(dados ?? {})) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) continue;
    const v = valor as { conformidade?: unknown; setorRnc?: unknown };
    if (v.conformidade === false && typeof v.setorRnc === "string" && v.setorRnc.trim() !== "") return v.setorRnc.trim();
  }
  return null;
}

/** Nome do setor como está cadastrado (app_config.setores_cadastrados), para a RNC cair exatamente no setor que o gestor
 * enxerga ("Fomento Avícola" cadastrado → usa essa grafia). Sem correspondência, devolve o próprio destino. */
export function setorCadastradoDe(destino: string, cadastrados: readonly string[] | null | undefined): string {
  const alvo = normalizar(destino);
  return (cadastrados ?? []).find((s) => normalizar(s) === alvo) ?? destino;
}
