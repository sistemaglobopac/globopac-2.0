// Cálculos dos dois monitoramentos de absorção — funções PURAS (sem React), testadas em
// tests/unit/calculosAbsorcao.test.ts. São DOIS cálculos distintos, de propósito:
//   A) Teste de Absorção de Água: média por SOMA (ponderada), limite 8,0%.
//   B) Dripping Test (Portaria 210/1998): média ARITMÉTICA dos percentuais, limite 6,0% + tempo
//      mínimo de drenagem por linha.
// Não os unifique.
import type { AmostraAbsorcaoAgua, AmostraDrippingTest } from "./tiposCompostos";

export const LIMITE_ABSORCAO_AGUA = 8.0;
export const LIMITE_DRIPPING = 6.0;
export const LINHAS_ABSORCAO_AGUA = 10;
export const LINHAS_DRIPPING = 6;

/** Só é desvio quando ESTRITAMENTE maior que o limite. Arredonda antes de comparar para o erro
 * de ponto flutuante não reprovar um valor exatamente no limite (ex.: 10,000 → 10,800 dá
 * 8,000000000000007 em JavaScript, mas é 8,00% — CONFORME). */
export function acimaDoLimite(media: number, limite: number): boolean {
  return Math.round(media * 1e9) / 1e9 > limite;
}

/** Percentual com 2 casas no padrão pt-BR (ex.: 7,00%). */
export function formatarPercentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

// ---------------- A) Teste de Absorção de Água ----------------

export interface ResultadoAbsorcaoAgua {
  status: "conforme" | "nao-conforme";
  averagePercentage: number;
  validCount: number;
  sumInitial: number;
  sumFinal: number;
}

export function amostrasAbsorcaoIniciais(): AmostraAbsorcaoAgua[] {
  return Array.from({ length: LINHAS_ABSORCAO_AGUA }, (_, i) => ({ id: i, seal: "", initial: "", final: "" }));
}

/** Linha VÁLIDA = peso inicial e final numéricos E inicial > 0. O lacre não entra na validade. */
export function linhaAbsorcaoValida(item: Pick<AmostraAbsorcaoAgua, "initial" | "final"> & { descartada?: boolean }): boolean {
  if (item.descartada) return false; // carcaça descartada sai do cálculo
  const inicial = parseFloat(item.initial);
  const final = parseFloat(item.final);
  return !isNaN(inicial) && !isNaN(final) && inicial > 0;
}

/** % individual de UMA carcaça — só informativo (relatório impresso). A média oficial NÃO é a
 * média destes percentuais. */
export function percentualIndividualAbsorcao(item: Pick<AmostraAbsorcaoAgua, "initial" | "final">): number | null {
  const inicial = parseFloat(item.initial);
  const final = parseFloat(item.final);
  if (isNaN(inicial) || inicial <= 0 || isNaN(final)) return null;
  return ((final - inicial) / inicial) * 100;
}

/** MÉDIA POR SOMA: ((Σ final − Σ inicial) / Σ inicial) × 100 sobre as linhas válidas — o ganho
 * do peso TOTAL, nunca a média aritmética dos percentuais de cada carcaça. */
export function calcularAbsorcaoAgua(items: AmostraAbsorcaoAgua[]): ResultadoAbsorcaoAgua {
  let sumInitial = 0;
  let sumFinal = 0;
  let validCount = 0;
  for (const item of items) {
    if (!linhaAbsorcaoValida(item)) continue;
    sumInitial += parseFloat(item.initial);
    sumFinal += parseFloat(item.final);
    validCount++;
  }
  const averagePercentage = validCount > 0 ? ((sumFinal - sumInitial) / sumInitial) * 100 : 0;
  const status = validCount > 0 && acimaDoLimite(averagePercentage, LIMITE_ABSORCAO_AGUA) ? "nao-conforme" : "conforme";
  return { status, averagePercentage, validCount, sumInitial, sumFinal };
}

// ---------------- A2) Duas fases (pesagem inicial → pesagem final) ----------------

/** Linha com peso inicial > 0 (a que passa a exigir peso final ou descarte). */
export function linhaComPesoInicial(item: Pick<AmostraAbsorcaoAgua, "initial">): boolean {
  const inicial = parseFloat(item.initial);
  return !isNaN(inicial) && inicial > 0;
}

