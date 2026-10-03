// Monitoramento das Temperaturas dos Sistemas de Pré-resfriamento — funções PURAS (sem React):
// temperatura da água de cada tanque, temperatura ambiente das salas e temperatura de duas amostras de cada produto na saída dos
// sistemas. Conformidade automática pelos limites máximos abaixo (`null` = ponto sem limite
// configurado, só registra): pré-chiller até 16 ºC, demais tanques até 4 ºC e produtos até 7 ºC. Testadas em tests/unit/temperaturaResfriamento.test.ts.
import type { AmostrasProduto, ChaveAguaResfriamento, ChaveAmbienteResfriamento, ChaveProdutoResfriamento, TemperaturaResfriamentoValor } from "./tiposCompostos";

export const PONTOS_AGUA: { chave: ChaveAguaResfriamento; rotulo: string }[] = [
  { chave: "preChiller", rotulo: "T ºC Pré-chiller" },
  { chave: "chiller1", rotulo: "T ºC Chiller 01" },
  { chave: "chiller2", rotulo: "T ºC Chiller 02" },
  { chave: "chillerPartes1", rotulo: "T ºC Chiller de partes 01" },
  { chave: "chillerPartes2", rotulo: "T ºC Chiller de partes 02" },
  { chave: "miniFigado", rotulo: "T ºC Mini-chiller de fígado" },
  { chave: "miniMoela", rotulo: "T ºC Mini-chiller de moela" },
  { chave: "miniCabeca", rotulo: "T ºC Mini-chiller de cabeça" },
  { chave: "miniCoracao", rotulo: "T ºC Mini-chiller de coração" },
  { chave: "miniPes", rotulo: "T ºC Mini-chiller de pés" },
];

export const PONTOS_AMBIENTE: { chave: ChaveAmbienteResfriamento; rotulo: string }[] = [
  { chave: "salaCarcacas", rotulo: "Sala de Pré-resfriamento de Carcaças" },
  { chave: "salaMiudos", rotulo: "Sala de Pré-resfriamento de Miúdos" },
];

export const PRODUTOS: { chave: ChaveProdutoResfriamento; rotulo: string; amostra: string }[] = [
  { chave: "carcaca", rotulo: "Carcaça", amostra: "Carcaça" },
  { chave: "parte", rotulo: "Parte", amostra: "Parte" },
  { chave: "figado", rotulo: "Fígado", amostra: "Fígado" },
  { chave: "moela", rotulo: "Moela", amostra: "Moela" },
  { chave: "cabeca", rotulo: "Cabeça", amostra: "Cabeça" },
  { chave: "coracao", rotulo: "Coração", amostra: "Coração" },
  { chave: "pes", rotulo: "Pés", amostra: "Pé" },
];

export const TIPOS_PARTE = ["Filé de peito", "Asa", "Coxa e Sobrecoxa"] as const;

/** Limite MÁXIMO (ºC) da temperatura da água em cada tanque; `null` = sem limite configurado. */
export const LIMITE_AGUA_C: Record<ChaveAguaResfriamento, number | null> = {
  preChiller: 16,
  chiller1: 4,
  chiller2: 4,
  chillerPartes1: 4,
  chillerPartes2: 4,
  miniFigado: 4,
  miniMoela: 4,
  miniCabeca: 4,
  miniCoracao: 4,
  miniPes: 4,
};

/** Limite MÁXIMO (ºC) da temperatura ambiente de cada sala de pré-resfriamento. */
export const LIMITE_AMBIENTE_C: Record<ChaveAmbienteResfriamento, number | null> = {
  salaCarcacas: 12,
  salaMiudos: 12,
};

/** Limite MÁXIMO (ºC) da temperatura de cada amostra do produto na saída; `null` = sem limite. */
export const LIMITE_PRODUTO_C: Record<ChaveProdutoResfriamento, number | null> = {
  carcaca: 7,
  parte: 7,
  figado: 7,
  moela: 7,
  cabeca: 7,
  coracao: 7,
  pes: 7,
};

export function amostrasVazias(): AmostrasProduto {
  return { amostra1: "", amostra2: "" };
}

