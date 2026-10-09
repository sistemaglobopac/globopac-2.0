// Consumo de ÁGUA do pré-resfriamento (Painel de BI) — funções PURAS, sem React nem Supabase, para que
// as regras fiquem num só lugar e possam ser testadas (tests/unit/consumoAgua.test.ts).
//
// Fonte: as leituras de hidrômetro (m³) gravadas em dados_dinamicos pelos 4 monitoramentos de água
// (SPR Carcaças, SPR Partes, SPR Miúdos e Chuveiro Final — ver fichas/fields/tiposCompostos.ts).
// Consumo de um ponto num monitoramento = leitura atual − leitura anterior. SÓ ÁGUA: o gelo (kg ≈ L)
// que o SPR soma ao litro apurado (aguaUsadaLitros) NÃO entra aqui.
//
// Hora a hora: o hidrômetro é lido a cada monitoramento, não de hora em hora. O volume de uma leitura é
// o consumo do intervalo desde a leitura anterior do mesmo ponto; ele é distribuído proporcionalmente
// nas horas do relógio (Manaus) que o intervalo cobre, e só então somado por dia/semana/mês.
import { parseNumeroHidrometro } from "@/modules/fichas/fields/hidrometro";
import { instanteDoRegistro } from "@/modules/fichas/utils/horaMonitoramento";

export type SistemaAgua = "carcacas" | "partes" | "miudos" | "chuveiro";
export type TipoCampoAgua = "chiller_carcacas" | "chiller_partes" | "mini_chillers" | "lavagem_final";

export interface PontoAgua {
  id: string;
  /** Nome curto do ponto, usado sob o cabeçalho do sistema. */
  rotulo: string;
  sistema: SistemaAgua;
  tipoCampo: TipoCampoAgua;
  /** Caminho do `{ prev, cur }` dentro do valor do campo composto. */
  caminho: string[];
}

export const TIPOS_CAMPO_AGUA: TipoCampoAgua[] = ["chiller_carcacas", "chiller_partes", "mini_chillers", "lavagem_final"];

export const SISTEMAS_AGUA: Record<SistemaAgua, { rotulo: string; chiller: boolean }> = {
  carcacas: { rotulo: "SPR Carcaças", chiller: true },
  partes: { rotulo: "SPR Partes", chiller: true },
  miudos: { rotulo: "Mini-chillers de Miúdos", chiller: true },
  chuveiro: { rotulo: "Chuveiro Final", chiller: false },
};

/** Todos os pontos com hidrômetro, na ordem em que aparecem nas tabelas. */
export const PONTOS_AGUA: PontoAgua[] = [
  { id: "carcacas.preChiller", rotulo: "Pré-chiller", sistema: "carcacas", tipoCampo: "chiller_carcacas", caminho: ["tanques", "preChiller"] },
  { id: "carcacas.chiller1", rotulo: "Chiller 01", sistema: "carcacas", tipoCampo: "chiller_carcacas", caminho: ["tanques", "chiller1"] },
  { id: "carcacas.chiller2", rotulo: "Chiller 02 (último)", sistema: "carcacas", tipoCampo: "chiller_carcacas", caminho: ["tanques", "chiller2"] },
  { id: "partes.chiller1", rotulo: "Chiller 01", sistema: "partes", tipoCampo: "chiller_partes", caminho: ["tanques", "chiller1"] },
  { id: "partes.chiller2", rotulo: "Chiller 02", sistema: "partes", tipoCampo: "chiller_partes", caminho: ["tanques", "chiller2"] },
  { id: "miudos.coracao", rotulo: "Coração", sistema: "miudos", tipoCampo: "mini_chillers", caminho: ["tanques", "coracao"] },
  { id: "miudos.moela", rotulo: "Moela", sistema: "miudos", tipoCampo: "mini_chillers", caminho: ["tanques", "moela"] },
  { id: "miudos.figado", rotulo: "Fígado", sistema: "miudos", tipoCampo: "mini_chillers", caminho: ["tanques", "figado"] },
  { id: "miudos.cabeca", rotulo: "Cabeça", sistema: "miudos", tipoCampo: "mini_chillers", caminho: ["tanques", "cabeca"] },
  { id: "miudos.pes", rotulo: "Pés", sistema: "miudos", tipoCampo: "mini_chillers", caminho: ["tanques", "pes"] },
  { id: "chuveiro.final", rotulo: "Chuveiro Final", sistema: "chuveiro", tipoCampo: "lavagem_final", caminho: ["chuveiro"] },
];

