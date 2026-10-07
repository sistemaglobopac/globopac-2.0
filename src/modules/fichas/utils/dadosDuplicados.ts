// Trava de monitoramento repetido: não se grava (nem como rascunho) um monitoramento cujos dados sejam
// idênticos aos de outro já registrado da mesma ficha e setor — assinado, aguardando sincronização ou
// salvo como rascunho. Só a hora do monitoramento (e as marcas de controle do fluxo) podem diferir.
//
// Campos de CONFIRMAÇÃO (sim/não, conforme/não conforme, "todas as caixas estão vazias", ocorrência de pragas…) NÃO entram na
// comparação: a resposta esperada é sempre a mesma, então repetir não indica registro duplicado — e a trava impedia o inspetor
// de registrar monitoramentos legítimos. Se a ficha só tem esse tipo de campo, nunca há repetição a bloquear.
// Funções PURAS, testadas em tests/unit/dadosDuplicados.test.ts.
import { CHAVE_HORA_MONITORAMENTO } from "./horaMonitoramento";

/** Chaves de controle em dados_dinamicos que não são dados medidos: não entram na comparação. */
const CHAVES_DE_CONTROLE = new Set([CHAVE_HORA_MONITORAMENTO, "continuacao_de", "adendos", "aguardando_peso"]);

/** Tipos de campo cuja resposta é uma confirmação (booleana/escolha/checklist) e se repete naturalmente. */
export const TIPOS_DE_CONFIRMACAO: ReadonlySet<string> = new Set([
  "booleano",
  "selecao",
  "unica_escolha",
  "caixas_vazias",
  "ocorrencia_pragas",
  "aguas_residuais",
  "ventilacao",
  "higiene_habitos",
  "pso",
  "higiene_operacional",
]);

/** Chaves (dados_dinamicos) dos campos de confirmação de uma ficha: ficam fora da comparação. */
export function chavesDeConfirmacao(campos: { chave: string; tipo: string }[]): Set<string> {
  return new Set(campos.filter((c) => TIPOS_DE_CONFIRMACAO.has(c.tipo)).map((c) => c.chave));
}

const semConteudo = (v: unknown) => v === undefined || v === null || v === "";

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
export function assinaturaDosDados(dados: Record<string, unknown> | null | undefined, ignorar: ReadonlySet<string> = new Set()): string {
  const medidos: Record<string, unknown> = {};
  // Campo em branco (ex.: observação vazia) também não é dado medido.
  for (const [chave, valor] of Object.entries(dados ?? {})) if (!CHAVES_DE_CONTROLE.has(chave) && !ignorar.has(chave) && !semConteudo(valor)) medidos[chave] = valor;
  return JSON.stringify(canonico(medidos));
}

/** Os dados já constam em algum dos registros existentes? Um registro sem nenhum dado medido não conta. */
export function dadosJaRegistrados(
  dados: Record<string, unknown>,
  existentes: (Record<string, unknown> | null | undefined)[],
  /** Chaves dos campos de confirmação da ficha (`chavesDeConfirmacao`): não entram na comparação. */
  ignorar: ReadonlySet<string> = new Set()
): boolean {
  const alvo = assinaturaDosDados(dados, ignorar);
  if (alvo === "{}") return false;
  return existentes.some((e) => assinaturaDosDados(e, ignorar) === alvo);
}
