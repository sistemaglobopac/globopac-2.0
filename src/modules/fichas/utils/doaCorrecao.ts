// Correção por adendo no monitoramento de Rastreabilidade e Controle de DOA: (1) recalcula o que é DERIVADO da carga (% de DOA,
// saldo, nota) e a SOMA do dia depois da correção — o adendo só troca o valor digitado; (2) descobre quais cargas corrigidas
// precisam seguir para as apurações seguintes do mesmo dia de abate (cada apuração guarda a própria cópia da carga e os totais).
// Quem grava os aditivos é useAssinarAdendo / a função do banco propagar_correcao_carga_doa. Testado em tests/unit/doaCorrecao.test.ts.

import { calcularCarga, montarValorDoa } from "../fields/rastreabilidadeDoa";
import type { CargaDoa } from "../fields/tiposCompostos";

/** Dados da carga que um adendo pode corrigir e que valem para as demais apurações do dia (a função do banco aceita só estes). */
export const PROPS_CARGA_DOA = ["avesRecebidas", "avesMortas", "pesoMedioKg", "placa", "penduraInicioEm", "gta", "integrado", "aviario", "nucleo"] as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** O valor do campo é o de Rastreabilidade e Controle de DOA? (lista de cargas + totais do dia) */
function ehValorDoa(v: unknown): v is Record<string, unknown> & { cargas: unknown[] } {
  return ehObjeto(v) && Array.isArray(v.cargas) && "totalRecebidas" in v && "totalMortas" in v;
}

/** Recalcula, em todo campo de DOA do registro, a % de DOA / saldo / nota de cada carga e os totais do dia (a SOMA). Não mexe
 * em cargas sem aves recebidas/mortas como texto ou sem `qtdPrevista` numérico (dado antigo): ficam como estão. */
export function recalcularDoaNoRegistro(dados: Record<string, unknown>): Record<string, unknown> {
  let resultado = dados;
  for (const [chave, valor] of Object.entries(dados)) {
    if (!ehValorDoa(valor)) continue;
    const cargas = valor.cargas.map((c) =>
      ehObjeto(c) && typeof c.qtdPrevista === "number" && typeof c.avesRecebidas === "string" && typeof c.avesMortas === "string" ? calcularCarga(c as unknown as CargaDoa) : c
    );
    const totais = montarValorDoa(typeof valor.dataAbate === "string" ? valor.dataAbate : "", cargas as CargaDoa[]);
    resultado = { ...resultado, [chave]: { ...valor, cargas, totalRecebidas: totais.totalRecebidas, totalMortas: totais.totalMortas, doaTotalPct: totais.doaTotalPct } };
  }
  return resultado;
}

export interface AjusteCargaDoa {
  /** Chave do campo de DOA no registro (ex.: "campo_1791000000000"). */
  campo: string;
  cargaId: string;
  prop: string;
  antigo: string;
  novo: string;
  dataAbate: string;
}

/** Correções do adendo que mexem num dado de CARGA do DOA, identificadas pela carga (não pela posição: a ordem das cargas muda
 * de uma apuração para outra). `dadosCorrigidos` é o registro já com a correção aplicada. */
export function ajustesDeCargaDoa(dadosCorrigidos: Record<string, unknown>, correcoes: Record<string, { old: unknown; new: unknown }>): AjusteCargaDoa[] {
  const saida: AjusteCargaDoa[] = [];
  for (const [caminho, c] of Object.entries(correcoes)) {
    const m = /^([^.]+)\.cargas\.(\d+)\.([A-Za-z]+)$/.exec(caminho);
    if (!m) continue;
    const [, campo, indice, prop] = m as unknown as [string, string, string, string];
    if (!(PROPS_CARGA_DOA as readonly string[]).includes(prop)) continue;
    const valor = dadosCorrigidos[campo];
    if (!ehValorDoa(valor)) continue;
    const carga = valor.cargas[Number(indice)];
    const cargaId = ehObjeto(carga) ? carga.cargaId : undefined;
    if (typeof cargaId !== "string" || !cargaId) continue;
    saida.push({ campo, cargaId, prop, antigo: c.old === null || c.old === undefined ? "" : String(c.old), novo: c.new === null || c.new === undefined ? "" : String(c.new), dataAbate: typeof valor.dataAbate === "string" ? valor.dataAbate : "" });
  }
  return saida;
}

/** Ajustes que se aplicam a um registro seguinte: mesmo dia de abate, a carga existe nele e o valor dela ainda é o antigo. */
export function ajustesQueSeAplicam(ajustes: AjusteCargaDoa[], dadosSeguinte: Record<string, unknown>): AjusteCargaDoa[] {
  return ajustes.filter((a) => {
    const valor = dadosSeguinte[a.campo];
    if (!ehValorDoa(valor) || (typeof valor.dataAbate === "string" ? valor.dataAbate : "") !== a.dataAbate) return false;
    const carga = valor.cargas.find((c) => ehObjeto(c) && c.cargaId === a.cargaId);
    if (!ehObjeto(carga)) return false;
    const atual = carga[a.prop];
    return (atual === null || atual === undefined ? "" : String(atual)).trim() === a.antigo.trim();
  });
}