export interface RegistroAgua {
  id: string;
  ficha_template_id: string;
  setor: string;
  criado_em: string;
  hora_monitoramento: string | null;
  aditivo_de: string | null;
  dados_dinamicos: Record<string, unknown> | null;
}

export interface TemplateAgua {
  id: string;
  codigo: string;
  schema_campos: { chave: string; tipo: string }[];
}

/** Consumo de um ponto entre duas leituras. `inicio` nulo = não se sabe quando a leitura anterior foi feita
 * (ou foi há tempo demais): o volume é atribuído à hora da leitura, sem distribuir. */
export interface EventoConsumo {
  pontoId: string;
  registroId: string;
  inicio: number | null;
  fim: number;
  m3: number;
}

export interface ResultadoEventos {
  eventos: EventoConsumo[];
  /** Instantes das leituras com valor atual MENOR que o anterior (erro de digitação/troca de hidrômetro): ficam fora do total. */
  descartadasEm: number[];
}

/** Intervalo máximo (h) entre duas leituras para distribuir o volume nas horas do meio. Acima disso a leitura
 * anterior é de outro período (ex.: continuação do dia anterior) e o volume fica na hora da leitura. */
export const INTERVALO_MAXIMO_HORAS = 6;

const MS_HORA = 3_600_000;
const MS_DIA = 24 * MS_HORA;
/** America/Manaus é UTC−4 fixo (sem horário de verão) — mesma premissa de horaMonitoramento.ts. */
const DESLOCAMENTO_MANAUS_MS = -4 * MS_HORA;

const arredondar = (n: number) => Math.round(n * 1e6) / 1e6;

/** Chave do campo de cada tipo de monitoramento de água nesta versão da ficha. */
function chavesDeAgua(template: TemplateAgua | undefined): Partial<Record<TipoCampoAgua, string>> {
  const chaves: Partial<Record<TipoCampoAgua, string>> = {};
  for (const campo of template?.schema_campos ?? []) {
    if ((TIPOS_CAMPO_AGUA as string[]).includes(campo.tipo) && !chaves[campo.tipo as TipoCampoAgua]) {
      chaves[campo.tipo as TipoCampoAgua] = campo.chave;
    }
  }
  return chaves;
}

/** Descarta de `registros` o que foi corrigido por aditivo: o aditivo é uma cópia completa e corrigida do
 * original (ver useAssinarAdendo), então vale o aditivo mais recente e o original sai — senão o consumo
 * contaria duas vezes. */
export function resolverAditivos(registros: RegistroAgua[]): RegistroAgua[] {
  const ultimoAditivo = new Map<string, RegistroAgua>();
  for (const r of registros) {
    if (!r.aditivo_de) continue;
    const atual = ultimoAditivo.get(r.aditivo_de);
    if (!atual || r.criado_em > atual.criado_em) ultimoAditivo.set(r.aditivo_de, r);
  }
  return registros.filter((r) => (r.aditivo_de ? ultimoAditivo.get(r.aditivo_de) === r : !ultimoAditivo.has(r.id)));
}

