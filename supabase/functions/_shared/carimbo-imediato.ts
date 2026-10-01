// Carimbo RFC 3161 emitido no momento da assinatura/liberação, dentro da própria Edge Function
// (sem chamada HTTP entre funções — a versão anterior, que disparava o worker por fetch, não
// chegava a ele na prática). O item já foi enfileirado em fila_carimbo_tempo; aqui ele é
// processado logo em seguida com o mesmo núcleo do worker (_shared/carimbo-processador.ts).
//
// - aguardar: true  -> a resposta ao usuário só sai depois do carimbo (ou de um teto de tempo).
// - aguardar: false -> o carimbo roda em segundo plano (waitUntil), para operações em lote.
// Em qualquer caso a fila continua sendo a fonte de verdade: se a TSA falhar ou estourar o
// teto, o item fica pendente e o retry/"Processar agora" do worker cuida do resto.
import type { SupabaseClient } from "@supabase/supabase-js";
import { processarItemCarimbo, type ItemFilaCarimbo } from "./carimbo-processador.ts";
import { lerPoliticaRetryCarimbo } from "./tsa-config.ts";

const TETO_ESPERA_MS = 12_000;

export async function carimbarAgora(
  adminClient: SupabaseClient,
  filaItemId: string,
  opcoes: { aguardar: boolean }
): Promise<void> {
  const tarefa = (async () => {
    try {
      const { data: item } = await adminClient
        .from("fila_carimbo_tempo")
        .select("id, assinatura_id, tipo_assinatura, tentativas, tsa_tentadas")
        .eq("id", filaItemId)
        .eq("status", "pendente")
        .maybeSingle();
      if (!item) return;
      const politica = await lerPoliticaRetryCarimbo(adminClient);
      await processarItemCarimbo(adminClient, item as unknown as ItemFilaCarimbo, politica);
    } catch (erro) {
      console.log(
        JSON.stringify({
          funcao: "carimbo",
          nivel: "error",
          evento: "carimbo_imediato_falhou",
          erro: erro instanceof Error ? erro.message : String(erro),
        })
      );
    }
  })();

  // Mantém o isolate vivo até o fim, mesmo que a resposta ao cliente saia antes.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promessa: Promise<unknown>): void } }).EdgeRuntime;
  runtime?.waitUntil(tarefa);

  if (opcoes.aguardar) {
    await Promise.race([tarefa, new Promise((resolver) => setTimeout(resolver, TETO_ESPERA_MS))]);
  }
}
