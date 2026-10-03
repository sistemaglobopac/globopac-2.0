// Quando o inspetor assina um adendo, o sistema NÃO altera o monitoramento original (pode estar
// liberado ao SIF): grava um aditivo (novo registro com `aditivo_de`) cujo array de adendos traz
// aquele adendo como "completed". O adendo do original continua "pending_monitor" no banco, então a
// pendência é resolvida aqui: um adendo só está pendente se nenhum aditivo o concluiu.
// Testado em tests/unit/adendosPendentes.test.ts.

interface RegistroComAdendos {
  aditivo_de?: string | null;
  dados_dinamicos: Record<string, unknown> | null;
}

interface AdendoMinimo {
  id?: string;
  status?: string;
}

function adendosDe(registro: RegistroComAdendos): AdendoMinimo[] {
  const lista = (registro.dados_dinamicos as { adendos?: unknown } | null)?.adendos;
  return Array.isArray(lista) ? (lista as AdendoMinimo[]) : [];
}

/** Ids dos adendos já concluídos (assinados pelo inspetor) em algum aditivo dos registros. */
export function idsAdendosConcluidos(registros: RegistroComAdendos[]): Set<string> {
  const ids = new Set<string>();
  for (const r of registros) {
    if (!r.aditivo_de) continue;
    for (const a of adendosDe(r)) if (a.id && a.status === "completed") ids.add(a.id);
  }
  return ids;
}

/** O registro tem ao menos um adendo aguardando a assinatura do inspetor (e nenhum aditivo o concluiu)? */
export function temAdendoPendente(registro: RegistroComAdendos, concluidos: Set<string>): boolean {
  return adendosDe(registro).some((a) => a.status === "pending_monitor" && !(a.id && concluidos.has(a.id)));
}
