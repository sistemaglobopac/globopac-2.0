// Núcleo do carimbo de tempo RFC 3161 — um item da fila (fila_carimbo_tempo) por vez. Usado
// pelo worker (processar-fila-carimbo: rodadas em lote, botão "Processar agora") e por
// _shared/carimbo-imediato.ts (carimbo emitido dentro da própria função de assinatura, sem
// chamada HTTP entre funções). Uma implementação só, nunca duas divergentes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { solicitarCarimboRFC3161 } from "./rfc3161.ts";
import { calcularProximaTentativa, type PoliticaRetryCarimbo } from "./tsa-config.ts";

export interface ItemFilaCarimbo {
  id: string;
  assinatura_id: string;
  tipo_assinatura: string;
  tentativas: number;
  tsa_tentadas: string[] | null;
}

export type ResultadoItemCarimbo = "concluido" | "falhou" | "ignorado";

export const TABELA_POR_TIPO: Record<string, { tabela: string; colunaHash: string }> = {
  ficha: { tabela: "assinaturas_eletronicas", colunaHash: "hash_documento" },
  os: { tabela: "assinaturas_os_eletronicas", colunaHash: "hash_documento" },
  lote: { tabela: "lote_liberacao_sif", colunaHash: "hash_agregador" },
  relatorio_os: { tabela: "manutencao_relatorios_sif", colunaHash: "hash_agregador" },
};

function bytesParaHexPostgres(bytes: Uint8Array): string {
  let hex = "\\x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function log(nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ funcao: "carimbo", nivel, evento, ...extra }));
}

export async function processarItemCarimbo(
  adminClient: SupabaseClient,
  item: ItemFilaCarimbo,
  politica: PoliticaRetryCarimbo
): Promise<ResultadoItemCarimbo> {
  const destino = TABELA_POR_TIPO[item.tipo_assinatura];
  if (!destino) {
    log("error", "tipo_assinatura_desconhecido", { item });
    return "ignorado";
  }

  const { data: origem, error: erroOrigem } = await adminClient
    .from(destino.tabela)
    .select(destino.colunaHash)
    .eq("id", item.assinatura_id)
    .single();

  if (erroOrigem || !origem) {
    log("error", "registro_origem_nao_encontrado", { itemId: item.id, erro: erroOrigem?.message });
    return "ignorado";
  }
  const hashDocumento = (origem as unknown as Record<string, string>)[destino.colunaHash];

  const tentadasAntes: string[] = item.tsa_tentadas ?? [];
  let sucesso: { tsrBase64: string; genTime: Date; cadeiaCertificadosDer: Uint8Array; tsaNome: string } | null = null;
  const errosDesteRound: string[] = [];
  const novasTentadas = new Set(tentadasAntes);

  for (const tsa of politica.tsas) {
    const resultado = await solicitarCarimboRFC3161(tsa.url, hashDocumento);
    novasTentadas.add(tsa.nome);
    if (resultado.ok) {
      sucesso = { ...resultado, tsaNome: tsa.nome };
      break;
    }
    errosDesteRound.push(`${tsa.nome}: ${resultado.erro}`);
  }

  if (sucesso) {
    const { error: erroUpdate } = await adminClient
      .from(destino.tabela)
      .update({
        tsr_base64: sucesso.tsrBase64,
        tsa_emitido_em: sucesso.genTime.toISOString(),
        tsa_utilizada: sucesso.tsaNome,
        cadeia_certificados_tsa: bytesParaHexPostgres(sucesso.cadeiaCertificadosDer),
      })
      .eq("id", item.assinatura_id);

    if (erroUpdate) {
      log("error", "gravar_carimbo_falhou", { itemId: item.id, erro: erroUpdate.message });
      return "ignorado";
    }

    await adminClient
      .from("fila_carimbo_tempo")
      .update({ status: "concluido", tsa_tentadas: Array.from(novasTentadas) })
      .eq("id", item.id);

    log("info", "carimbo_concluido", { itemId: item.id, tsa: sucesso.tsaNome });
    return "concluido";
  }

  const tentativas = item.tentativas + 1;
  const definitivo = tentativas >= politica.maxTentativas;
  await adminClient
    .from("fila_carimbo_tempo")
    .update({
      status: definitivo ? "falhou_definitivo" : "pendente",
      tentativas,
      tsa_tentadas: Array.from(novasTentadas),
      ultimo_erro: errosDesteRound.join(" | "),
      proxima_tentativa_em: definitivo
        ? null
        : calcularProximaTentativa(tentativas, politica.backoffBaseSegundos).toISOString(),
    })
    .eq("id", item.id);

  log(definitivo ? "error" : "info", "carimbo_falhou_rodada", {
    itemId: item.id,
    tentativas,
    definitivo,
    erros: errosDesteRound,
  });
  return "falhou";
}
