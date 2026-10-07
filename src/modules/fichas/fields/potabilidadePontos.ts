// Monitoramento de Potabilidade da Água nos Pontos de Coleta (pH e cloro) — funções PURAS (sem React).
// A cada monitoramento o sistema sorteia UM ponto de coleta para o inspetor testar; o sorteio nunca
// repete o ponto do monitoramento anterior. Testadas em tests/unit/potabilidadePontos.test.ts.
import type { PotabilidadePontosValor } from "./tiposCompostos";
import { lerMedida } from "./potabilidadeAgua";

export { lerMedida };

export const LIMITE_PH_PONTOS = { min: 6.0, max: 9.0 };
export const LIMITE_CLORO_PONTOS_PPM = { min: 0.2, max: 2.0 };

export const PONTOS_COLETA: { chave: string; numero: string; rotulo: string }[] = [
  { chave: "ponto03", numero: "03", rotulo: "Pia da barreira sanitária da evisceração e pré-resfriamento" },
  { chave: "ponto04", numero: "04", rotulo: "Ponto de higienização da sala de escaldagem e depenagem" },
  { chave: "ponto05", numero: "05", rotulo: "Pia de higienização de mãos da sala de escaldagem e depenagem" },
  { chave: "ponto06", numero: "06", rotulo: "Pia de higienização da sala de evisceração" },
  { chave: "ponto07", numero: "07", rotulo: "Ponto de abastecimento do pré-chiller" },
  { chave: "ponto08", numero: "08", rotulo: "Pia de higienização de mãos da sala de cortes" },
  { chave: "ponto09", numero: "09", rotulo: "Pia de higienização de mãos da barreira sanitária da embalagem secundária" },
];

export function rotuloPonto(chave: string | undefined | null): string {
  const p = PONTOS_COLETA.find((x) => x.chave === chave);
  return p ? `Ponto ${p.numero} — ${p.rotulo}` : "—";
}

/** Sorteia o ponto do monitoramento, excluindo o testado no monitoramento anterior. `aleatorio` (0 a <1)
 * é injetável para teste. */
export function sortearPonto(anterior: string | undefined | null, aleatorio: () => number = Math.random): string {
  const candidatos = PONTOS_COLETA.filter((p) => p.chave !== anterior);
  return candidatos[Math.min(candidatos.length - 1, Math.floor(aleatorio() * candidatos.length))]!.chave;
}

export function potabilidadePontosInicial(anterior?: PotabilidadePontosValor | null, aleatorio?: () => number): PotabilidadePontosValor {
  return { ponto: sortearPonto(anterior?.ponto, aleatorio), ph: "", cloro: "", conformidade: true, detalhesRNC: null };
}

export function phPontoForaDoLimite(ph: number | null): boolean {
  return ph !== null && (ph < LIMITE_PH_PONTOS.min || ph > LIMITE_PH_PONTOS.max);
}

export function cloroPontoForaDoLimite(cloro: number | null): boolean {
  return cloro !== null && (cloro < LIMITE_CLORO_PONTOS_PPM.min || cloro > LIMITE_CLORO_PONTOS_PPM.max);
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function avaliarPotabilidadePontos(v: PotabilidadePontosValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  const nome = rotuloPonto(v.ponto);
  const ph = lerMedida(v.ph);
  const cloro = lerMedida(v.cloro);
  if (phPontoForaDoLimite(ph)) motivos.push(`${nome}: pH ${fmt(ph!)} (limite ${fmt(LIMITE_PH_PONTOS.min)} a ${fmt(LIMITE_PH_PONTOS.max)})`);
  if (cloroPontoForaDoLimite(cloro)) motivos.push(`${nome}: cloro ${fmt(cloro!)} ppm (limite ${fmt(LIMITE_CLORO_PONTOS_PPM.min)} a ${fmt(LIMITE_CLORO_PONTOS_PPM.max)} ppm)`);
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorPotabilidadePontos(v: PotabilidadePontosValor): PotabilidadePontosValor {
  const { conformidade, motivos } = avaliarPotabilidadePontos(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Potabilidade da água fora do limite — ${motivos.join("; ")}` : null };
}

/** pH e cloro do ponto sorteado precisam estar informados. */
export function motivosBloqueioPotabilidadePontos(v: PotabilidadePontosValor | undefined | null): string[] {
  const p = "Potabilidade da água (pontos de coleta)";
  if (!v?.ponto) return [`${p}: informe o pH e o cloro do ponto sorteado.`];
  const nome = rotuloPonto(v.ponto);
  const m: string[] = [];
  if (lerMedida(v.ph) === null) m.push(`${p}: informe o pH do ${nome}.`);
  if (lerMedida(v.cloro) === null) m.push(`${p}: informe o cloro do ${nome}.`);
  return m;
}
