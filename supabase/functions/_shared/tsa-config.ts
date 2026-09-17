// Leitura da configuração do worker de carimbo (app_config) — seção 7.5.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TsaConfigurada {
  nome: string;
  url: string;
}

export interface PoliticaRetryCarimbo {
  tsas: TsaConfigurada[];
  maxTentativas: number;
  backoffBaseSegundos: number;
}

const PADRAO: PoliticaRetryCarimbo = {
  tsas: [
    { nome: "FreeTSA", url: "https://freetsa.org/tsr" },
    { nome: "Sectigo", url: "http://timestamp.sectigo.com" },
    { nome: "Comodo", url: "http://timestamp.comodoca.com" },
    { nome: "Certum", url: "http://time.certum.pl" },
  ],
  maxTentativas: 5,
  backoffBaseSegundos: 60,
};

export async function lerPoliticaRetryCarimbo(adminClient: SupabaseClient): Promise<PoliticaRetryCarimbo> {
  const { data } = await adminClient
    .from("app_config")
    .select("chave, valor")
    .in("chave", ["tsas_carimbo_tempo", "carimbo_max_tentativas", "carimbo_backoff_base_segundos"]);

  const porChave = new Map((data ?? []).map((linha) => [linha.chave as string, linha.valor]));

  return {
    tsas: (porChave.get("tsas_carimbo_tempo") as TsaConfigurada[] | undefined) ?? PADRAO.tsas,
    maxTentativas: (porChave.get("carimbo_max_tentativas") as number | undefined) ?? PADRAO.maxTentativas,
    backoffBaseSegundos:
      (porChave.get("carimbo_backoff_base_segundos") as number | undefined) ?? PADRAO.backoffBaseSegundos,
  };
}

/** Backoff exponencial simples: base * 2^(tentativas-1). */
export function calcularProximaTentativa(tentativas: number, backoffBaseSegundos: number): Date {
  const segundos = backoffBaseSegundos * 2 ** Math.max(0, tentativas - 1);
  return new Date(Date.now() + segundos * 1000);
}
