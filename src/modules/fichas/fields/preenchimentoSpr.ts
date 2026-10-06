// Campos em branco nos widgets de vazão (SPR Carcaças, Partes, Miúdos e Chuveiro Final): nenhum
// monitoramento pode virar rascunho nem ser assinado com campo visível sem preencher. Funções PURAS,
// testadas em tests/unit/preenchimentoSpr.test.ts.
//
// "Visível" segue a tela: no 1º monitoramento do dia (nenhum tanque com leitura anterior) só aparece a
// leitura atual; nos demais aparecem também a leitura anterior, o gelo e a base de cálculo.
import type { ChillerCarcacasValor, ChillerPartesValor, LavagemFinalValor, MiniChillersValor, TanqueHidrometro } from "./tiposCompostos";

const vazio = (texto: string | number | undefined | null) => String(texto ?? "").trim() === "";

const NOMES_TANQUE: Record<string, string> = {
  preChiller: "Pré-chiller",
  chiller1: "Chiller 1",
  chiller2: "Chiller 2",
  coracao: "Coração",
  moela: "Moela",
  figado: "Fígado",
  cabeca: "Cabeça",
  pes: "Pés",
};

function motivosTanques(prefixo: string, tanques: Record<string, TanqueHidrometro | undefined> | undefined, nomes: string[]): string[] {
  const m: string[] = [];
  // 1º do dia: nenhum tanque tem leitura anterior. Tanque ausente no valor conta como todo em branco.
  const primeiroDoDia = nomes.every((n) => vazio(tanques?.[n]?.prev));
  for (const n of nomes) {
    const t = tanques?.[n];
    const rotulo = `${prefixo} — ${NOMES_TANQUE[n] ?? n}`;
    if (!primeiroDoDia && vazio(t?.prev)) m.push(`${rotulo}: informe o Hidr. Anterior.`);
    if (vazio(t?.cur)) m.push(`${rotulo}: informe o Hidr. Atual.`);
    if (!primeiroDoDia && vazio(t?.ice)) m.push(`${rotulo}: informe o Gelo Adicionado (use 0 se não houve).`);
  }
  return m;
}

export function motivosPreenchimentoCarcacas(v: ChillerCarcacasValor | undefined | null): string[] {
  const p = "SPR Carcaças";
  const nomes = ["preChiller", "chiller1", "chiller2"];
  if (!v) return [`${p}: preencha o monitoramento.`];
  const m = motivosTanques(p, v.tanques as unknown as Record<string, TanqueHidrometro>, nomes);
  const primeiroDoDia = nomes.every((n) => vazio((v.tanques as unknown as Record<string, TanqueHidrometro | undefined>)?.[n]?.prev));
  if (!primeiroDoDia) {
    const cargas = v.cargas ?? [];
    if (cargas.length === 0) m.push(`${p}: informe ao menos um lote.`);
    cargas.forEach((c, i) => {
      if (vazio(c.quantity)) m.push(`${p} — Lote ${i + 1}: informe as Aves (un).`);
      if (vazio(c.avgLiveWeight)) m.push(`${p} — Lote ${i + 1}: informe o Peso Vivo (kg).`);
    });
    if (vazio(v.condenasParcial)) m.push(`${p}: informe as Carcaças Parcialmente Aproveitadas (use 0 se não houve).`);
    if (vazio(v.condenasTotal ?? v.condenas)) m.push(`${p}: informe as Carcaças Totalmente Condenadas (use 0 se não houve).`);
  }
  return m;
}

export function motivosPreenchimentoPartes(v: ChillerPartesValor | undefined | null): string[] {
  const p = "SPR Partes";
  if (!v) return [`${p}: preencha o monitoramento.`];
  return motivosTanques(p, v.tanques as unknown as Record<string, TanqueHidrometro>, ["chiller1", "chiller2"]);
}

export function motivosPreenchimentoMiudos(v: MiniChillersValor | undefined | null): string[] {
  const p = "SPR Miúdos";
  if (!v) return [`${p}: preencha o monitoramento.`];
  return motivosTanques(p, v.tanques as unknown as Record<string, TanqueHidrometro>, ["coracao", "moela", "figado", "cabeca", "pes"]);
}

export function motivosPreenchimentoChuveiro(v: LavagemFinalValor | undefined | null): string[] {
  const p = "Chuveiro Final";
  if (!v) return [`${p}: preencha o monitoramento.`];
  const m: string[] = [];
  // A leitura anterior vem travada; com ela aparecem também as carcaças parcialmente condenadas.
  const primeiroDoDia = vazio(v.chuveiro?.prev);
  if (vazio(v.chuveiro?.cur)) m.push(`${p}: informe o Hidr. Atual.`);
  if (!primeiroDoDia && vazio(v.condenacoesParciais)) m.push(`${p}: informe as Carcaças Parcialmente Condenadas (use 0 se não houve).`);
  return m;
}
