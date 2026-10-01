// Apuração dos 4 monitoramentos de água para o RELATÓRIO (auditoria): reaplica, com as MESMAS
// funções puras de calculosSpr.ts (uma só implementação das fórmulas), os números gravados no
// registro — litros usados, litros por carcaça e por quilo de produto, meta e situação — e monta
// a "memória de cálculo" linha a linha para o auditor conferir a conformidade. Nada aqui altera
// o que foi gravado; é só leitura/explicação. Testado em tests/unit/apuracaoRelatorio.test.ts.
import {
  aguaUsadaLitros,
  metaTanqueCarcacas,
  META_L_CARCACA,
  META_L_KG,
  massaPartes,
  numero,
  pesosMiudosPorCarcaca,
  type ChaveMiudo,
  type ChaveTanqueCarcacas,
} from "./calculosSpr";
import type { ChillerCarcacasValor, ChillerPartesValor, LavagemFinalValor, MiniChillersValor, TanqueHidrometro } from "./tiposCompostos";

export interface LinhaApuracao {
  ponto: string;
  /** Sem leitura atual/anterior não há apuração (ex.: 1º monitoramento do dia). */
  apurada: boolean;
  aguaL: number;
  /** Denominador de conformidade e sua unidade ("aves" | "kg"). */
  base: number;
  baseUnidade: "aves" | "kg";
  litrosPorCarcaca: number | null;
  litrosPorKg: number | null;
  /** Indicador que decide a conformidade e sua meta (mínima). */
  unidadeMeta: "L/carcaça" | "L/kg";
  apurado: number | null;
  meta: number;
  conforme: boolean | null;
  /** "(atual − anterior) × 1000 + gelo = … L ÷ base = …" — a conta com os números do registro. */
  memoria: string;
}

const fmt = (n: number, min = 3, max = 3) => n.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
const fmtHidr = (n: number) => fmt(n, 2, 3);
const fmtInt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function montarLinha(args: {
  ponto: string;
  tanque: Pick<TanqueHidrometro, "prev" | "cur"> & { ice?: string };
  temGelo: boolean;
  base: number;
  baseUnidade: "aves" | "kg";
  /** Nº de carcaças/aves para o L/carcaça (0 = indisponível). */
  aves: number;
  /** kg de produto para o L/kg (0 = indisponível). */
  kg: number;
  unidadeMeta: "L/carcaça" | "L/kg";
  meta: number;
}): LinhaApuracao {
  const { ponto, tanque, temGelo, base, baseUnidade, aves, kg, unidadeMeta, meta } = args;
  const cur = numero(tanque.cur);
  const prev = numero(tanque.prev);
  const gelo = temGelo ? numero(tanque.ice ?? "") : 0;
  const apurada = cur > 0 && tanque.prev !== "" && base > 0;
  const aguaL = aguaUsadaLitros(tanque.prev, tanque.cur, gelo);

  if (!apurada) {
    return {
      ponto,
      apurada,
      aguaL: cur > 0 && tanque.prev !== "" ? aguaL : 0,
      base,
      baseUnidade,
      litrosPorCarcaca: null,
      litrosPorKg: null,
      unidadeMeta,
      apurado: null,
      meta,
      conforme: null,
      memoria: cur > 0 && tanque.prev === "" ? "Sem leitura anterior (1º monitoramento do dia) — sem apuração." : "Sem leitura atual ou sem base de cálculo — sem apuração.",
    };
  }

  const litrosPorCarcaca = aves > 0 ? aguaL / aves : null;
  const litrosPorKg = kg > 0 ? aguaL / kg : null;
  const apurado = unidadeMeta === "L/carcaça" ? litrosPorCarcaca : litrosPorKg;
  const conforme = apurado !== null ? apurado >= meta : null;
  const contaAgua = temGelo
    ? `(${fmtHidr(cur)} − ${fmtHidr(prev)}) × 1000 + ${fmtInt(gelo)} = ${fmtInt(aguaL)} L`
    : `(${fmtHidr(cur)} − ${fmtHidr(prev)}) × 1000 = ${fmtInt(aguaL)} L`;
  const conta = `${contaAgua}; ÷ ${fmtInt(base)} ${baseUnidade} = ${apurado !== null ? fmt(apurado) : "—"} ${unidadeMeta} (meta ≥ ${fmt(meta)})`;

  return {
    ponto,
    apurada,
    aguaL,
    base,
    baseUnidade,
    litrosPorCarcaca,
    litrosPorKg,
    unidadeMeta,
    apurado,
    meta,
    conforme,
    memoria: conta,
  };
}

