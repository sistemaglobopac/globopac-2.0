// Monitoramento de Rastreabilidade e Controle de DOA (Dead On Arrival) — funções PURAS (sem React):
// ordem de pendura, % de DOA por carga e nota de correção de saldo da GTA. Testadas em
// tests/unit/rastreabilidadeDoa.test.ts.
import type { CargaDoa, RastreabilidadeDoaValor } from "./tiposCompostos";

/** Carga do dia como devolvida por `cargas_rastreabilidade_do_dia` (dados herdados). */
export interface CargaHerdadaDoa {
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtdPrevista: number;
  placa: string;
  /** Peso médio das aves (kg), herdado do monitoramento de Peso por Caixa. */
  pesoMedioKg?: string;
  /** `YYYY-MM-DDTHH:mm`; vazio = recepção ainda não registrou a pendura desta carga. */
  penduraInicioEm: string;
}

export interface EntradaDoa {
  avesRecebidas: string;
  avesMortas: string;
}

/** Fração de aves a menos que exige documento de correção de saldo: 10% ou mais abaixo da GTA. */
export const PERCENTUAL_FALTA_CORRECAO = 10;

export function doaVazio(dataAbate = ""): RastreabilidadeDoaValor {
  return { dataAbate, cargas: [], totalRecebidas: 0, totalMortas: 0, doaTotalPct: null, conformidade: true, detalhesRNC: null };
}

