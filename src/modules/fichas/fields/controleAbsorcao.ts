// Controle de Absorção — funções PURAS (sem React): tempo de permanência das carcaças no pré-chiller,
// temperatura da água do pré-chiller, do chiller 1 e do chiller 2 e intensidade do borbulhamento de
// cada tanque (moderado ou intenso). O tempo de permanência e o borbulhamento só são registrados; a
// conformidade vem apenas da temperatura da água, pelos mesmos limites máximos do monitoramento de
// temperaturas do pré-resfriamento. Testadas em tests/unit/controleAbsorcao.test.ts.
import { lerMedida } from "./potabilidadeAgua";
import { LIMITE_AGUA_C, lerTemperatura } from "./temperaturaResfriamento";
import type { ChaveTanqueAbsorcao, ControleAbsorcaoValor } from "./tiposCompostos";

export { lerMedida, lerTemperatura };

export const TANQUES_ABSORCAO: { chave: ChaveTanqueAbsorcao; rotulo: string }[] = [
  { chave: "preChiller", rotulo: "Pré-chiller" },
  { chave: "chiller1", rotulo: "Chiller 01" },
  { chave: "chiller2", rotulo: "Chiller 02" },
];

/** Etapa 1: pré-chiller e chiller 1 (na hora). Etapa 2: chiller 2 (depois). */
export const TANQUES_ETAPA1: ChaveTanqueAbsorcao[] = ["preChiller", "chiller1"];
export const TANQUE_ETAPA2: ChaveTanqueAbsorcao = "chiller2";

/** Marca em dados_dinamicos: o registro foi salvo só com a etapa 1 e aguarda o chiller 2. Espelha o banco (guard_fase_absorcao). */
export const CHAVE_AGUARDANDO_CHILLER2 = "aguardando_chiller2";
/** Quem completou o chiller 2 e quando (etapa 2). */
export const CHAVE_CHILLER2_COMPLETADO = "chiller2_completado";
/** A partir de quantos minutos esperando o chiller 2 o alerta fica forte. */
export const ALERTA_CHILLER2_MIN = 60;

export const BORBULHAMENTO: { valor: string; rotulo: string }[] = [
  { valor: "moderado", rotulo: "Moderado" },
  { valor: "intenso", rotulo: "Intenso" },
];

export function rotuloBorbulhamento(valor: string | undefined): string {
  return BORBULHAMENTO.find((b) => b.valor === valor)?.rotulo ?? "—";
}

/** O tanque está com o processo parado (não estava funcionando)? Sem temperatura nem borbulhamento a informar. */
export function tanqueParado(v: Pick<ControleAbsorcaoValor, "tanquesParados"> | undefined | null, tanque: ChaveTanqueAbsorcao): boolean {
  return v?.tanquesParados?.[tanque] === true;
}

/** Marca (ou desmarca) o processo parado de um tanque: temperatura e borbulhamento digitados são descartados. */
export function definirTanqueParado(v: ControleAbsorcaoValor, tanque: ChaveTanqueAbsorcao, parado: boolean): ControleAbsorcaoValor {
  const tanquesParados = { ...(v.tanquesParados ?? {}) };
  if (parado) tanquesParados[tanque] = true;
  else delete tanquesParados[tanque];
  return {
    ...v,
    tanquesParados,
    ...(parado ? { temperaturas: { ...v.temperaturas, [tanque]: "" }, borbulhamento: { ...v.borbulhamento, [tanque]: "" } } : {}),
  };
}

export function controleAbsorcaoVazio(): ControleAbsorcaoValor {
  const porTanque = () => Object.fromEntries(TANQUES_ABSORCAO.map((t) => [t.chave, ""])) as Record<ChaveTanqueAbsorcao, string>;
  return { tempoPermanenciaMin: "", temperaturas: porTanque(), borbulhamento: porTanque(), observacao: "", conformidade: true, detalhesRNC: null };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function temperaturaAbsorcaoAcimaDoLimite(tanque: ChaveTanqueAbsorcao, t: number | null): boolean {
  const limite = LIMITE_AGUA_C[tanque];
  return limite !== null && t !== null && t > limite;
}

/** Temperatura da água acima do limite máximo do tanque (pré-chiller 16 ºC; chillers 4 ºC). */
export function avaliarControleAbsorcao(v: ControleAbsorcaoValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  for (const t of TANQUES_ABSORCAO) {
    if (tanqueParado(v, t.chave)) continue;
    const temp = lerTemperatura(v.temperaturas?.[t.chave]);
    if (temperaturaAbsorcaoAcimaDoLimite(t.chave, temp)) motivos.push(`Água do ${t.rotulo}: ${fmt(temp!)} ºC (limite ${fmt(LIMITE_AGUA_C[t.chave]!)} ºC)`);
  }
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorControleAbsorcao(v: ControleAbsorcaoValor): ControleAbsorcaoValor {
  const { conformidade, motivos } = avaliarControleAbsorcao(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Controle de absorção — temperatura acima do limite — ${motivos.join("; ")}` : null };
}

/** O chiller 2 ainda não foi informado (temperatura e borbulhamento)? */
export function chiller2Pendente(v: ControleAbsorcaoValor | undefined | null): boolean {
  if (tanqueParado(v, "chiller2")) return false;
  return lerTemperatura(v?.temperaturas?.chiller2) === null || !BORBULHAMENTO.some((b) => b.valor === v?.borbulhamento?.chiller2);
}

/** Tempo de permanência (maior que zero), a temperatura e o borbulhamento dos tanques indicados são obrigatórios.
 * `etapa` 1 = só pré-chiller e chiller 1; 2 = só o chiller 2; omitido = os 3 tanques (registro completo). */
export function motivosBloqueioControleAbsorcao(v: ControleAbsorcaoValor | undefined | null, etapa?: 1 | 2): string[] {
  const p = "Controle de absorção";
  const tanques = TANQUES_ABSORCAO.filter((t) => (etapa === 1 ? TANQUES_ETAPA1.includes(t.chave) : etapa === 2 ? t.chave === TANQUE_ETAPA2 : true));
  if (!v) return [`${p}: informe ${etapa === 2 ? "a temperatura e o borbulhamento do chiller 02" : "o tempo de permanência, as temperaturas e o borbulhamento"}.`];
  const m: string[] = [];
  const tempo = lerMedida(v.tempoPermanenciaMin);
  if (etapa !== 2 && (tempo === null || tempo <= 0)) m.push(`${p}: informe o tempo de permanência das carcaças no pré-chiller (minutos).`);
  for (const t of tanques) {
    if (tanqueParado(v, t.chave)) continue;
    if (lerTemperatura(v.temperaturas?.[t.chave]) === null) m.push(`${p}: informe a temperatura da água do ${t.rotulo}.`);
  }
  for (const t of tanques) {
    if (tanqueParado(v, t.chave)) continue;
    if (!BORBULHAMENTO.some((b) => b.valor === v.borbulhamento?.[t.chave])) m.push(`${p}: informe o borbulhamento do ${t.rotulo}.`);
  }
  return m;
}
