// Conferência das aves programadas do dia contra as aves já consideradas nos monitoramentos de vazão (SPR Carcaças),
// carga a carga. Funções PURAS; testadas em tests/unit/avesNaVazao.test.ts.
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

/** Único setor em que o cartão "Aves na vazão" aparece (e de onde vêm os monitoramentos contados). */
export const SETOR_AVES_NA_VAZAO = "PRÉ-RESFRIAMENTO 02";

/** Carga programada do dia (campos usados aqui; vem de `cargas_rastreabilidade_do_dia`). */
export interface CargaProgramada {
  carga_id: string;
  gta: string;
  integrado: string;
  aviario: string;
  qtd_aves: number;
  placa: string | null;
}

/** Um monitoramento de vazão já assinado: só o que importa para a contagem. */
export interface RegistroVazao {
  /** Valor do campo "chiller_carcacas" do monitoramento. */
  carcacas: Pick<ChillerCarcacasValor, "cargas" | "chegada"> | undefined;
}

export type SituacaoCarga = "completa" | "parcial" | "nao_iniciada";

export interface LinhaAvesVazao {
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  placa: string | null;
  programadas: number;
  /** Aves desta carga já consideradas nos monitoramentos de vazão (nunca passa das programadas). */
  contadas: number;
  /** Parte de `contadas` que o inspetor digitou à mão (sem carga) e o sistema atribuiu a esta carga pela ordem da pendura. */
  aMao: number;
  situacao: SituacaoCarga;
}

export interface ResumoAvesVazao {
  linhas: LinhaAvesVazao[];
  totalProgramadas: number;
  totalContadas: number;
  /** Cargas que ainda não entraram por inteiro. */
  incompletas: number;
  /** Aves digitadas à mão (sem carga) nos monitoramentos, no total. */
  totalAMao: number;
  /** Aves digitadas à mão que sobraram depois de encher todas as cargas programadas (passam do total do dia). */
  aMaoExcedente: number;
}

function lerInteiro(texto: string | number | undefined): number {
  const n = Number.parseInt(String(texto ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Aves já consideradas, em dois grupos:
 * - `porCarga`: lotes ligados a uma carga. Vale o que os lotes dos monitoramentos de fato usaram (soma de `quantity`);
 *   para registros sem lotes ligados à carga (antigos), vale o acumulado por carga guardado em `chegada`.
 * - `aMao`: lotes digitados à mão, sem carga — quantidade solta que o sistema distribui pelas cargas (ver conferirAvesNaVazao). */
export function avesContadas(registros: RegistroVazao[]): { porCarga: Map<string, number>; aMao: number } {
  const dosLotes = new Map<string, number>();
  const doAcumulado = new Map<string, number>();
  let aMao = 0;
  for (const r of registros) {
    for (const lote of r.carcacas?.cargas ?? []) {
      if (!lote.cargaId) {
        aMao += lerInteiro(lote.quantity);
        continue;
      }
      dosLotes.set(lote.cargaId, (dosLotes.get(lote.cargaId) ?? 0) + lerInteiro(lote.quantity));
    }
    for (const [cargaId, aves] of Object.entries(r.carcacas?.chegada?.acumulado ?? {})) {
      doAcumulado.set(cargaId, Math.max(doAcumulado.get(cargaId) ?? 0, aves));
    }
  }
  const porCarga = new Map(doAcumulado);
  for (const [cargaId, aves] of dosLotes) porCarga.set(cargaId, aves);
  return { porCarga, aMao };
}

/** `cargas` deve vir na ordem da linha de abate (é como `cargas_rastreabilidade_do_dia` devolve: primeiro as cargas com
 * pendura registrada, por horário, depois as demais na ordem da programação). As aves digitadas à mão enchem as cargas
 * NESSA ordem, só no que ainda falta de cada uma. Nada disso é gravado: é recalculado a cada leitura, então quando o
 * Bem-Estar Animal registra (ou corrige) o horário de uma pendura a ordem muda e a atribuição se corrige sozinha. */
export function conferirAvesNaVazao(cargas: CargaProgramada[], registros: RegistroVazao[]): ResumoAvesVazao {
  const { porCarga, aMao } = avesContadas(registros);
  let sobraAMao = aMao;
  const linhas: LinhaAvesVazao[] = cargas
    .filter((c) => c.qtd_aves > 0)
    .map((c) => {
      const ligadas = Math.min(c.qtd_aves, Math.max(0, Math.round(porCarga.get(c.carga_id) ?? 0)));
      const daMao = Math.min(sobraAMao, c.qtd_aves - ligadas);
      sobraAMao -= daMao;
      const contadas = ligadas + daMao;
      return {
        cargaId: c.carga_id,
        gta: c.gta,
        integrado: c.integrado,
        aviario: c.aviario,
        placa: c.placa,
        programadas: c.qtd_aves,
        contadas,
        aMao: daMao,
        situacao: contadas >= c.qtd_aves ? "completa" : contadas > 0 ? "parcial" : "nao_iniciada",
      };
    });
  return {
    linhas,
    totalProgramadas: linhas.reduce((t, l) => t + l.programadas, 0),
    totalContadas: linhas.reduce((t, l) => t + l.contadas, 0),
    incompletas: linhas.filter((l) => l.situacao !== "completa").length,
    totalAMao: aMao,
    aMaoExcedente: sobraAMao,
  };
}