/** Inteiro >= 0 (zero é válido: nenhuma ave morta). null se vazio ou inválido. */
export function lerContagem(texto: string | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

/** % de DOA = mortas ÷ recebidas × 100 (2 casas). Recebidas inclui as mortas: é tudo o que chegou. */
export function doaPercentual(mortas: number | null, recebidas: number | null): number | null {
  if (mortas === null || recebidas === null || recebidas <= 0) return null;
  return Math.round((mortas / recebidas) * 10000) / 100;
}

export function formatarPctDoa(pct: number | null | undefined): string {
  return pct === null || pct === undefined ? "—" : `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

const fmtInt = (n: number) => n.toLocaleString("pt-BR");

/** Nota de documento de correção de saldo: ao menos 1 ave a mais que a GTA, ou 10% (ou mais) a menos.
 * Aritmética inteira para o limite de 10% não sofrer com ponto flutuante. */
export function notaCorrecaoSaldo(prevista: number, recebidas: number | null): string | null {
  if (recebidas === null || prevista <= 0) return null;
  if (recebidas > prevista) {
    const mais = recebidas - prevista;
    return `Vieram ${fmtInt(mais)} ave${mais > 1 ? "s" : ""} a mais que as ${fmtInt(prevista)} previstas na GTA: necessário documento de correção do saldo.`;
  }
  if (recebidas * 100 <= prevista * (100 - PERCENTUAL_FALTA_CORRECAO)) {
    const menos = prevista - recebidas;
    const pct = Math.round((menos / prevista) * 10000) / 100;
    return `Vieram ${fmtInt(menos)} ave${menos > 1 ? "s" : ""} a menos (${pct.toLocaleString("pt-BR")}%) que as ${fmtInt(prevista)} previstas na GTA: necessário documento de correção do saldo.`;
  }
  return null;
}

/** Calcula os campos derivados de uma carga a partir do que o inspetor digitou. */
export function calcularCarga<T extends Pick<CargaDoa, "qtdPrevista" | "avesRecebidas" | "avesMortas">>(c: T): T & Pick<CargaDoa, "doaPct" | "saldoDiferenca" | "notaSaldo"> {
  const recebidas = lerContagem(c.avesRecebidas);
  const mortas = lerContagem(c.avesMortas);
  return {
    ...c,
    doaPct: doaPercentual(mortas, recebidas),
    saldoDiferenca: recebidas === null ? null : recebidas - c.qtdPrevista,
    notaSaldo: notaCorrecaoSaldo(c.qtdPrevista, recebidas),
  };
}

/** Dados herdados de uma carga já gravada em apuração anterior (travada) preferem o que ficou gravado
 * — inclusive correções feitas por adendo (peso médio, placa, início da pendura/hora do abate) —, e só recorrem ao herdado fresco se o
 * gravado estiver vazio. Para a carga ainda editável vale o herdado fresco, com o gravado desta
 * própria ficha como reserva. Assim nenhuma informação já registrada some em apurações seguintes. */
export function herdarComRegistradas(herdada: CargaHerdadaDoa, anterior?: CargaDoa, propria?: CargaDoa): CargaHerdadaDoa {
  const escolher = (fresco: string | undefined, gravado: string | undefined, travada: boolean) =>
    (travada ? gravado || fresco : fresco || gravado) || "";
  const travada = anterior !== undefined;
  const gravada = anterior ?? propria;
  return {
    ...herdada,
    placa: escolher(herdada.placa, gravada?.placa, travada),
    pesoMedioKg: escolher(herdada.pesoMedioKg, gravada?.pesoMedioKg, travada),
    penduraInicioEm: escolher(herdada.penduraInicioEm, gravada?.penduraInicioEm, travada),
  };
}

/** Carga programada que ainda não chegou: sem pendura iniciada e nada digitado. Aparece no DOA como
 * "aguardando chegada" e não trava a assinatura do que já foi apurado. */
export function cargaAguardando(c: Pick<CargaDoa, "penduraInicioEm" | "avesRecebidas" | "avesMortas">): boolean {
  return !c.penduraInicioEm && !c.avesRecebidas.trim() && !c.avesMortas.trim();
}

/** Monta as linhas do monitoramento: dados herdados (frescos, da recepção) + o que o inspetor já
 * digitou. TODAS as cargas programadas do dia entram, para o DOA refletir a programação inteira: as que
 * já começaram a ser penduradas vêm primeiro, em ordem crescente de início da pendura; as que ainda
 * não chegaram ficam depois, "aguardando chegada". Linhas salvas antes que não voltaram da consulta
 * (carga removida da programação) são mantidas. */
export function montarCargas(herdadas: CargaHerdadaDoa[], entradas: Record<string, EntradaDoa>, salvas: CargaDoa[] = []): CargaDoa[] {
  const comPendura = herdadas.filter((h) => h.penduraInicioEm).sort((a, b) => a.penduraInicioEm.localeCompare(b.penduraInicioEm));
  const ordem = new Map(comPendura.map((h, i) => [h.cargaId, i + 1]));
  const linhas: CargaDoa[] = herdadas
    .map((h) =>
      calcularCarga({
        cargaId: h.cargaId,
        ordemPendura: ordem.get(h.cargaId) ?? null,
        penduraInicioEm: h.penduraInicioEm,
        placa: h.placa,
        pesoMedioKg: h.pesoMedioKg ?? "",
        gta: h.gta,
        integrado: h.integrado,
        aviario: h.aviario,
        nucleo: h.nucleo,
        qtdPrevista: h.qtdPrevista,
        avesRecebidas: entradas[h.cargaId]?.avesRecebidas ?? "",
        avesMortas: entradas[h.cargaId]?.avesMortas ?? "",
      })
    );

  const idsAtuais = new Set(herdadas.map((h) => h.cargaId));
  const orfas = salvas.filter((s) => !idsAtuais.has(s.cargaId)).map((s) => calcularCarga({ ...s, ...(entradas[s.cargaId] ?? {}) }));

  const ordenadas = [...linhas, ...orfas];
  // Estável: as sem pendura (ordem nula) ficam no fim, na ordem em que a programação as devolveu.
  ordenadas.sort((a, b) => (a.ordemPendura ?? Infinity) - (b.ordemPendura ?? Infinity));
  return ordenadas;
}

export function montarValorDoa(dataAbate: string, cargas: CargaDoa[]): RastreabilidadeDoaValor {
  let totalRecebidas = 0;
  let totalMortas = 0;
  for (const c of cargas) {
    const r = lerContagem(c.avesRecebidas);
    const m = lerContagem(c.avesMortas);
    if (r !== null && m !== null) {
      totalRecebidas += r;
      totalMortas += m;
    }
  }
  return {
    dataAbate,
    cargas,
    totalRecebidas,
    totalMortas,
    doaTotalPct: doaPercentual(totalMortas, totalRecebidas),
    conformidade: true,
    detalhesRNC: null,
  };
}

/** Motivos que impedem assinar: toda carga que já chegou (pendura iniciada ou algo digitado) precisa de aves
 * recebidas e mortas coerentes. Carga "aguardando chegada" não trava, mas ao menos uma carga precisa ter
 * chegado para haver o que apurar. */
export function motivosBloqueioDoa(v: RastreabilidadeDoaValor | undefined | null): string[] {
  const p = "DOA";
  if (!v || !v.cargas || v.cargas.length === 0) {
    return [`${p}: nenhuma carga programada para esta data — cadastre a programação ou escolha outra data.`];
  }
  const chegadas = v.cargas.filter((c) => !cargaAguardando(c));
  if (chegadas.length === 0) {
    return [`${p}: nenhuma carga chegou ainda (sem pendura iniciada) — registre a recepção de aves ou aguarde a chegada.`];
  }
  const m: string[] = [];
  for (const c of chegadas) {
    const nome = `GTA ${c.gta || "?"}`;
    const recebidas = lerContagem(c.avesRecebidas);
    const mortas = lerContagem(c.avesMortas);
    if (recebidas === null || recebidas <= 0) m.push(`${p}: informe a quantidade de aves que vieram na carga (${nome}).`);
    if (mortas === null) m.push(`${p}: informe a quantidade de aves mortas (${nome}); use 0 se não houve.`);
    if (recebidas !== null && mortas !== null && mortas > recebidas) m.push(`${p}: aves mortas (${mortas}) maior que as recebidas (${recebidas}) na ${nome}.`);
  }
  return m;
}
