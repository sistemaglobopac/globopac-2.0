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

export const BORBULHAMENTO: { valor: string; rotulo: string }[] = [
  { valor: "moderado", rotulo: "Moderado" },
  { valor: "intenso", rotulo: "Intenso" },
];

export function rotuloBorbulhamento(valor: string | undefined): string {
  return BORBULHAMENTO.find((b) => b.valor === valor)?.rotulo ?? "—";
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
    const temp = lerTemperatura(v.temperaturas?.[t.chave]);
    if (temperaturaAbsorcaoAcimaDoLimite(t.chave, temp)) motivos.push(`Água do ${t.rotulo}: ${fmt(temp!)} ºC (limite ${fmt(LIMITE_AGUA_C[t.chave]!)} ºC)`);
  }
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorControleAbsorcao(v: ControleAbsorcaoValor): ControleAbsorcaoValor {
  const { conformidade, motivos } = avaliarControleAbsorcao(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Controle de absorção — temperatura acima do limite — ${motivos.join("; ")}` : null };
}

/** Tempo de permanência (maior que zero), as 3 temperaturas e o borbulhamento dos 3 tanques são obrigatórios. */
export function motivosBloqueioControleAbsorcao(v: ControleAbsorcaoValor | undefined | null): string[] {
  const p = "Controle de absorção";
  if (!v) return [`${p}: informe o tempo de permanência, as temperaturas e o borbulhamento.`];
  const m: string[] = [];
  const tempo = lerMedida(v.tempoPermanenciaMin);
  if (tempo === null || tempo <= 0) m.push(`${p}: informe o tempo de permanência das carcaças no pré-chiller (minutos).`);
  for (const t of TANQUES_ABSORCAO) {
    if (lerTemperatura(v.temperaturas?.[t.chave]) === null) m.push(`${p}: informe a temperatura da água do ${t.rotulo}.`);
  }
  for (const t of TANQUES_ABSORCAO) {
    if (!BORBULHAMENTO.some((b) => b.valor === v.borbulhamento?.[t.chave])) m.push(`${p}: informe o borbulhamento do ${t.rotulo}.`);
  }
  return m;
}
