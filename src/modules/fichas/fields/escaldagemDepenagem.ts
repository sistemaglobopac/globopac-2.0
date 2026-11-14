// Escaldagem/Depenagem — Controle — funções PURAS (sem React). O inspetor registra os parâmetros do processo
// (velocidade da nórea, tempo de escaldagem, temperaturas do depilador de patas e do tanque — sem limite, só registro)
// e, sobre a quantidade de aves avaliadas, quantas apresentaram cada defeito. O sistema devolve o percentual de cada
// defeito e o compara com o máximo tolerado dele; acima do máximo é NÃO CONFORME (igual ao máximo é conforme).
// Testadas em tests/unit/escaldagemDepenagem.test.ts.
import { lerTemperatura } from "./esperaAves";
import type { EscaldagemDepenagemValor } from "./tiposCompostos";

export interface DefeitoEscaldagem {
  chave: string;
  rotulo: string;
  /** Percentual máximo tolerado das aves avaliadas. */
  maximoPct: number;
}

export interface GrupoDefeitosEscaldagem {
  chave: string;
  rotulo: string;
  defeitos: DefeitoEscaldagem[];
}

const M5 = 5;

export const GRUPOS_ESCALDAGEM: GrupoDefeitosEscaldagem[] = [
  {
    chave: "penas",
    rotulo: "Penas (PSO 06)",
    defeitos: [
      { chave: "penasAsas", rotulo: "Penas nas asas — PSO 06", maximoPct: M5 },
      { chave: "penasPontasAsas", rotulo: "Penas nas pontas das asas — PSO 06", maximoPct: M5 },
      { chave: "penasPernas", rotulo: "Penas nas pernas — PSO 06", maximoPct: M5 },
      { chave: "penasAbdomen", rotulo: "Penas no abdômen — PSO 06", maximoPct: M5 },
      { chave: "penasSambiquira", rotulo: "Penas na sambiquira — PSO 06", maximoPct: M5 },
      { chave: "penasCabeca", rotulo: "Penas na cabeça — PSO 06", maximoPct: M5 },
      { chave: "penasCostelas", rotulo: "Penas nas costelas — PSO 06", maximoPct: M5 },
    ],
  },
  {
    chave: "pelicula",
    rotulo: "Película amarela",
    defeitos: [
      { chave: "peliculaAbdomen", rotulo: "Película amarela no abdômen", maximoPct: M5 },
      { chave: "peliculaPeito", rotulo: "Película amarela no peito", maximoPct: M5 },
      { chave: "peliculaCostelas", rotulo: "Película amarela nas costelas", maximoPct: M5 },
      { chave: "peliculaPernas", rotulo: "Película amarela nas pernas", maximoPct: M5 },
    ],
  },
  {
    chave: "pele",
    rotulo: "Imperfeições na pele",
    defeitos: [
      { chave: "imperfeicoesPeito", rotulo: "Imperfeições na pele do peito", maximoPct: M5 },
      { chave: "imperfeicoesDorso", rotulo: "Imperfeições na pele do dorso", maximoPct: M5 },
    ],
  },
  {
    chave: "pes",
    rotulo: "Pés",
    defeitos: [
      { chave: "pesMalDepilados", rotulo: "Pés mal depilados — PSO 07", maximoPct: 2 },
      { chave: "pododermatites", rotulo: "Pododermatites — PSO 07", maximoPct: M5 },
      { chave: "corteIrregularPes", rotulo: "Corte irregular de pés", maximoPct: 15 },
      { chave: "excessoEscaldaPes", rotulo: "Excesso de escalda nos pés", maximoPct: 3 },
      { chave: "falhaDesacoplamentoPes", rotulo: "Falha no desacoplamento de pés", maximoPct: 3 },
    ],
  },
];

export const DEFEITOS_ESCALDAGEM: DefeitoEscaldagem[] = GRUPOS_ESCALDAGEM.flatMap((g) => g.defeitos);

/** Os quatro parâmetros do processo (só registrados), na ordem da tela. */
export const PARAMETROS_ESCALDAGEM = [
  { chave: "velocidadeNoreaAvesHora", rotulo: "Velocidade da nórea — PSO 15 (aves por hora)", placeholder: "9000", decimal: false },
  { chave: "tempoEscaldagemMin", rotulo: "Tempo de escaldagem (min)", placeholder: "2,5", decimal: true },
  { chave: "temperaturaDepiladorPatasC", rotulo: "Temperatura do depilador de patas (°C)", placeholder: "60,0", decimal: true },
  { chave: "temperaturaTanqueEscaldagemC", rotulo: "Temperatura do tanque de escaldagem (°C)", placeholder: "57,5", decimal: true },
] as const;

