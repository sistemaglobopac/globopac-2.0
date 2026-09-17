// Serialização canônica + SHA-256, usadas por toda assinatura eletrônica (seção 7.5).
// O hash cobre sempre o registro como persistido no banco, nunca um valor enviado pelo
// cliente — cada Edge Function de assinatura busca a linha atual e chama estas funções.

/** Serialização determinística (chaves ordenadas recursivamente) para hashing estável. */
export function canonicalizar(valor: unknown): string {
  return JSON.stringify(ordenarChaves(valor));
}

function ordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarChaves);
  if (valor !== null && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const resultado: Record<string, unknown> = {};
    for (const [chave, val] of entradas) resultado[chave] = ordenarChaves(val);
    return resultado;
  }
  return valor;
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Conteúdo assinável de um monitoramento no momento da assinatura (seção 7.5). */
export function conteudoAssinavelMonitoramento(m: {
  id: string;
  ficha_template_id: string;
  versao_template: number;
  user_id: string;
  setor: string;
  dados_dinamicos: unknown;
  conformidade: boolean | null;
  verificado_por: string | null;
  criado_em: string;
}): string {
  return canonicalizar({
    id: m.id,
    ficha_template_id: m.ficha_template_id,
    versao_template: m.versao_template,
    user_id: m.user_id,
    setor: m.setor,
    dados_dinamicos: m.dados_dinamicos,
    conformidade: m.conformidade,
    verificado_por: m.verificado_por,
    criado_em: m.criado_em,
  });
}

/** Conteúdo assinável de uma Ordem de Serviço no momento da assinatura (seção 7.4). Cobre o
 * estado completo do ciclo — cada etapa assina o estado JÁ ATUALIZADO (status e coluna
 * *_por da própria etapa), nunca o estado anterior. */
export function conteudoAssinavelOs(os: {
  id: string;
  descricao: string;
  setor: string;
  ativo_referencia: string | null;
  status: string;
  aberto_por: string;
  autorizado_por: string | null;
  programado_por: string | null;
  executado_por: string | null;
  validado_por: string | null;
  criado_em: string;
}): string {
  return canonicalizar({
    id: os.id,
    descricao: os.descricao,
    setor: os.setor,
    ativo_referencia: os.ativo_referencia,
    status: os.status,
    aberto_por: os.aberto_por,
    autorizado_por: os.autorizado_por,
    programado_por: os.programado_por,
    executado_por: os.executado_por,
    validado_por: os.validado_por,
    criado_em: os.criado_em,
  });
}
