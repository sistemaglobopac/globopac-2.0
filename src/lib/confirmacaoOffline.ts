// Evidência da confirmação feita no aparelho (ADR 0016). Quando o inspetor "assina" sem internet, o que vale
// de verdade é a assinatura que o SERVIDOR gera na sincronização; este registro acompanha a ficha só para
// auditoria: quem confirmou (matrícula), quando (relógio do aparelho — não verificado), em qual aparelho e um
// hash dos dados no momento da confirmação. O hash local NUNCA substitui o hash recalculado no servidor.

export interface ConfirmacaoOffline {
  versao: 1;
  matricula: string | null;
  /** Relógio do aparelho (informativo, não verificado). */
  confirmado_em: string;
  dispositivo_id: string;
  /** SHA-256 dos dados da ficha no momento da confirmação (evidência; o servidor recalcula o seu). */
  hash_local: string;
  /** Onde a senha foi conferida: "aparelho" (sem internet) ou "servidor" (internet caiu depois de conferir). */
  senha_conferida_em: "aparelho" | "servidor" | null;
}

export interface DadosParaConfirmar {
  id: string;
  fichaTemplateId: string;
  versaoTemplate: number;
  userId: string;
  setor: string;
  dadosDinamicos: Record<string, unknown>;
  capturadoEm: string;
}

const CHAVE_DISPOSITIVO = "globopac:dispositivo";
let idEmMemoria: string | null = null;

/** Identifica este aparelho para o servidor saber QUANDO ele esteve online. Gerado uma vez e guardado no
 * navegador; se o armazenamento for apagado, o aparelho vira "desconhecido" (e não ganha prazo estendido). */
export function idDoDispositivo(): string {
  if (idEmMemoria) return idEmMemoria;
  try {
    idEmMemoria = localStorage.getItem(CHAVE_DISPOSITIVO) ?? null;
    if (!idEmMemoria) {
      idEmMemoria = crypto.randomUUID();
      localStorage.setItem(CHAVE_DISPOSITIVO, idEmMemoria);
    }
  } catch {
    // armazenamento bloqueado: o id vale só enquanto o app estiver aberto (e o aparelho não ganha prazo estendido).
    idEmMemoria ??= crypto.randomUUID();
  }
  return idEmMemoria;
}

/** JSON com chaves em ordem fixa: o mesmo conteúdo sempre gera o mesmo hash. */
export function jsonEstavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(",")}]`;
  if (valor && typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonEstavel(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

export async function sha256Hex(texto: string): Promise<string> {
  const bits = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function montarConfirmacaoOffline(entrada: {
  dados: DadosParaConfirmar;
  senhaConferidaEm: ConfirmacaoOffline["senha_conferida_em"];
  matricula: string | null;
  agora?: Date;
}): Promise<ConfirmacaoOffline> {
  return {
    versao: 1,
    matricula: entrada.matricula,
    confirmado_em: (entrada.agora ?? new Date()).toISOString(),
    dispositivo_id: idDoDispositivo(),
    hash_local: await sha256Hex(jsonEstavel(entrada.dados)),
    senha_conferida_em: entrada.senhaConferidaEm,
  };
}
