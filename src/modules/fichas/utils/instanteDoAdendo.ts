import { supabase } from "@/lib/supabase";
import { CHAVE_HORA_MONITORAMENTO, instanteDoRegistro } from "./horaMonitoramento";

type ComAditivo = {
  criado_em: string;
  hora_monitoramento?: string | null;
  dados_dinamicos?: Record<string, unknown> | null;
  aditivo_de?: string | null;
};

function semHoraPropria(m: ComAditivo): boolean {
  const noDado = m.dados_dinamicos?.[CHAVE_HORA_MONITORAMENTO];
  return !m.hora_monitoramento && !(typeof noDado === "string" && noDado);
}

/** O adendo (aditivo) é a versão corrigida de um monitoramento já feito: pertence ao dia, ao turno e à posição do ORIGINAL,
 * não ao dia em que o inspetor assinou a correção. O aditivo herda `hora_monitoramento` do original; quando o original é antigo
 * (sem hora informada, só `criado_em`) o aditivo nasce sem hora e cairia no dia da assinatura do adendo, indo para o consolidado
 * errado (ex.: o adendo assinado dia 14 de um monitoramento do dia 05 entrava no consolidado do dia 14). Aqui esse aditivo recebe,
 * só em memória, o instante do original — o registro gravado (e o hash assinado) não muda. */
export async function herdarInstanteDoOriginal<T extends ComAditivo>(registros: T[]): Promise<T[]> {
  const idsOriginais = [...new Set(registros.filter((m) => m.aditivo_de && semHoraPropria(m)).map((m) => m.aditivo_de as string))];
  if (idsOriginais.length === 0) return registros;

  const { data, error } = await supabase
    .from("monitoramentos")
    .select("id, criado_em, hora_monitoramento, dados_dinamicos")
    .in("id", idsOriginais)
    .overrideTypes<{ id: string; criado_em: string; hora_monitoramento: string | null; dados_dinamicos: Record<string, unknown> | null }[], { merge: false }>();
  // Sem ler o original, mantém o comportamento anterior em vez de derrubar a tela.
  if (error || !data) return registros;

  const instanteDoOriginal = new Map(data.map((o) => [o.id, instanteDoRegistro(o)]));
  return registros.map((m) => {
    const instante = m.aditivo_de && semHoraPropria(m) ? instanteDoOriginal.get(m.aditivo_de) : undefined;
    return instante ? { ...m, hora_monitoramento: instante } : m;
  });
}