export function temperaturaVazia(): TemperaturaResfriamentoValor {
  return {
    agua: Object.fromEntries(PONTOS_AGUA.map((p) => [p.chave, ""])) as Record<ChaveAguaResfriamento, string>,
    ambiente: Object.fromEntries(PONTOS_AMBIENTE.map((p) => [p.chave, ""])) as Record<ChaveAmbienteResfriamento, string>,
    produtos: Object.fromEntries(PRODUTOS.map((p) => [p.chave, amostrasVazias()])) as Record<ChaveProdutoResfriamento, AmostrasProduto>,
    tipoParte: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** "4,5" ou "4.5" → 4.5; vazio/inválido → null. Aceita negativos (água gelada pode ficar < 0 ºC). */
export function lerTemperatura(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim().replace(",", ".");
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Pontos acima do limite máximo configurado. */
export function avaliarTemperaturas(v: TemperaturaResfriamentoValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  for (const p of PONTOS_AGUA) {
    const limite = LIMITE_AGUA_C[p.chave];
    const t = lerTemperatura(v.agua[p.chave]);
    if (limite !== null && t !== null && t > limite) motivos.push(`${p.rotulo.replace("T ºC ", "Água do ")}: ${fmt(t)} ºC (limite ${fmt(limite)} ºC)`);
  }
  for (const p of PONTOS_AMBIENTE) {
    const limite = LIMITE_AMBIENTE_C[p.chave];
    const t = lerTemperatura(v.ambiente?.[p.chave]);
    if (limite !== null && t !== null && t > limite) motivos.push(`Temperatura ambiente da ${p.rotulo}: ${fmt(t)} ºC (limite ${fmt(limite)} ºC)`);
  }
  for (const p of PRODUTOS) {
    const limite = LIMITE_PRODUTO_C[p.chave];
    if (limite === null) continue;
    const nome = p.chave === "parte" && v.tipoParte ? `${p.amostra} (${v.tipoParte})` : p.amostra;
    ([["01", v.produtos[p.chave].amostra1], ["02", v.produtos[p.chave].amostra2]] as const).forEach(([n, texto]) => {
      const t = lerTemperatura(texto);
      if (t !== null && t > limite) motivos.push(`${nome} ${n}: ${fmt(t)} ºC (limite ${fmt(limite)} ºC)`);
    });
  }
  return { conformidade: motivos.length === 0, motivos };
}

/** Aplica conformidade e detalhes de RNC sobre o valor digitado — é o que o widget emite. */
export function montarValorTemperatura(v: TemperaturaResfriamentoValor): TemperaturaResfriamentoValor {
  const { conformidade, motivos } = avaliarTemperaturas(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Temperatura acima do limite — ${motivos.join("; ")}` : null };
}

/** Tudo é obrigatório: 10 temperaturas de água, 2 ambientes, tipo da parte e 2 amostras de cada um dos 7 produtos. */
export function motivosBloqueioTemperatura(v: TemperaturaResfriamentoValor | undefined | null): string[] {
  const p = "Temperaturas do pré-resfriamento";
  if (!v) return [`${p}: informe as temperaturas da água e dos produtos.`];
  const m: string[] = [];
  for (const ponto of PONTOS_AGUA) {
    if (lerTemperatura(v.agua?.[ponto.chave]) === null) m.push(`${p}: informe ${ponto.rotulo}.`);
  }
  for (const ponto of PONTOS_AMBIENTE) {
    if (lerTemperatura(v.ambiente?.[ponto.chave]) === null) m.push(`${p}: informe a temperatura ambiente da ${ponto.rotulo}.`);
  }
  if (!v.tipoParte) m.push(`${p}: selecione qual parte foi aferida.`);
  for (const prod of PRODUTOS) {
    const a = v.produtos?.[prod.chave];
    (["1", "2"] as const).forEach((n) => {
      if (lerTemperatura(n === "1" ? a?.amostra1 : a?.amostra2) === null) m.push(`${p}: informe a temperatura da amostra ${n} de ${prod.amostra.toLowerCase()}.`);
    });
  }
  return m;
}
