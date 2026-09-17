// Agenda o worker de carimbo de tempo (processar-fila-carimbo) via pg_cron + pg_net, seção
// 7.5 do PROMPT MESTRE. A service_role key NUNCA é escrita em uma migration versionada (isso
// vazaria o segredo real assim que aplicado contra um projeto hospedado) — é armazenada no
// Supabase Vault, aqui, em tempo de execução, lendo o valor real do ambiente atual (local,
// CI, ou o que for). Ver docs/adr/0010-worker-carimbo-tempo.md.
//
// Roda DEPOIS de `supabase db reset`. Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_DB_URL=... node scripts/configurar-worker-carimbo.mjs

import { execSync } from "node:child_process";
import postgres from "postgres";

let saidaStatusCache;
function statusEnv(chave) {
  saidaStatusCache ??= execSync("supabase status -o env", { encoding: "utf8" });
  const linha = saidaStatusCache.split("\n").find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1);
}

function semAspas(valor) {
  return valor?.trim().replace(/^"|"$/g, "");
}

const apiUrl = semAspas(process.env.SUPABASE_URL) || semAspas(statusEnv("API_URL"));
const serviceRoleKey =
  semAspas(process.env.SUPABASE_SERVICE_ROLE_KEY) || semAspas(statusEnv("SERVICE_ROLE_KEY"));
const dbUrl = semAspas(process.env.SUPABASE_DB_URL) || semAspas(statusEnv("DB_URL"));

if (!apiUrl || !serviceRoleKey || !dbUrl) {
  console.error(
    "Não consegui obter SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_DB_URL (nem do ambiente, nem de `supabase status`)."
  );
  process.exit(1);
}

const sql = postgres(dbUrl);

async function upsertSecret(nome, valor) {
  const existente = await sql`select id from vault.secrets where name = ${nome}`;
  if (existente.length > 0) {
    await sql`select vault.update_secret(${existente[0].id}, ${valor})`;
  } else {
    await sql`select vault.create_secret(${valor}, ${nome})`;
  }
}

await upsertSecret("project_url", apiUrl);
await upsertSecret("service_role_key", serviceRoleKey);

// cron.schedule com o mesmo jobname substitui a definição anterior (idempotente) — seguro
// rodar este script mais de uma vez sem duplicar o agendamento.
await sql`
  select cron.schedule(
    'processar-fila-carimbo',
    '* * * * *',
    $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/processar-fila-carimbo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
    $$
  );
`;

await sql.end();
console.log("Worker de carimbo agendado (pg_cron, a cada minuto) e credenciais gravadas no Vault.");
