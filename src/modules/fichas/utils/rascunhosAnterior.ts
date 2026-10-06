import { turnoParaHeranca, type TurnoHeranca } from "./turnoUtils";
import { dataManaus } from "./horaMonitoramento";
import type { Rascunho } from "@/lib/rascunhos";
import type { CargaDoa } from "../fields/tiposCompostos";

export interface RegistroAnterior {
  id: string;
  dados_dinamicos: Record<string, unknown>;
  /** Hora EFETIVA do monitoramento (a informada pelo inspetor). */
  criado_em: string;
}

/** Ids das cargas já usadas como lote do SPR Carcaças nos RASCUNHOS locais desta ficha+setor. Um
 * rascunho ainda não assinado não aparece em cargas_ja_monitoradas (servidor): sem isto, a carga
 * voltaria a ser oferecida para herdar no monitoramento seguinte e entraria duas vezes na vazão. */
export function cargasEmRascunhos(rascunhos: Rascunho[] | undefined, codigo: string, setor: string): Set<string> {
  const ids = new Set<string>();
  for (const r of rascunhos ?? []) {
    if (r.codigo !== codigo || r.setor !== setor) continue;
    for (const valor of Object.values(r.dadosDinamicos ?? {})) {
      const cargas = (valor as { cargas?: unknown } | null)?.cargas;
      if (!Array.isArray(cargas)) continue;
      for (const c of cargas as { cargaId?: unknown; avgLiveWeight?: unknown }[]) {
        if (typeof c?.cargaId === "string" && c.avgLiveWeight !== undefined) ids.add(c.cargaId);
      }
    }
  }
  return ids;
}

/** Cargas já monitoradas nos RASCUNHOS locais do usuário, por tipo de monitoramento. O servidor (cargas_ja_monitoradas) só
 * conhece o que já foi assinado: sem isto, uma carga salva só como rascunho voltaria a ser oferecida no monitoramento
 * seguinte. Vale para qualquer ficha do mesmo tipo de campo (a carga é monitorada uma vez por tipo, não por ficha). */
export interface CargasEmRascunhoPorTipo {
  /** Recepção de aves (início da pendura). */
  recepcao: Set<string>;
  /** Peso por caixa de transporte. */
  peso: Set<string>;
  /** Rastreabilidade e DOA: as linhas já preenchidas, que entram como "já registradas" (somente leitura). */
  doa: CargaDoa[];
}

const preenchido = (t: unknown) => typeof t === "string" && t.trim() !== "";

export function cargasEmRascunhoPorTipo(rascunhos: Rascunho[] | undefined): CargasEmRascunhoPorTipo {
  const r: CargasEmRascunhoPorTipo = { recepcao: new Set(), peso: new Set(), doa: [] };
  for (const rascunho of rascunhos ?? []) {
    for (const valor of Object.values(rascunho.dadosDinamicos ?? {})) {
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) continue;
      const v = valor as Record<string, unknown>;
      // Recepção: o valor do campo tem `penduraInicioEm` e `cargaId`.
      if ("penduraInicioEm" in v && preenchido(v.cargaId)) r.recepcao.add(v.cargaId as string);
      const cargas = v.cargas;
      if (!Array.isArray(cargas)) continue;
      for (const c of cargas as Record<string, unknown>[]) {
        if (!c || typeof c !== "object" || !preenchido(c.cargaId)) continue;
        if ("avesPorCaixa" in c) r.peso.add(c.cargaId as string);
        if ("avesMortas" in c && (preenchido(c.avesRecebidas) || preenchido(c.avesMortas))) r.doa.push(c as unknown as CargaDoa);
      }
    }
  }
  return r;
}

/** O "monitoramento anterior" que o novo preenchimento herda: o mais recente entre o último registro
 * já gravado no servidor e os RASCUNHOS locais desta ficha+setor, de hoje e do mesmo turno. Assim o
 * 2º monitoramento feito offline (ou ainda não assinado) herda as leituras do 1º, no aparelho.
 * Devolve undefined enquanto não há registro nem rascunho e o servidor ainda não respondeu. */
export function combinarAnterior(
  doServidor: RegistroAnterior | null | undefined,
  rascunhos: Rascunho[] | undefined,
  codigo: string,
  setor: string,
  turno: TurnoHeranca | undefined,
  agora: Date,
  /** "continuacao": o inspetor está registrando monitoramentos de ANTES de hoje (continuação); vale o
   * rascunho mais recente da ficha+setor, de qualquer dia e turno. */
  modo: "hoje" | "continuacao" = "hoje"
): RegistroAnterior | null | undefined {
  const hoje = dataManaus(agora);
  const candidatos: RegistroAnterior[] = (rascunhos ?? [])
    .filter(
      (r) =>
        r.codigo === codigo &&
        r.setor === setor &&
        (modo === "continuacao" ||
          (dataManaus(new Date(r.horaMonitoramento)) === hoje && (!turno || turnoParaHeranca(new Date(r.horaMonitoramento)) === turno)))
    )
    .map((r) => ({ id: r.id, dados_dinamicos: r.dadosDinamicos, criado_em: r.horaMonitoramento }));
  if (doServidor) candidatos.push(doServidor);
  if (candidatos.length === 0) return doServidor;
  return candidatos.sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0];
}
