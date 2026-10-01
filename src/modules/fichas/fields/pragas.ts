// Monitoramento diário de ocorrência de pragas — lista fixa, texto das medidas corretivas e
// funções PURAS (sem React) usadas pelo widget, pelo bloqueio de assinatura e pelo relatório
// mensal consolidado. Testadas em tests/unit/pragas.test.ts.
import type { OcorrenciaPragasValor } from "./tiposCompostos";

export const PRAGAS: { chave: string; rotulo: string }[] = [
  { chave: "abelhas", rotulo: "Abelhas" },
  { chave: "aves", rotulo: "Aves" },
  { chave: "baratas", rotulo: "Baratas" },
  { chave: "besouros", rotulo: "Besouros" },
  { chave: "caes", rotulo: "Cães" },
  { chave: "carunchos", rotulo: "Carunchos" },
  { chave: "escorpioes", rotulo: "Escorpiões" },
  { chave: "formigas", rotulo: "Formigas" },
  { chave: "gatos", rotulo: "Gatos" },
  { chave: "lagartas", rotulo: "Lagartas" },
  { chave: "moscas", rotulo: "Moscas" },
  { chave: "mosquitos", rotulo: "Mosquitos" },
  { chave: "piolhos", rotulo: "Piolhos" },
  { chave: "pulgas", rotulo: "Pulgas" },
  { chave: "tracas", rotulo: "Traças" },
  { chave: "outras", rotulo: "Outras Pragas (citar)" },
];

export const CHAVE_OUTRAS = "outras";

export const MEDIDAS_CORRETIVAS =
  "A equipe de higienização foi acionada para remover a praga e proceder com a higienização do local. A ocorrência foi comunicada à empresa responsável pelo controle integrado de pragas para que sejam adotadas medidas de mitigação e controle.";

export function pragasVazias(): Record<string, boolean> {
  return Object.fromEntries(PRAGAS.map((p) => [p.chave, false]));
}

/** Rótulo da praga; para "Outras" usa a descrição citada pelo inspetor. */
export function rotuloDaPraga(chave: string, outrasPragas = ""): string {
  if (chave === CHAVE_OUTRAS) return outrasPragas.trim() ? `Outras: ${outrasPragas.trim()}` : "Outras Pragas";
  return PRAGAS.find((p) => p.chave === chave)?.rotulo ?? chave;
}

export function pragasPresentes(valor: Pick<OcorrenciaPragasValor, "pragas">): string[] {
  return PRAGAS.filter((p) => valor.pragas?.[p.chave] === true).map((p) => p.chave);
}

export function montarValorPragas(pragas: Record<string, boolean>, outrasPragas: string, acoesCorretivas: boolean): OcorrenciaPragasValor {
  const houvePraga = PRAGAS.some((p) => pragas[p.chave] === true);
  return {
    pragas,
    outrasPragas: pragas[CHAVE_OUTRAS] ? outrasPragas : "",
    houvePraga,
    acoesCorretivas: houvePraga && acoesCorretivas,
    medidasCorretivas: houvePraga && acoesCorretivas ? MEDIDAS_CORRETIVAS : null,
  };
}

/** Motivos que impedem assinar: com praga, as ações corretivas precisam estar marcadas e, se
 * "Outras" estiver marcada, a praga precisa ser citada. */
export function motivosBloqueioPragas(valor: OcorrenciaPragasValor | undefined | null): string[] {
  if (!valor) return [];
  const motivos: string[] = [];
  if (valor.pragas?.[CHAVE_OUTRAS] && !valor.outrasPragas?.trim()) {
    motivos.push('Pragas: cite qual é a praga em "Outras Pragas (citar)".');
  }
  if (valor.houvePraga && !valor.acoesCorretivas) {
    motivos.push("Pragas: houve ocorrência — confirme que as ações corretivas foram executadas.");
  }
  return motivos;
}

// ---------------- Relatório mensal consolidado ----------------

export interface RegistroPragaDia {
  /** YYYY-MM-DD (fuso de Manaus). */
  dia: string;
  setor: string;
  valor: OcorrenciaPragasValor | null;
}

export type StatusDia = "sem-registro" | "ausente" | "presente";

export interface OcorrenciaMes {
  dia: string;
  praga: string;
  rotulo: string;
  setor: string;
}

export interface ConsolidadoPragas {
  /** Dias do mês (1..N) com ao menos um registro. */
  diasMonitorados: number[];
  /** dia (1..N) → status geral (presente se qualquer setor teve praga). */
  statusPorDia: Record<number, StatusDia>;
  /** chave da praga → dia → presente? (só dias com registro). */
  presencaPorPraga: Record<string, Record<number, boolean>>;
  ocorrencias: OcorrenciaMes[];
  houvePragaNoMes: boolean;
  /** Dias sem nenhum registro (o monitoramento é obrigatório todo dia). */
  diasSemRegistro: number[];
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Consolida os registros de um mês (ano, mes 1-12). Registros de outros meses são ignorados. */
export function consolidarPragasMes(registros: RegistroPragaDia[], ano: number, mes: number): ConsolidadoPragas {
  const total = diasNoMes(ano, mes);
  const prefixo = `${ano}-${String(mes).padStart(2, "0")}-`;
  const statusPorDia: Record<number, StatusDia> = {};
  const presencaPorPraga: Record<string, Record<number, boolean>> = Object.fromEntries(PRAGAS.map((p) => [p.chave, {}]));
  const ocorrencias: OcorrenciaMes[] = [];

  for (let d = 1; d <= total; d += 1) statusPorDia[d] = "sem-registro";

  for (const registro of registros) {
    if (!registro.dia.startsWith(prefixo) || !registro.valor) continue;
    const dia = Number(registro.dia.slice(8, 10));
    const presentes = pragasPresentes(registro.valor);
    for (const praga of PRAGAS) {
      const porDia = presencaPorPraga[praga.chave]!;
      porDia[dia] = (porDia[dia] ?? false) || presentes.includes(praga.chave);
    }
    for (const chave of presentes) {
      ocorrencias.push({ dia: registro.dia, praga: chave, rotulo: rotuloDaPraga(chave, registro.valor.outrasPragas), setor: registro.setor });
    }
    if (presentes.length > 0) statusPorDia[dia] = "presente";
    else if (statusPorDia[dia] !== "presente") statusPorDia[dia] = "ausente";
  }

  const dias = Object.keys(statusPorDia).map(Number);
  return {
    diasMonitorados: dias.filter((d) => statusPorDia[d] !== "sem-registro"),
    statusPorDia,
    presencaPorPraga,
    ocorrencias: ocorrencias.sort((a, b) => a.dia.localeCompare(b.dia) || a.rotulo.localeCompare(b.rotulo)),
    houvePragaNoMes: ocorrencias.length > 0,
    diasSemRegistro: dias.filter((d) => statusPorDia[d] === "sem-registro"),
  };
}