function lerLeitura(valor: unknown, caminho: string[]): { prev: string; cur: string } | null {
  let atual: unknown = valor;
  for (const passo of caminho) {
    if (typeof atual !== "object" || atual === null) return null;
    atual = (atual as Record<string, unknown>)[passo];
  }
  if (typeof atual !== "object" || atual === null) return null;
  const { prev, cur } = atual as { prev?: unknown; cur?: unknown };
  const texto = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
  return { prev: texto(prev), cur: texto(cur) };
}

/** Consumos (m³) de todos os pontos, um por leitura apurada. Mesma regra do SPR: sem leitura atual ou sem leitura
 * anterior (1º monitoramento do dia) não há consumo a contar. */
export function calcularEventos(registros: RegistroAgua[], templates: Map<string, TemplateAgua>): ResultadoEventos {
  const series = new Map<string, { instante: number; criado: string; registro: RegistroAgua; chaves: Partial<Record<TipoCampoAgua, string>> }[]>();
  for (const registro of resolverAditivos(registros)) {
    const template = templates.get(registro.ficha_template_id);
    if (!template) continue;
    const chaves = chavesDeAgua(template);
    if (Object.keys(chaves).length === 0) continue;
    const instante = new Date(instanteDoRegistro(registro)).getTime();
    if (Number.isNaN(instante)) continue;
    // Uma "série" é a mesma ficha (todas as versões, pelo código) no mesmo setor: é nela que a leitura anterior é herdada.
    const serie = `${template.codigo}|${registro.setor}`;
    const lista = series.get(serie) ?? [];
    lista.push({ instante, criado: registro.criado_em, registro, chaves });
    series.set(serie, lista);
  }

  const eventos: EventoConsumo[] = [];
  const descartadasEm: number[] = [];
  for (const lista of series.values()) {
    lista.sort((a, b) => a.instante - b.instante || (a.criado < b.criado ? -1 : 1));
    for (const ponto of PONTOS_AGUA) {
      let leituraAnteriorEm: number | null = null;
      for (const { instante, registro, chaves } of lista) {
        const chave = chaves[ponto.tipoCampo];
        if (!chave) continue;
        const leitura = lerLeitura(registro.dados_dinamicos?.[chave], ponto.caminho);
        if (!leitura || !(parseNumeroHidrometro(leitura.cur) > 0)) continue;

        const inicioConhecido = leituraAnteriorEm !== null && instante > leituraAnteriorEm && instante - leituraAnteriorEm <= INTERVALO_MAXIMO_HORAS * MS_HORA;
        const inicio = inicioConhecido ? leituraAnteriorEm : null;
        leituraAnteriorEm = instante;
        if (leitura.prev === "") continue; // 1º monitoramento do dia: só marca o ponto de partida

        const m3 = arredondar(parseNumeroHidrometro(leitura.cur) - parseNumeroHidrometro(leitura.prev));
        if (m3 < 0) {
          descartadasEm.push(instante);
          continue;
        }
        eventos.push({ pontoId: ponto.id, registroId: registro.id, inicio, fim: instante, m3 });
      }
    }
  }
  return { eventos, descartadasEm };
}

// ---------------------------------------------------------------------------------------------
// Tempo (America/Manaus)
// ---------------------------------------------------------------------------------------------

/** Início (UTC ms) da hora do relógio de Manaus que contém `t`. */
export function inicioDaHora(t: number): number {
  return Math.floor((t + DESLOCAMENTO_MANAUS_MS) / MS_HORA) * MS_HORA - DESLOCAMENTO_MANAUS_MS;
}

export type Granularidade = "hora" | "dia" | "semana" | "mes";

/** Início do bucket (hora/dia/semana de segunda a domingo/mês) de Manaus que contém a hora `horaMs`. */
export function inicioDoBucket(horaMs: number, granularidade: Granularidade): number {
  if (granularidade === "hora") return horaMs;
  const local = horaMs + DESLOCAMENTO_MANAUS_MS;
  const diaLocal = Math.floor(local / MS_DIA) * MS_DIA;
  if (granularidade === "dia") return diaLocal - DESLOCAMENTO_MANAUS_MS;
  if (granularidade === "semana") {
    const diasDesdeSegunda = (new Date(diaLocal).getUTCDay() + 6) % 7;
    return diaLocal - diasDesdeSegunda * MS_DIA - DESLOCAMENTO_MANAUS_MS;
  }
  const d = new Date(local);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - DESLOCAMENTO_MANAUS_MS;
}

