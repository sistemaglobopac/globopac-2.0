// Monitoramento de Bem-Estar Animal — Eletronarcose (insensibilização) — funções PURAS (sem React):
// parâmetros elétricos, tempos da linha, pré-choque, falha de sangria e sinais de insensibilização.
// Testadas em tests/unit/eletronarcoseAves.test.ts.
import type { EletronarcoseAvesValor } from "./tiposCompostos";
import { lerTemperatura } from "./esperaAves";

/** Faixas dos parâmetros elétricos (corrente em mA por ave). */
export const FAIXA_VOLTAGEM_V = { min: 30, max: 150 } as const;
export const FAIXA_FREQUENCIA_HZ = { min: 20, max: 1500 } as const;
export const FAIXA_CORRENTE_MA = { min: 25, max: 200 } as const;

export function foraDaFaixa(n: number | null, f: { min: number; max: number }): boolean {
  return n !== null && (n < f.min || n > f.max);
}

/** Contenção da pendura até a cuba de insensibilização: no máximo 60 s. */
export const LIMITE_CONTENCAO_MAX_S = 60;
/** Saída da cuba até a sangria: no máximo 12 s. */
export const LIMITE_SAIDA_SANGRIA_MAX_S = 12;
/** Restabelecimento da postura de estação: no máximo 60 segundos. */
export const LIMITE_POSTURA_ESTACAO_MAX_S = 60;
/** Tempo de sangria: no mínimo 3 minutos (180 s). */
export const LIMITE_SANGRIA_MIN_S = 180;

/** Sinais de insensibilização checados. Na maioria, "Sim" indica ave consciente / insensibilização
 * ineficaz (desvio); em `simConforme` (tremores involuntários) é o contrário: "Sim" é conforme e
 * "Não" é o desvio. `chave` é o campo de EletronarcoseAvesValor. */
export const SINAIS_INSENSIBILIZACAO = [
  { chave: "vocalizacao", rotulo: "Vocalização?", desvio: "Vocalização", simConforme: false },
  { chave: "reflexosOculares", rotulo: "Reflexos oculares?", desvio: "Reflexos oculares", simConforme: false },
  { chave: "asasAfastadas", rotulo: "Asas afastadas do corpo?", desvio: "Asas afastadas do corpo", simConforme: false },
  { chave: "respiracaoRitmica", rotulo: "Respiração rítmica?", desvio: "Respiração rítmica", simConforme: false },
  { chave: "tremores", rotulo: "Tremores involuntários (corpo e asas)?", desvio: "Ausência de tremores involuntários (corpo e asas)", simConforme: true },
] as const;

