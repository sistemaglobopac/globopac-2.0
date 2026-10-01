// Verificação de caixas de transporte de aves vazias ANTES do tanque de imersão (lavagem das
// caixas) — funções PURAS. Testadas em tests/unit/caixasVazias.test.ts.
import type { CaixasVaziasValor } from "./tiposCompostos";

export function caixasVaziasVazio(): CaixasVaziasValor {
  return {
    todasVazias: null,
    caixasNaoVazias: "",
    acaoCorretiva: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

export function lerQuantidade(texto: string): number | null {
  const n = Number.parseInt(texto.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function avaliarCaixasVazias(v: CaixasVaziasValor): { conformidade: boolean; motivos: string[] } {
  if (v.todasVazias !== false) return { conformidade: true, motivos: [] };
  const qtd = lerQuantidade(v.caixasNaoVazias);
  const motivos = [`Caixas de transporte com aves/resíduos antes do tanque de imersão${qtd ? ` (${qtd} caixa${qtd > 1 ? "s" : ""})` : ""}`];
  if (v.acaoCorretiva.trim()) motivos.push(`Ação corretiva: ${v.acaoCorretiva.trim()}`);
  return { conformidade: false, motivos };
}

export function montarValorCaixasVazias(v: CaixasVaziasValor): CaixasVaziasValor {
  const { conformidade, motivos } = avaliarCaixasVazias(v);
  return {
    ...v,
    caixasNaoVazias: conformidade ? "" : v.caixasNaoVazias,
    acaoCorretiva: conformidade ? "" : v.acaoCorretiva,
    conformidade,
    detalhesRNC: motivos.length ? motivos.join("; ") : null,
  };
}

export function motivosBloqueioCaixasVazias(v: CaixasVaziasValor | undefined | null): string[] {
  const p = "Caixas de transporte";
  if (!v) return [`${p}: confirme se todas as caixas estão vazias antes do tanque de imersão.`];
  const m: string[] = [];
  if (v.todasVazias === null) m.push(`${p}: informe se todas as caixas estão vazias antes do tanque de imersão.`);
  if (v.todasVazias === false) {
    if (lerQuantidade(v.caixasNaoVazias) === null) m.push(`${p}: informe a quantidade de caixas não vazias.`);
    if (!v.acaoCorretiva.trim()) m.push(`${p}: descreva a ação corretiva (ex.: caixas retiradas e esvaziadas antes da imersão).`);
  }
  return m;
}
