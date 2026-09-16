import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY ausentes. Copie .env.example para .env.local."
  );
}

// Cliente sem o generic <Database>: os tipos gerados à mão em database.types.ts não
// conseguiram casar de forma estável com o parser de tipos do postgrest-js@2.116 (uma
// reescrita recente, com inferência bem mais rígida do que versões anteriores — tentativas
// de fornecer Relationships/Views/Functions/Enums/CompositeTypes não resolveram). Em vez de
// perseguir a forma exata que essa versão espera, cada query usa `.overrideTypes<T,
// { merge: false }>()` no ponto de uso (mecanismo oficial e documentado do próprio
// postgrest-js para fixar o tipo do resultado) — mais robusto a mudanças de versão da
// biblioteca do que replicar manualmente sua metadata interna. Trocar por
// `createClient<Database>` volta a fazer sentido assim que `supabase gen types typescript`
// puder rodar contra um projeto real (requer Docker — ver ASSUMPTIONS.md item 9).
export const supabase = createClient(url, anonKey);
