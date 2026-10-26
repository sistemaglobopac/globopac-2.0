// Monitoramentos de Recebimento de Embalagens — bobina (primárias e terciárias), sacos (primárias) e
// secundárias (caixas) — funções PURAS (sem React). O inspetor informa o fornecedor, a nota fiscal, as
// condições higiênicas do veículo e das embalagens, o rótulo (bobina e sacos, quando houver), a quantidade,
// o código, o relatório de ensaio, o lote e as medidas das amostras; nas secundárias, ainda o teste de
// resina e a absorção de água. Qualquer resposta de desvio torna o registro NÃO CONFORME; as medidas são só
// registradas (a tolerância de cada embalagem vem da ficha técnica, que o sistema não tem). Testadas em
// tests/unit/recebimentoEmbalagens.test.ts.
import type { AmostraEmbalagem, AvaliacaoSatisfatoria, RecebimentoEmbalagensValor, SituacaoLoteEmbalagem } from "./tiposCompostos";

export type VarianteEmbalagem = "bobina" | "sacos" | "secundarias";

export type MedidaEmbalagem = keyof AmostraEmbalagem;

/** Medidas de cada amostra, na ordem das colunas. */
export const ROTULOS_MEDIDA: Record<MedidaEmbalagem, string> = {
  largura: "Largura (mm)",
  comprimento: "Comprimento (mm)",
  altura: "Altura (mm)",
  micragem: "Micragem (µm)",
  peso: "Peso (g)",
};

const NOMES_MEDIDA: Record<MedidaEmbalagem, string> = { largura: "largura", comprimento: "comprimento", altura: "altura", micragem: "micragem", peso: "peso" };

interface ConfigVariante {
  qtdAmostras: number;
  medidas: MedidaEmbalagem[];
  /** Pergunta do rótulo (e das respostas que ele abre). */
  rotulo: boolean;
  /** Teste de resina e absorção de água (caixas). */
  testeCaixa: boolean;
}

/** Bobina: 10 amostras de largura e micragem. Sacos: 30 de largura, comprimento e micragem. Secundárias: 32 de
 * largura, comprimento, altura, micragem e peso. */
export const VARIANTES_EMBALAGEM: Record<VarianteEmbalagem, ConfigVariante> = {
  bobina: { qtdAmostras: 10, medidas: ["largura", "micragem"], rotulo: true, testeCaixa: false },
  sacos: { qtdAmostras: 30, medidas: ["largura", "comprimento", "micragem"], rotulo: true, testeCaixa: false },
  secundarias: { qtdAmostras: 32, medidas: ["largura", "comprimento", "altura", "micragem", "peso"], rotulo: false, testeCaixa: true },
};

export const QTD_AMOSTRAS_EMBALAGEM = VARIANTES_EMBALAGEM.bobina.qtdAmostras;

/** Variante do tipo de campo do Construtor (`recebimento_sacos`, `recebimento_secundarias`; os demais = bobina). */
export function varianteDoTipo(tipo: string): VarianteEmbalagem {
  if (tipo === "recebimento_sacos") return "sacos";
  if (tipo === "recebimento_secundarias") return "secundarias";
  return "bobina";
}

export const SITUACOES_LOTE: { valor: Exclude<SituacaoLoteEmbalagem, "">; rotulo: string }[] = [
  { valor: "aprovado", rotulo: "Aprovado" },
  { valor: "reprovado", rotulo: "Reprovado" },
  { valor: "utilizado", rotulo: "Utilizado" },
];

export function rotuloSituacaoLote(s: SituacaoLoteEmbalagem | undefined): string {
  return SITUACOES_LOTE.find((x) => x.valor === s)?.rotulo ?? "—";
}

export const AVALIACOES: { valor: Exclude<AvaliacaoSatisfatoria, "">; rotulo: string }[] = [
  { valor: "satisfatoria", rotulo: "Satisfatória" },
  { valor: "insatisfatoria", rotulo: "Insatisfatória" },
];