export function eletronarcoseVazia(): EletronarcoseAvesValor {
  return {
    voltagemV: "",
    frequenciaHz: "",
    correnteMa: "",
    contencaoS: "",
    tempoCubaS: "",
    saidaSangriaS: "",
    sangriaS: "",
    preChoque: null,
    avesSemSangrar: null,
    vocalizacao: null,
    reflexosOculares: null,
    asasAfastadas: null,
    respiracaoRitmica: null,
    tremores: null,
    posturaEstacaoS: "",
    descricaoDesvio: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** Número digitado ("12,5" ou "12.5") → number; null se vazio/inválido. */
export const lerNumero = lerTemperatura;

function s(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Desvios (motivos de não conformidade) do registro. Voltagem, frequência, corrente, tempo na
 * cuba e tempo para restabelecer a postura são registrados sem reprovar sozinhos. */
export function motivosDesvioEletronarcose(v: EletronarcoseAvesValor): string[] {
  const m: string[] = [];
  const faixas: [string, string, { min: number; max: number }, string][] = [
    [v.voltagemV, "Voltagem", FAIXA_VOLTAGEM_V, "V"],
    [v.frequenciaHz, "Frequência", FAIXA_FREQUENCIA_HZ, "Hz"],
    [v.correnteMa, "Corrente", FAIXA_CORRENTE_MA, "mA por ave"],
  ];
  for (const [texto, nome, f, un] of faixas) {
    const n = lerNumero(texto);
    if (foraDaFaixa(n, f)) m.push(`${nome} de ${s(n as number)} ${un} (faixa ${f.min} a ${f.max} ${un.replace(" por ave", "")})`);
  }
  const postura = lerNumero(v.posturaEstacaoS);
  if (postura !== null && postura > LIMITE_POSTURA_ESTACAO_MAX_S) m.push(`Restabelecimento da postura de estação em ${s(postura)} s (máximo ${LIMITE_POSTURA_ESTACAO_MAX_S} s)`);
  const contencao = lerNumero(v.contencaoS);
  if (contencao !== null && contencao > LIMITE_CONTENCAO_MAX_S) m.push(`Contenção da pendura até a cuba de ${s(contencao)} s (máximo ${LIMITE_CONTENCAO_MAX_S} s)`);
  const saida = lerNumero(v.saidaSangriaS);
  if (saida !== null && saida > LIMITE_SAIDA_SANGRIA_MAX_S) m.push(`Saída da cuba até a sangria de ${s(saida)} s (máximo ${LIMITE_SAIDA_SANGRIA_MAX_S} s)`);
  const sangria = lerNumero(v.sangriaS);
  if (sangria !== null && sangria < LIMITE_SANGRIA_MIN_S) m.push(`Tempo de sangria de ${s(sangria)} s (mínimo ${LIMITE_SANGRIA_MIN_S} s = 3 min)`);
  if (v.preChoque === true) m.push("Aves recebendo pré-choque");
  if (v.avesSemSangrar === true) m.push("Aves sem sangrar após o disco automático e o rapasse da sangria");
  for (const sinal of SINAIS_INSENSIBILIZACAO) {
    if (v[sinal.chave] === !sinal.simConforme) m.push(`Sinal de insensibilização ineficaz: ${sinal.desvio}`);
  }
  return m;
}

export function avaliarEletronarcose(v: EletronarcoseAvesValor): { conformidade: boolean; motivos: string[] } {
  const motivos = motivosDesvioEletronarcose(v);
  const conformidade = motivos.length === 0;
  const descricao = v.descricaoDesvio.trim();
  return { conformidade, motivos: !conformidade && descricao ? [...motivos, `Ocorrência/ação: ${descricao}`] : motivos };
}

/** Aplica a conformidade sobre o valor digitado — é o que o widget emite. A descrição do desvio só
 * é mantida enquanto houver desvio. */
export function montarValorEletronarcose(v: EletronarcoseAvesValor): EletronarcoseAvesValor {
  const { conformidade, motivos } = avaliarEletronarcose(v);
  return {
    ...v,
    descricaoDesvio: conformidade ? "" : v.descricaoDesvio,
    conformidade,
    detalhesRNC: motivos.length > 0 ? motivos.join("; ") : null,
  };
}

/** Motivos que impedem assinar. */
export function motivosBloqueioEletronarcose(v: EletronarcoseAvesValor | undefined | null): string[] {
  const p = "Eletronarcose";
  if (!v) return [`${p}: preencha o monitoramento de bem-estar animal.`];
  const m: string[] = [];
  const numeros: [string, string][] = [
    [v.voltagemV, "a voltagem (V)"],
    [v.frequenciaHz, "a frequência (Hz)"],
    [v.correnteMa, "a corrente (mA)"],
    [v.contencaoS, "o tempo de contenção da pendura até a cuba (s)"],
    [v.tempoCubaS, "o tempo dentro da cuba de insensibilização (s)"],
    [v.saidaSangriaS, "o tempo da saída da cuba até a sangria (s)"],
    [v.sangriaS, "o tempo de sangria (s)"],
    [v.posturaEstacaoS, "o tempo para restabelecer a postura de estação (s)"],
  ];
  for (const [valor, nome] of numeros) if (lerNumero(valor) === null) m.push(`${p}: informe ${nome}.`);
  if (v.preChoque === null) m.push(`${p}: informe se as aves estão recebendo pré-choque.`);
  if (v.avesSemSangrar === null) m.push(`${p}: informe se há aves sem sangrar após o disco automático e o rapasse da sangria.`);
  for (const sinal of SINAIS_INSENSIBILIZACAO) {
    if (v[sinal.chave] === null) m.push(`${p}: responda "${sinal.rotulo}"`);
  }
  if (motivosDesvioEletronarcose(v).length > 0 && !v.descricaoDesvio.trim()) m.push(`${p}: descreva a ocorrência e a ação corretiva adotada.`);
  return m;
}