const ROTULO_CARCACAS: Record<ChaveTanqueCarcacas, string> = { preChiller: "Pré-chiller", chiller1: "Chiller 01", chiller2: "Chiller 02 (Último)" };

export function apuracaoCarcacas(valor: ChillerCarcacasValor): LinhaApuracao[] {
  const aves = valor.totalAves;
  const peso = valor.pesoMedioCarcaca;
  return (Object.keys(ROTULO_CARCACAS) as ChaveTanqueCarcacas[]).map((chave) =>
    montarLinha({
      ponto: ROTULO_CARCACAS[chave],
      tanque: valor.tanques[chave],
      temGelo: true,
      base: aves,
      baseUnidade: "aves",
      aves,
      kg: aves * peso,
      unidadeMeta: "L/carcaça",
      meta: metaTanqueCarcacas(chave, peso),
    })
  );
}

export function apuracaoPartes(valor: ChillerPartesValor): LinhaApuracao[] {
  const kg = massaPartes(valor.totalCondenacoes, valor.pesoMedioCarcaca);
  const rotulo = { chiller1: "Chiller 01 Partes", chiller2: "Chiller 02 Partes" } as const;
  return (["chiller1", "chiller2"] as const).map((chave) =>
    montarLinha({
      ponto: rotulo[chave],
      tanque: valor.tanques[chave],
      temGelo: true,
      base: kg,
      baseUnidade: "kg",
      aves: valor.totalCondenacoes,
      kg,
      unidadeMeta: "L/kg",
      meta: META_L_KG,
    })
  );
}

const ROTULO_MIUDO: Record<ChaveMiudo, string> = { coracao: "Coração", moela: "Moela", figado: "Fígado", cabeca: "Cabeça", pes: "Pés" };

export function apuracaoMiudos(valor: MiniChillersValor): LinhaApuracao[] {
  const pesos = pesosMiudosPorCarcaca(valor.pesoCarcaca);
  return (Object.keys(ROTULO_MIUDO) as ChaveMiudo[]).map((chave) => {
    const kg = valor.pesoCarcaca === 0 ? 0 : valor.totalAves * pesos[chave];
    return montarLinha({
      ponto: ROTULO_MIUDO[chave],
      tanque: valor.tanques[chave],
      temGelo: true,
      base: kg,
      baseUnidade: "kg",
      aves: valor.totalAves,
      kg,
      unidadeMeta: "L/kg",
      meta: META_L_KG,
    });
  });
}

/** `pesoCarcaca` (do SPR Carcaças da mesma ficha) só serve para informar o L/kg; sem ele o
 * indicador de conformidade (L/carcaça) segue igual. */
export function apuracaoChuveiro(valor: LavagemFinalValor, pesoCarcaca = 0): LinhaApuracao[] {
  return [
    montarLinha({
      ponto: "Chuveiro Final",
      tanque: valor.chuveiro,
      temGelo: false,
      base: valor.totalAves,
      baseUnidade: "aves",
      aves: valor.totalAves,
      kg: valor.totalAves * pesoCarcaca,
      unidadeMeta: "L/carcaça",
      meta: META_L_CARCACA,
    }),
  ];
}
