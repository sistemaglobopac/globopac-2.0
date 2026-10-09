// Monitoramento de Potabilidade da Água (pH e cloro) dos Sistemas de Pré-resfriamento — funções
// PURAS (sem React). A cada monitoramento (de hora em hora) testa-se UM tanque de cada sistema
// (carcaças, partes e miúdos); o tanque da vez gira em rodízio e nunca repete o do monitoramento
// anterior, de modo que todos os tanques sejam testados ao longo do turno. Testadas em
// tests/unit/potabilidadeAgua.test.ts.
import type { ChaveSistemaPotabilidade, PotabilidadeAguaValor, TesteTanque } from "./tiposCompostos";

export const LIMITE_PH = { min: 6.0, max: 9.0 };
export const LIMITE_CLORO_PPM = { min: 0.2, max: 5.0 };

export const SISTEMAS_POTABILIDADE: { chave: ChaveSistemaPotabilidade; rotulo: string; tanques: { chave: string; rotulo: string }[] }[] = [
  {
    chave: "carcacas",
    rotulo: "Pré-resfriamento de Carcaças",
    tanques: [
      { chave: "preChiller", rotulo: "Pré-chiller" },
      { chave: "chiller1", rotulo: "Chiller 01" },
      { chave: "chiller2", rotulo: "Chiller 02" },
    ],
  },
  {
    chave: "partes",
    rotulo: "Pré-resfriamento de Partes",
    tanques: [
      { chave: "chillerPartes1", rotulo: "Chiller de partes 01" },
      { chave: "chillerPartes2", rotulo: "Chiller de partes 02" },
    ],
  },
  {
    chave: "miudos",
    rotulo: "Pré-resfriamento de Miúdos",
    tanques: [
      { chave: "miniFigado", rotulo: "Mini-chiller de fígado" },
      { chave: "miniMoela", rotulo: "Mini-chiller de moela" },
      { chave: "miniCabeca", rotulo: "Mini-chiller de cabeça" },
      { chave: "miniCoracao", rotulo: "Mini-chiller de coração" },
      { chave: "miniPes", rotulo: "Mini-chiller de pés" },
    ],
  },
];

export function rotuloTanque(sistema: ChaveSistemaPotabilidade, tanque: string): string {
  return SISTEMAS_POTABILIDADE.find((s) => s.chave === sistema)?.tanques.find((t) => t.chave === tanque)?.rotulo ?? tanque;
}

/** Próximo tanque do rodízio: o seguinte ao testado no monitoramento anterior (volta ao primeiro no
 * fim da lista), então nunca repete o anterior quando o sistema tem 2+ tanques e passa por todos. */
export function proximoTanque(sistema: ChaveSistemaPotabilidade, anterior: string | undefined | null): string {
  const tanques = SISTEMAS_POTABILIDADE.find((s) => s.chave === sistema)!.tanques;
  const indice = tanques.findIndex((t) => t.chave === anterior);
  return tanques[(indice + 1) % tanques.length]!.chave;
}

/** Tanques do sistema que ainda podem ser sorteados (os que não foram marcados como parados). */
function tanquesEmFuncionamento(sistema: ChaveSistemaPotabilidade, parados: string[] | undefined): string[] {
  const todos = SISTEMAS_POTABILIDADE.find((s) => s.chave === sistema)!.tanques.map((t) => t.chave);
  return todos.filter((t) => !(parados ?? []).includes(t));
}

/** Refaz o sorteio quando o tanque da vez está com o processo parado: marca o atual como parado e passa para o seguinte do
 * rodízio que esteja funcionando, preferindo um que não seja o do monitoramento anterior. Sem nenhum tanque funcionando,
 * o sistema fica "sem teste". As medidas digitadas são descartadas (eram de outro tanque). */
export function sortearOutroTanque(sistema: ChaveSistemaPotabilidade, t: TesteTanque, anterior?: string | null): TesteTanque {
  const parados = [...(t.tanquesParados ?? []), ...((t.tanquesParados ?? []).includes(t.tanque) ? [] : [t.tanque])];
  const todos = SISTEMAS_POTABILIDADE.find((s) => s.chave === sistema)!.tanques.map((x) => x.chave);
  const disponiveis = tanquesEmFuncionamento(sistema, parados);
  if (disponiveis.length === 0) return { tanque: t.tanque, ph: "", cloro: "", tanquesParados: parados, semTeste: true };
  // Ordem do rodízio a partir do tanque que acabou de ser pulado.
  const inicio = todos.indexOf(t.tanque);
  const emOrdem = [...todos.slice(inicio + 1), ...todos.slice(0, inicio + 1)].filter((x) => disponiveis.includes(x));
  const escolhido = emOrdem.find((x) => x !== anterior) ?? emOrdem[0]!;
  return { tanque: escolhido, ph: "", cloro: "", tanquesParados: parados };
}

