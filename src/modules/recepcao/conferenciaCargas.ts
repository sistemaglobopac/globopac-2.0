// Conferência das cargas programadas do dia: para cada carga, o que já foi feito em Recepção de Aves (transporte e
// jejum), Peso por Caixa (densidade nas caixas) e DOA, e o que falta — para o DOA e os demais monitoramentos
// poderem ser conciliados carga a carga. Função PURA; testada em tests/unit/conferenciaCargas.test.ts.
import type { CargaDoa } from "@/modules/fichas/fields/tiposCompostos";
import { lerContagem } from "@/modules/fichas/fields/rastreabilidadeDoa";
import type { CargaRastreabilidade } from "./api";

export interface LinhaConferencia {
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtdPrevista: number;
  placa: string;
  /** `YYYY-MM-DDTHH:mm`; vazio = sem pendura registrada. */
  penduraInicioEm: string;
  pesoMedioKg: string;
  recepcaoFeita: boolean;
  pesoCaixaFeito: boolean;
  doaApurada: boolean;
  avesRecebidas: string;
  avesMortas: string;
  doaPct: number | null;
  /** O que falta registrar, em texto (vazio = carga completa). */
  faltas: string[];
}

export interface ResumoConferencia {
  total: number;
  completas: number;
  comPendencia: number;
  semPesoMedio: number;
  semPendura: number;
}

export function montarConferencia(
  cargas: CargaRastreabilidade[],
  recepcaoIds: ReadonlySet<string>,
  pesoCaixaIds: ReadonlySet<string>,
  doaPorCarga: ReadonlyMap<string, Pick<CargaDoa, "avesRecebidas" | "avesMortas" | "doaPct">>
): LinhaConferencia[] {
  return cargas.map((c) => {
    const doa = doaPorCarga.get(c.carga_id);
    const doaApurada = !!doa && lerContagem(doa.avesRecebidas) !== null && lerContagem(doa.avesMortas) !== null;
    const recepcaoFeita = recepcaoIds.has(c.carga_id);
    const pesoCaixaFeito = pesoCaixaIds.has(c.carga_id);
    const penduraInicioEm = c.pendura_inicio_em ?? "";
    const pesoMedioKg = c.peso_medio_kg ?? "";
    const faltas: string[] = [];
    if (!recepcaoFeita) faltas.push("Recepção de Aves (transporte e jejum)");
    else if (!penduraInicioEm) faltas.push("início da pendura");
    if (!pesoCaixaFeito) faltas.push("Peso por Caixa (densidade)");
    else if (!pesoMedioKg) faltas.push("peso médio (aguardando a balança)");
    if (!doaApurada) faltas.push("DOA");
    return {
      cargaId: c.carga_id,
      gta: c.gta,
      integrado: c.integrado,
      aviario: c.aviario,
      nucleo: c.nucleo,
      qtdPrevista: c.qtd_aves,
      placa: c.placa ?? "",
      penduraInicioEm,
      pesoMedioKg,
      recepcaoFeita,
      pesoCaixaFeito,
      doaApurada,
      avesRecebidas: doa?.avesRecebidas ?? "",
      avesMortas: doa?.avesMortas ?? "",
      doaPct: doa?.doaPct ?? null,
      faltas,
    };
  });
}

export function resumirConferencia(linhas: LinhaConferencia[]): ResumoConferencia {
  const completas = linhas.filter((l) => l.faltas.length === 0).length;
  return {
    total: linhas.length,
    completas,
    comPendencia: linhas.length - completas,
    semPesoMedio: linhas.filter((l) => !l.pesoMedioKg).length,
    semPendura: linhas.filter((l) => !l.penduraInicioEm).length,
  };
}
