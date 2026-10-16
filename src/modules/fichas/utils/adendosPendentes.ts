// Quando o inspetor assina um adendo, o sistema NÃO altera o monitoramento original (pode estar
// liberado ao SIF): grava um aditivo (novo registro com `aditivo_de`) cujo array de adendos traz
// aquele adendo como "completed". O adendo do original continua "pending_monitor" no banco, então a
// pendência é resolvida aqui: um adendo só está pendente se o aditivo VIGENTE (o mais recente da
// cadeia, o mesmo que a view monitoramentos_vigentes mostra) não o concluiu. Aditivos antigos não
// contam: um aditivo irmão que concluiu só o adendo A não resolve o adendo B no aditivo vigente.
// Testado em tests/unit/adendosPendentes.test.ts.

interface RegistroComAdendos {
  id?: string;
  aditivo_de?: string | null;
  criado_em?: string;
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

/** Aditivos vigentes: de cada cadeia (mesmo `aditivo_de`) fica só o mais recente — mesmo critério da view
 * monitoramentos_vigentes (criado_em, desempate por id). Sem criado_em/id (dado parcial), vale o último da lista. */
export function aditivosVigentes<T extends RegistroComAdendos>(registros: T[]): T[] {
  const maisRecente = new Map<string, { registro: T; indice: number }>();
  registros.forEach((registro, indice) => {
    const raiz = registro.aditivo_de;
    if (!raiz) return;
    const atual = maisRecente.get(raiz);
    if (!atual) return void maisRecente.set(raiz, { registro, indice });
    const a = atual.registro;
    const mais =
      registro.criado_em !== undefined && a.criado_em !== undefined && registro.criado_em !== a.criado_em
        ? registro.criado_em > a.criado_em
        : registro.id !== undefined && a.id !== undefined && registro.id !== a.id
          ? registro.id > a.id
          : indice > atual.indice;
    if (mais) maisRecente.set(raiz, { registro, indice });
  });
  return [...maisRecente.values()].map((v) => v.registro);
}

/** Ids dos adendos já concluídos (assinados pelo inspetor) no aditivo vigente de cada cadeia. */
export function idsAdendosConcluidos(registros: RegistroComAdendos[]): Set<string> {
  const ids = new Set<string>();
  for (const r of aditivosVigentes(registros)) {
    for (const a of adendosDe(r)) if (a.id && a.status === "completed") ids.add(a.id);
  }
  return ids;
}

/** O registro recebeu adendo (ele mesmo traz adendos, ou é o aditivo/versão corrigida de outro)? Usado para tratar a não conformidade. */
export function temAdendoRegistrado(registro: RegistroComAdendos): boolean {
  return Boolean(registro.aditivo_de) || adendosDe(registro).length > 0;
}

/** O registro tem ao menos um adendo aguardando a assinatura do inspetor (e nenhum aditivo o concluiu)? */
export function temAdendoPendente(registro: RegistroComAdendos, concluidos: Set<string>): boolean {
  return adendosDe(registro).some((a) => a.status === "pending_monitor" && !(a.id && concluidos.has(a.id)));
}
