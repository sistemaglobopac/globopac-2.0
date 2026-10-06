import { turnoParaHeranca, type TurnoHeranca } from "./turnoUtils";
import { dataManaus } from "./horaMonitoramento";
import type { Rascunho } from "@/lib/rascunhos";

export interface RegistroAnterior {
  id: string;
  dados_dinamicos: Record<string, unknown>;
  /** Hora EFETIVA do monitoramento (a informada pelo inspetor). */
  criado_em: string;
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