/** Fase 1 ("Salvar e finalizar depois"): ao menos 1 linha com lacre e peso inicial > 0; lacres
 * não repetidos; e nenhum peso final preenchido (o final entra na fase 2). Devolve os motivos que
 * impedem salvar (vazio = pode salvar). */
export function validarFaseInicial(items: AmostraAbsorcaoAgua[]): string[] {
  const motivos: string[] = [];
  const validas = items.filter((i) => i.seal.trim() !== "" && linhaComPesoInicial(i));
  if (validas.length === 0) motivos.push("Informe ao menos 1 carcaça com lacre e peso inicial maior que zero.");
  if (items.some((i) => i.final.trim() !== "")) {
    motivos.push("Para salvar e finalizar depois, deixe o peso final em branco — ele é informado na pesagem final.");
  }
  if (items.some((i) => linhaComPesoInicial(i) && i.seal.trim() === "")) {
    motivos.push("Toda carcaça com peso inicial precisa do lacre.");
  }
  const selos = validas.map((i) => i.seal.trim().toLowerCase());
  if (new Set(selos).size !== selos.length) motivos.push("Há lacres repetidos.");
  return motivos;
}

/** Fase 2 (finalizar): peso final em todas as linhas com peso inicial, exceto as descartadas (que
 * exigem motivo). Devolve os motivos que impedem finalizar. */
export function validarFinalizacao(items: AmostraAbsorcaoAgua[]): string[] {
  const motivos: string[] = [];
  for (const [i, item] of items.entries()) {
    if (!linhaComPesoInicial(item)) continue;
    const rotulo = item.seal.trim() || `linha ${i + 1}`;
    if (item.descartada) {
      if (!item.motivoDescarte?.trim()) motivos.push(`Informe o motivo do descarte da carcaça ${rotulo}.`);
    } else if (isNaN(parseFloat(item.final))) {
      motivos.push(`Informe o peso final da carcaça ${rotulo} (ou marque como descartada).`);
    }
  }
  if (!items.some((i) => linhaAbsorcaoValida(i))) motivos.push("Nenhuma carcaça válida para calcular a média de absorção.");
  return motivos;
}

/** Minutos desde a pesagem inicial (hora do SERVIDOR, `criado_em`) — para destacar quem está
 * "aguardando peso final há X min". */
export function minutosAguardandoPesoFinal(iniciadoEm: string, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - new Date(iniciadoEm).getTime()) / 60000));
}

/** A partir de quantos minutos a pesagem final em aberto é destacada como atrasada. */
export const ALERTA_PESAGEM_FINAL_MIN = 45;

// ---------------- B) Dripping Test ----------------

export interface ResultadoDrippingTest {
  items: AmostraDrippingTest[];
  status: "conforme" | "nao-conforme";
  averagePercentage: number;
  validCount: number;
  timeNonConformity: boolean;
}

export function amostrasDrippingIniciais(): AmostraDrippingTest[] {
  return Array.from({ length: LINHAS_DRIPPING }, (_, i) => ({ id: i, seal: "", m0: "", m1: "", m3: "", horaRetirada: "", m2: "" }));
}

/** Absorção da linha: (M0 − M1 − M2) / (M0 − M1 − M3) × 100. Válida = M0, M1, M3 e M2 numéricos E
 * (M0 − M1 − M3) > 0; senão null. */
export function absorcaoLinhaDripping(item: Pick<AmostraDrippingTest, "m0" | "m1" | "m2" | "m3">): number | null {
  const m0 = parseFloat(item.m0);
  const m1 = parseFloat(item.m1);
  const m2 = parseFloat(item.m2);
  const m3 = parseFloat(item.m3);
  if (isNaN(m0) || isNaN(m1) || isNaN(m2) || isNaN(m3)) return null;
  const base = m0 - m1 - m3;
  if (!(base > 0)) return null;
  return ((m0 - m1 - m2) / base) * 100;
}

/** Tempo mínimo de imersão/drenagem (MINUTOS) por peso bruto congelado (M0, gramas): a primeira
 * faixa em que M0 ≤ limite; acima de 2300 g, 168 + 7 × ceil((M0 − 2300) / 100). M0 vazio/inválido
 * → null (sem tempo exigido). */
