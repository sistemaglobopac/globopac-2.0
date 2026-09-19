// Recomputo client-side do hash de assinatura, só para exibir o selo "íntegro"/"verifique" no
// relatório impresso — a verificação de fato (que importa legalmente) é feita no Portal
// Público (/verificar?id=), via a Edge Function verificar-documento, com o hash de referência
// já gravado em assinaturas_eletronicas.
//
// ATENÇÃO: precisa ficar em sincronia com supabase/functions/_shared/hash.ts
// (conteudoAssinavelMonitoramento + sha256Hex) — mesmo algoritmo, duplicado aqui porque o
// diretório supabase/functions/ é código de Edge Function (Deno), não é importado pelo bundle
// Vite do frontend. Se um mudar, o outro tem que mudar junto, senão o selo "íntegro" do
// relatório passa a divergir do que /verificar realmente valida.

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves);
  if (valor !== null && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const resultado: Record<string, unknown> = {};
    for (const [chave, val] of entradas) resultado[chave] = ordenarChaves(val);
    return resultado;
  }
  return valor;
}

function canonicalizar(valor: unknown): string {
  return JSON.stringify(ordenarChaves(valor));
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface MonitoramentoAssinavel {
  id: string;
  ficha_template_id: string;
  versao_template: number;
  user_id: string;
  setor: string;
  dados_dinamicos: unknown;
  conformidade: boolean | null;
  verificado_por: string | null;
  criado_em: string;
}

/** Mesmo payload assinável de conteudoAssinavelMonitoramento (Deno) — só os campos que
 * compõem o hash gravado em assinaturas_eletronicas.hash_documento. */
export async function computarHashMonitoramento(m: MonitoramentoAssinavel): Promise<string> {
  return sha256Hex(
    canonicalizar({
      id: m.id,
      ficha_template_id: m.ficha_template_id,
      versao_template: m.versao_template,
      user_id: m.user_id,
      setor: m.setor,
      dados_dinamicos: m.dados_dinamicos,
      conformidade: m.conformidade,
      verificado_por: m.verificado_por,
      criado_em: m.criado_em,
    })
  );
}

export function resumoHash(hash: string | null | undefined, tamanho = 32): string | null {
  if (!hash) return null;
  return hash.substring(0, tamanho).toUpperCase();
}