export type ChaveParametroEscaldagem = (typeof PARAMETROS_ESCALDAGEM)[number]["chave"];

export function escaldagemVazio(): EscaldagemDepenagemValor {
  return {
    velocidadeNoreaAvesHora: "",
    tempoEscaldagemMin: "",
    temperaturaDepiladorPatasC: "",
    temperaturaTanqueEscaldagemC: "",
    avesAvaliadas: "",
    defeitos: Object.fromEntries(DEFEITOS_ESCALDAGEM.map((d) => [d.chave, ""])),
    observacao: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** "12" → 12 (zero vale); vazio/inválido (decimal, negativo, texto) → null. */
export function lerContagem(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Aves avaliadas válidas (inteiro maior que zero). */
export function lerAvaliadas(v: Pick<EscaldagemDepenagemValor, "avesAvaliadas">): number | null {
  const n = lerContagem(v.avesAvaliadas);
  return n !== null && n > 0 ? n : null;
}

/** Percentual de aves com o defeito; sem base válida → null. */
export function percentualDefeito(defeitos: number | null, avaliadas: number | null): number | null {
  if (defeitos === null || avaliadas === null || avaliadas <= 0) return null;
  return (defeitos / avaliadas) * 100;
}

/** Acima do máximo tolerado (comparação em inteiros, sem erro de ponto flutuante): exatamente o máximo é conforme. */
export function defeitoAcimaDoMaximo(defeitos: number | null, avaliadas: number | null, maximoPct: number): boolean {
  if (defeitos === null || avaliadas === null || avaliadas <= 0) return false;
  return defeitos * 100 > maximoPct * avaliadas;
}

/** "3,5%" — até duas casas, vírgula decimal; "—" sem valor. */
export function formatarPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

const fmtMax = (n: number) => `${n.toLocaleString("pt-BR")}%`;

/** Defeitos de uma leitura que passaram do máximo (a base do selo, da RNC, do relatório e do alvo do adendo). */
export function defeitosAcimaDoMaximo(v: Pick<EscaldagemDepenagemValor, "avesAvaliadas" | "defeitos">): DefeitoEscaldagem[] {
  const avaliadas = lerContagem(v.avesAvaliadas);
  return DEFEITOS_ESCALDAGEM.filter((d) => defeitoAcimaDoMaximo(lerContagem(v.defeitos?.[d.chave]), avaliadas, d.maximoPct));
}

export function avaliarEscaldagem(v: EscaldagemDepenagemValor): { conformidade: boolean; motivos: string[] } {
  const avaliadas = lerContagem(v.avesAvaliadas);
  const motivos = defeitosAcimaDoMaximo(v).map(
    (d) => `${d.rotulo}: ${formatarPct(percentualDefeito(lerContagem(v.defeitos?.[d.chave]), avaliadas))} (máx. ${fmtMax(d.maximoPct)})`
  );
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorEscaldagem(v: EscaldagemDepenagemValor): EscaldagemDepenagemValor {
  const { conformidade, motivos } = avaliarEscaldagem(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Escaldagem/Depenagem fora do limite — ${motivos.join("; ")}` : null };
}

/** Impede assinar com parâmetro do processo em branco, sem aves avaliadas, com defeito em branco ("0" vale) ou com
 * defeito maior que as aves avaliadas (uma ave é contada uma vez por defeito). */
export function motivosBloqueioEscaldagem(v: EscaldagemDepenagemValor | undefined | null): string[] {
  const t = "Escaldagem/Depenagem";
  if (!v) return [`${t}: informe os parâmetros do processo, as aves avaliadas e os defeitos.`];
  const m: string[] = [];
  for (const p of PARAMETROS_ESCALDAGEM) {
    const texto = v[p.chave];
    const n = p.decimal ? lerTemperatura(texto) : lerContagem(texto);
    if (n === null || (p.chave !== "temperaturaDepiladorPatasC" && p.chave !== "temperaturaTanqueEscaldagemC" && n <= 0)) {
      m.push(`${t}: informe ${p.rotulo.toLowerCase()}.`);
    }
  }
  const avaliadas = lerAvaliadas(v);
  if (avaliadas === null) {
    m.push(`${t}: informe a quantidade de aves avaliadas.`);
    return m;
  }
  for (const d of DEFEITOS_ESCALDAGEM) {
    const n = lerContagem(v.defeitos?.[d.chave]);
    if (n === null) m.push(`${t}: informe "${d.rotulo}"; se não houve, digite 0.`);
    else if (n > avaliadas) m.push(`${t}: "${d.rotulo}" não pode passar da quantidade de aves avaliadas (${avaliadas}).`);
  }
  return m;
}
