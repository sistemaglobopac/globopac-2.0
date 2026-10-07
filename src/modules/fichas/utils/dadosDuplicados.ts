// Trava de monitoramento repetido: não se grava (nem como rascunho) um monitoramento cujos dados sejam
// idênticos aos de outro já registrado da mesma ficha e setor — assinado, aguardando sincronização ou
// salvo como rascunho. Só a hora do monitoramento (e as marcas de controle do fluxo) podem diferir.
// Funções PURAS, testadas em tests/unit/dadosDuplicados.test.ts.
import { CHAVE_HORA_MONITORAMENTO } from "./horaMonitoramento";

/** Chaves de controle em dados_dinamicos que não são dados medidos: não entram na comparação. */
const CHAVES_DE_CONTROLE = new Set([CHAVE_HORA_MONITORAMENTO, "continuacao_de", "adendos", "aguardando_peso"]);

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor && typeof valor === "object") {
    const ordenado: Record<string, unknown> = {};
    for (const chave of Object.keys(valor as Record<string, unknown>).sort()) {
      const v = (valor as Record<string, unknown>)[chave];
      if (v !== undefined) ordenado[chave] = canonico(v);
    }
    return ordenado;
  }
  return valor;
}

/** Texto comparável dos dados medidos: independe da ordem das chaves e ignora hora e marcas de controle. */
export function assinaturaDosDados(dados: Record<string, unknown> | null | undefined): string {
  const medidos: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados ?? {})) if (!CHAVES_DE_CONTROLE.has(chave)) medidos[chave] = valor;
  return JSON.stringify(canonico(medidos));
}

/** Os dados já constam em algum dos registros existentes? Um registro sem nenhum dado medido não conta. */
export function dadosJaRegistrados(dados: Record<string, unknown>, existentes: (Record<string, unknown> | null | undefined)[]): boolean {
  const alvo = assinaturaDosDados(dados);
  if (alvo === "{}") return false;
  return existentes.some((e) => assinaturaDosDados(e) === alvo);
}