/** Todos os tanques do sistema já foram marcados como parados? */
export function todosTanquesParados(sistema: ChaveSistemaPotabilidade, t: TesteTanque | undefined): boolean {
  return tanquesEmFuncionamento(sistema, t?.tanquesParados).length === 0;
}

/** Desfaz o sorteio refeito (o tanque voltou a funcionar): volta ao tanque da vez do rodízio. */
export function reiniciarSorteio(sistema: ChaveSistemaPotabilidade, anterior?: string | null): TesteTanque {
  return testeVazio(proximoTanque(sistema, anterior));
}

export function testeVazio(tanque: string): TesteTanque {
  return { tanque, ph: "", cloro: "" };
}

/** Monitoramento novo: tanque da vez de cada sistema, a partir do monitoramento anterior do turno. */
export function potabilidadeInicial(anterior?: PotabilidadeAguaValor | null): PotabilidadeAguaValor {
  const sistemas = Object.fromEntries(
    SISTEMAS_POTABILIDADE.map((s) => [s.chave, testeVazio(proximoTanque(s.chave, anterior?.sistemas?.[s.chave]?.tanque))])
  ) as Record<ChaveSistemaPotabilidade, TesteTanque>;
  return { sistemas, conformidade: true, detalhesRNC: null };
}

/** "6,5" ou "6.5" → 6.5; vazio/inválido → null. */
export function lerMedida(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim().replace(",", ".");
  if (t === "" || !/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function phForaDoLimite(ph: number | null): boolean {
  return ph !== null && (ph < LIMITE_PH.min || ph > LIMITE_PH.max);
}

export function cloroForaDoLimite(cloro: number | null): boolean {
  return cloro !== null && (cloro < LIMITE_CLORO_PPM.min || cloro > LIMITE_CLORO_PPM.max);
}

/** pH fora de 6,0–9,0 ou cloro fora de 0,2–5,0 ppm, por sistema testado. */
export function avaliarPotabilidade(v: PotabilidadeAguaValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  for (const s of SISTEMAS_POTABILIDADE) {
    const t = v.sistemas[s.chave];
    if (t.semTeste) continue;
    const nome = `${s.rotulo.replace("Pré-resfriamento de ", "")} — ${rotuloTanque(s.chave, t.tanque)}`;
    const ph = lerMedida(t.ph);
    const cloro = lerMedida(t.cloro);
    if (phForaDoLimite(ph)) motivos.push(`${nome}: pH ${fmt(ph!)} (limite ${fmt(LIMITE_PH.min)} a ${fmt(LIMITE_PH.max)})`);
    if (cloroForaDoLimite(cloro)) motivos.push(`${nome}: cloro ${fmt(cloro!)} ppm (limite ${fmt(LIMITE_CLORO_PPM.min)} a ${fmt(LIMITE_CLORO_PPM.max)} ppm)`);
  }
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorPotabilidade(v: PotabilidadeAguaValor): PotabilidadeAguaValor {
  const { conformidade, motivos } = avaliarPotabilidade(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Potabilidade da água fora do limite — ${motivos.join("; ")}` : null };
}

/** Os 3 sistemas precisam de pH e cloro informados (exceto o sistema com todos os tanques parados). */
export function motivosBloqueioPotabilidade(v: PotabilidadeAguaValor | undefined | null): string[] {
  const p = "Potabilidade da água";
  if (!v?.sistemas) return [`${p}: informe o pH e o cloro dos 3 sistemas de pré-resfriamento.`];
  const m: string[] = [];
  for (const s of SISTEMAS_POTABILIDADE) {
    const t = v.sistemas[s.chave];
    if (t?.semTeste) continue;
    const nome = `${s.rotulo.replace("Pré-resfriamento de ", "")} (${rotuloTanque(s.chave, t?.tanque ?? "")})`;
    if (lerMedida(t?.ph) === null) m.push(`${p}: informe o pH de ${nome}.`);
    if (lerMedida(t?.cloro) === null) m.push(`${p}: informe o cloro de ${nome}.`);
  }
  return m;
}