export function tempoMinimoDrenagem(m0: number): number | null {
  if (!m0 || isNaN(m0)) return null;
  const faixas: [number, number][] = [
    [800, 65],
    [900, 72],
    [1000, 78],
    [1100, 85],
    [1200, 91],
    [1300, 98],
    [1400, 105],
    [1500, 112],
    [1600, 119],
    [1700, 126],
    [1800, 133],
    [1900, 140],
    [2000, 147],
    [2100, 154],
    [2200, 161],
    [2300, 168],
  ];
  for (const [limite, minutos] of faixas) {
    if (m0 <= limite) return minutos;
  }
  return 168 + 7 * Math.ceil((m0 - 2300) / 100);
}

/** "HH:MM" → minutos desde 00:00; vazio/inválido → null. */
export function minutosDaHora(hora: string): number | null {
  if (!hora) return null;
  const [h, m] = hora.split(":");
  const horas = Number(h);
  const minutos = Number(m);
  if (isNaN(horas) || isNaN(minutos)) return null;
  return horas * 60 + minutos;
}

/** Duração entre Hora Início e Retirada, tratando a virada da meia-noite (diff < 0 → + 1440). */
export function duracaoDrenagemMin(horaInicio: string, retirada: string): number | null {
  const inicio = minutosDaHora(horaInicio);
  const fim = minutosDaHora(retirada);
  if (inicio === null || fim === null) return null;
  let diff = fim - inicio;
  if (diff < 0) diff += 1440;
  return diff;
}

/** Só avalia se existirem Hora Início E Retirada da linha E M0 numérico. */
export function tempoNaoConforme(horaInicio: string, retirada: string, m0: string): boolean {
  const valorM0 = parseFloat(m0);
  if (!horaInicio || !retirada || isNaN(valorM0)) return false;
  const diff = duracaoDrenagemMin(horaInicio, retirada);
  const minimo = tempoMinimoDrenagem(valorM0);
  if (diff === null || minimo === null) return false;
  return diff < minimo;
}

/** MÉDIA ARITMÉTICA dos percentuais das linhas válidas. Status: nao-conforme se média > 6,0 OU
 * qualquer linha com tempo abaixo do mínimo — o tempo reprova mesmo com validCount = 0. */
export function calcularDrippingTest(items: AmostraDrippingTest[], horaInicio: string): ResultadoDrippingTest {
  let soma = 0;
  let validCount = 0;
  let timeNonConformity = false;

  const itemsComFlag = items.map((item) => {
    const absorcao = absorcaoLinhaDripping(item);
    if (absorcao !== null) {
      soma += absorcao;
      validCount++;
    }
    const timeNc = tempoNaoConforme(horaInicio, item.horaRetirada, item.m0);
    if (timeNc) timeNonConformity = true;
    return { ...item, timeNc };
  });

  const averagePercentage = validCount > 0 ? soma / validCount : 0;
  const limiteExcedido = validCount > 0 && acimaDoLimite(averagePercentage, LIMITE_DRIPPING);
  const status = limiteExcedido || timeNonConformity ? "nao-conforme" : "conforme";
  return { items: itemsComFlag, status, averagePercentage, validCount, timeNonConformity };
}

/** Texto do selo vermelho do Dripping Test (um dos três). */
export function textoSeloDripping(averagePercentage: number, timeNonConformity: boolean): string {
  const acima = acimaDoLimite(averagePercentage, LIMITE_DRIPPING);
  if (acima && timeNonConformity) return "ACIMA DE 6 E TEMPO INFERIOR";
  if (acima) return "ACIMA DE 6%";
  return "TEMPO INFERIOR À META";
}

// ---------------- Dripping Test: fases ----------------

/** Fase 1 do Dripping Test = ainda sem nenhuma Retirada nem M2 (só lote, lacre, M0, M1 e M3). Ao
 * preencher Retirada/M2 o teste entra na fase 2 (finalização, com "Criar e assinar"). */
export function drippingEmFase1(items: Pick<AmostraDrippingTest, "horaRetirada" | "m2">[] | undefined): boolean {
  return !(items ?? []).some((i) => i.horaRetirada.trim() !== "" || i.m2.trim() !== "");
}

/** Fase 1 só pode ser salva com ao menos 1 linha com lacre e M0 preenchidos. Devolve o motivo (ou null). */
export function validarPrimeiraEtapaDripping(items: Pick<AmostraDrippingTest, "seal" | "m0">[]): string | null {
  const ok = items.some((i) => i.seal.trim() !== "" && !isNaN(parseFloat(i.m0)) && parseFloat(i.m0) > 0);
  return ok ? null : "Preencha ao menos 1 carcaça com lacre e M0 antes de salvar a 1ª etapa.";
}