export function recebimentoEmbalagensVazio(variante: VarianteEmbalagem = "bobina"): RecebimentoEmbalagensValor {
  const cfg = VARIANTES_EMBALAGEM[variante];
  const amostra = (): AmostraEmbalagem => Object.fromEntries(cfg.medidas.map((m) => [m, ""])) as unknown as AmostraEmbalagem;
  return {
    fornecedor: "",
    notaFiscal: "",
    contaminacaoFisica: null,
    contaminacaoQuimica: null,
    condensacao: null,
    higieneGeral: "",
    temRotulo: null,
    leiauteConforme: null,
    descricaoProduto: null,
    qualidadeImpressao: "",
    quantidadeRecebida: "",
    codigoEmbalagem: "",
    relatorioEnsaio: null,
    aplicacaoResina: null,
    absorcaoAgua: null,
    lote: "",
    situacaoLote: "",
    amostras: Array.from({ length: cfg.qtdAmostras }, amostra),
    conformidade: true,
    detalhesRNC: null,
  };
}

/** "12,5" ou "12.5" → 12.5; vazio, inválido ou ≤ 0 → null. */
export function lerMedidaEmbalagem(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim().replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export interface DesvioEmbalagem {
  /** Caminho do dado dentro do campo (o mesmo formato do adendo). */
  chave: string;
  motivo: string;
}

/** Respostas que são desvio, na ordem em que aparecem na tela. Perguntas que a variante não faz ficam sem resposta
 * (null) e nunca são desvio. */
export function desviosRecebimentoEmbalagens(v: RecebimentoEmbalagensValor): DesvioEmbalagem[] {
  const d: DesvioEmbalagem[] = [];
  if (v.contaminacaoFisica === true) d.push({ chave: "contaminacaoFisica", motivo: "Contaminação física no compartimento de cargas do veículo (cabelo, metal, vidro, madeira ou terra)" });
  if (v.contaminacaoQuimica === true) d.push({ chave: "contaminacaoQuimica", motivo: "Contaminação química no compartimento de cargas do veículo (resíduos de substância)" });
  if (v.condensacao === true) d.push({ chave: "condensacao", motivo: "Condensação, resíduos orgânicos, umidade, sujidades ou insetos no veículo" });
  if (v.higieneGeral === "insatisfatoria") d.push({ chave: "higieneGeral", motivo: "Condições gerais de higiene do veículo e das embalagens insatisfatórias" });
  if (v.temRotulo === true) {
    if (v.leiauteConforme === false) d.push({ chave: "leiauteConforme", motivo: "Leiaute do rótulo diferente da ficha técnica da embalagem" });
    if (v.descricaoProduto === false) d.push({ chave: "descricaoProduto", motivo: "Rótulo sem a descrição dos produtos" });
    if (v.qualidadeImpressao === "insatisfatoria") d.push({ chave: "qualidadeImpressao", motivo: "Qualidade da impressão do rótulo insatisfatória" });
  }
  if (v.relatorioEnsaio === false) d.push({ chave: "relatorioEnsaio", motivo: "Embalagem recebida sem relatório de ensaio de qualidade" });
  if (v.aplicacaoResina === false) d.push({ chave: "aplicacaoResina", motivo: "Teste de resina: sem aplicação de resina na caixa" });
  if (v.absorcaoAgua === true) d.push({ chave: "absorcaoAgua", motivo: "Absorção de água em parte da caixa" });
  if (v.situacaoLote === "reprovado") d.push({ chave: "situacaoLote", motivo: "Lote de embalagem reprovado" });
  return d;
}

export function avaliarRecebimentoEmbalagens(v: RecebimentoEmbalagensValor): { conformidade: boolean; motivos: string[] } {
  const motivos = desviosRecebimentoEmbalagens(v).map((x) => x.motivo);
  return { conformidade: motivos.length === 0, motivos };
}

/** Grava o veredito no valor e descarta as respostas do rótulo quando a embalagem não tem rótulo. */
export function montarValorRecebimentoEmbalagens(v: RecebimentoEmbalagensValor): RecebimentoEmbalagensValor {
  const semRotulo = v.temRotulo !== true;
  const base: RecebimentoEmbalagensValor = semRotulo ? { ...v, leiauteConforme: null, descricaoProduto: null, qualidadeImpressao: "" } : v;
  const { conformidade, motivos } = avaliarRecebimentoEmbalagens(base);
  return { ...base, conformidade, detalhesRNC: motivos.length ? motivos.join("; ") : null };
}

export interface EstatisticaMedida {
  n: number;
  min: number | null;
  max: number | null;
  media: number | null;
}

function estatistica(valores: (number | null)[]): EstatisticaMedida {
  const ok = valores.filter((x): x is number => x !== null);
  if (ok.length === 0) return { n: 0, min: null, max: null, media: null };
  return { n: ok.length, min: Math.min(...ok), max: Math.max(...ok), media: ok.reduce((a, b) => a + b, 0) / ok.length };
}

/** Menor, maior e média de cada medida entre as amostras já medidas (n = 0 nas medidas que a variante não tem). */
export function estatisticasAmostras(v: Pick<RecebimentoEmbalagensValor, "amostras">): Record<MedidaEmbalagem, EstatisticaMedida> {
  const amostras = v.amostras ?? [];
  const de = (m: MedidaEmbalagem) => estatistica(amostras.map((a) => lerMedidaEmbalagem(a[m])));
  return { largura: de("largura"), comprimento: de("comprimento"), altura: de("altura"), micragem: de("micragem"), peso: de("peso") };
}

export function formatarMedida(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** "largura e micragem", "largura, comprimento e micragem"... */
function listarMedidas(medidas: MedidaEmbalagem[]): string {
  const nomes = medidas.map((m) => NOMES_MEDIDA[m]);
  return nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** O que falta para assinar (nenhum campo visível pode ficar em branco). */
export function motivosBloqueioRecebimentoEmbalagens(v: RecebimentoEmbalagensValor | undefined | null, variante: VarianteEmbalagem = "bobina"): string[] {
  const cfg = VARIANTES_EMBALAGEM[variante];
  const p = "Recebimento de embalagens";
  if (!v) return [`${p}: preencha o monitoramento (fornecedor, condições do veículo, embalagem e medições).`];
  const m: string[] = [];
  if (!v.fornecedor.trim()) m.push(`${p}: informe o nome do fornecedor.`);
  if (!(v.notaFiscal ?? "").trim()) m.push(`${p}: informe o número da nota fiscal.`);
  if (v.contaminacaoFisica === null) m.push(`${p}: informe se há contaminação física no compartimento de cargas.`);
  if (v.contaminacaoQuimica === null) m.push(`${p}: informe se há contaminação química.`);
  if (v.condensacao === null) m.push(`${p}: informe se há condensação, resíduos orgânicos, umidade, sujidades ou insetos.`);
  if (v.higieneGeral === "") m.push(`${p}: avalie as condições gerais de higiene do veículo e das embalagens.`);
  if (cfg.rotulo) {
    if (v.temRotulo === null) m.push(`${p}: informe se há rótulo na embalagem.`);
    if (v.temRotulo === true) {
      if (v.leiauteConforme === null) m.push(`${p}: informe se o leiaute está de acordo com a ficha técnica da embalagem.`);
      if (v.descricaoProduto === null) m.push(`${p}: informe se há a descrição dos produtos no rótulo.`);
      if (v.qualidadeImpressao === "") m.push(`${p}: avalie a qualidade da impressão.`);
    }
  }
  if (lerMedidaEmbalagem(v.quantidadeRecebida) === null) m.push(`${p}: informe a quantidade recebida.`);
  if (!v.codigoEmbalagem.trim()) m.push(`${p}: informe o código da embalagem.`);
  if (v.relatorioEnsaio === null) m.push(`${p}: informe se acompanha relatório de ensaio de qualidade.`);
  if (cfg.testeCaixa) {
    if ((v.aplicacaoResina ?? null) === null) m.push(`${p}: informe se há aplicação de resina (teste de resina).`);
    if ((v.absorcaoAgua ?? null) === null) m.push(`${p}: informe se houve absorção de água em alguma parte da caixa.`);
  }
  if (!(v.lote ?? "").trim()) m.push(`${p}: informe o número do lote.`);
  if (v.situacaoLote === "") m.push(`${p}: informe se o lote está aprovado, reprovado ou utilizado.`);
  const amostras = v.amostras ?? [];
  const faltando: number[] = [];
  for (let i = 0; i < cfg.qtdAmostras; i++) {
    const a = amostras[i];
    if (!a || cfg.medidas.some((medida) => lerMedidaEmbalagem(a[medida]) === null)) faltando.push(i + 1);
  }
  if (faltando.length) m.push(`${p}: informe ${listarMedidas(cfg.medidas)} das amostras ${faltando.join(", ")}.`);
  return m;
}