function proximoBucket(inicio: number, granularidade: Granularidade): number {
  if (granularidade === "hora") return inicio + MS_HORA;
  if (granularidade === "dia") return inicio + MS_DIA;
  if (granularidade === "semana") return inicio + 7 * MS_DIA;
  const d = new Date(inicio + DESLOCAMENTO_MANAUS_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DESLOCAMENTO_MANAUS_MS;
}

const dois = (n: number) => String(n).padStart(2, "0");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaMes(local: Date): string {
  return `${dois(local.getUTCDate())}/${dois(local.getUTCMonth() + 1)}`;
}

export function rotuloDoBucket(inicio: number, granularidade: Granularidade): string {
  const local = new Date(inicio + DESLOCAMENTO_MANAUS_MS);
  if (granularidade === "hora") return `${diaMes(local)}/${local.getUTCFullYear()} ${dois(local.getUTCHours())}h`;
  if (granularidade === "dia") return `${diaMes(local)}/${local.getUTCFullYear()}`;
  if (granularidade === "mes") return `${MESES[local.getUTCMonth()]}/${local.getUTCFullYear()}`;
  const fim = new Date(inicio + 6 * MS_DIA + DESLOCAMENTO_MANAUS_MS);
  return `${diaMes(local)} a ${diaMes(fim)}/${fim.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------------------------
// Agregação
// ---------------------------------------------------------------------------------------------

/** Distribui o volume do evento nas horas do relógio que o intervalo cobre (proporcional ao tempo em cada hora). */
export function fatiasPorHora(evento: EventoConsumo): { hora: number; m3: number }[] {
  if (evento.inicio === null || evento.fim <= evento.inicio) return [{ hora: inicioDaHora(evento.fim), m3: evento.m3 }];
  const duracao = evento.fim - evento.inicio;
  const fatias: { hora: number; m3: number }[] = [];
  for (let hora = inicioDaHora(evento.inicio); hora < evento.fim; hora += MS_HORA) {
    const dentro = Math.min(evento.fim, hora + MS_HORA) - Math.max(evento.inicio, hora);
    if (dentro > 0) fatias.push({ hora, m3: (evento.m3 * dentro) / duracao });
  }
  return fatias;
}

export interface Bucket {
  inicio: number;
  rotulo: string;
  /** m³ por ponto (id de PONTOS_AGUA). */
  porPonto: Record<string, number>;
  porSistema: Record<SistemaAgua, number>;
  /** Soma de todos os chillers (tudo menos o chuveiro). */
  chillers: number;
  chuveiro: number;
  total: number;
}

export interface ResultadoConsumo {
  buckets: Bucket[];
  totaisPorPonto: Record<string, number>;
  totaisPorSistema: Record<SistemaAgua, number>;
  chillers: number;
  chuveiro: number;
  total: number;
  /** Dias (de Manaus) em que houve consumo — base da média diária. */
  diasComConsumo: number;
  /** Leituras apuradas no período e quantas delas não tiveram o intervalo distribuído nas horas. */
  leituras: number;
  leiturasSemIntervalo: number;
  /** Leituras do período desconsideradas por valor menor que o anterior. */
  descartadas: number;
}

const zeroPorPonto = (): Record<string, number> => Object.fromEntries(PONTOS_AGUA.map((p) => [p.id, 0]));
const zeroPorSistema = (): Record<SistemaAgua, number> => ({ carcacas: 0, partes: 0, miudos: 0, chuveiro: 0 });

function novoBucket(inicio: number, granularidade: Granularidade): Bucket {
  return { inicio, rotulo: rotuloDoBucket(inicio, granularidade), porPonto: zeroPorPonto(), porSistema: zeroPorSistema(), chillers: 0, chuveiro: 0, total: 0 };
}

const PONTO_POR_ID = new Map(PONTOS_AGUA.map((p) => [p.id, p]));

/** Soma o consumo por período. `deMs` inclusivo, `ateMs` exclusivo (instantes UTC). Horas: só as que tiveram
 * leitura aparecem; dia/semana/mês listam todos os períodos do intervalo (os sem consumo valem 0). */
export function agregar(
  eventos: EventoConsumo[],
  granularidade: Granularidade,
  deMs: number,
  ateMs: number,
  descartadasEm: number[] = [],
  /** Dias (início do dia em Manaus, ms) fora do BI: não entram em nenhum total, gráfico ou tabela. */
  diasExcluidos: ReadonlySet<number> = new Set()
): ResultadoConsumo {
  const buckets = new Map<number, Bucket>();
  const excluido = (instanteMs: number) => diasExcluidos.size > 0 && diasExcluidos.has(inicioDoBucket(instanteMs, "dia"));
  const dias = new Set<number>();
  let leituras = 0;
  let leiturasSemIntervalo = 0;

  const bucketDe = (inicio: number) => {
    let b = buckets.get(inicio);
    if (!b) {
      b = novoBucket(inicio, granularidade);
      buckets.set(inicio, b);
    }
    return b;
  };

  if (granularidade !== "hora") {
    for (let inicio = inicioDoBucket(deMs, granularidade); inicio < ateMs; inicio = proximoBucket(inicio, granularidade)) {
      // Por dia, o dia excluído nem aparece no eixo (não vira uma barra zerada).
      if (granularidade === "dia" && excluido(inicio)) continue;
      bucketDe(inicio);
    }
  }

  for (const evento of eventos) {
    if (evento.fim < deMs || evento.fim >= ateMs || excluido(evento.fim)) continue;
    const ponto = PONTO_POR_ID.get(evento.pontoId);
    if (!ponto) continue;
    leituras += 1;
    if (evento.inicio === null) leiturasSemIntervalo += 1;
    for (const { hora, m3 } of fatiasPorHora(evento)) {
      if (hora < deMs || hora >= ateMs || excluido(hora)) continue;
      const bucket = bucketDe(inicioDoBucket(hora, granularidade));
      bucket.porPonto[ponto.id] = (bucket.porPonto[ponto.id] ?? 0) + m3;
      bucket.porSistema[ponto.sistema] += m3;
      if (SISTEMAS_AGUA[ponto.sistema].chiller) bucket.chillers += m3;
      else bucket.chuveiro += m3;
      bucket.total += m3;
      dias.add(inicioDoBucket(hora, "dia"));
    }
  }

  const ordenados = Array.from(buckets.values()).sort((a, b) => a.inicio - b.inicio);
  const totaisPorPonto = zeroPorPonto();
  const totaisPorSistema = zeroPorSistema();
  let chillers = 0;
  let chuveiro = 0;
  for (const b of ordenados) {
    for (const ponto of PONTOS_AGUA) totaisPorPonto[ponto.id] = (totaisPorPonto[ponto.id] ?? 0) + (b.porPonto[ponto.id] ?? 0);
    for (const sistema of Object.keys(totaisPorSistema) as SistemaAgua[]) totaisPorSistema[sistema] += b.porSistema[sistema];
    chillers += b.chillers;
    chuveiro += b.chuveiro;
  }
  const descartadas = descartadasEm.filter((t) => t >= deMs && t < ateMs && !excluido(t)).length;
  return { buckets: ordenados, totaisPorPonto, totaisPorSistema, chillers, chuveiro, total: chillers + chuveiro, diasComConsumo: dias.size, leituras, leiturasSemIntervalo, descartadas };
}
