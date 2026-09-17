// Cria os usuários de teste via Admin API (createUser), em vez de INSERT direto em
// auth.users. Corrige um bug real: inserir manualmente em auth.users com crypt()/gen_salt()
// não reproduz tudo o que o GoTrue exige para autenticar um login de verdade (descoberto via
// falha real de E2E em CI: login sempre retornava "E-mail ou senha inválidos"). A Admin API é
// o único caminho suportado para criar usuários programaticamente com um hash que o GoTrue
// realmente aceita.
//
// Roda DEPOIS de `supabase db reset` (que recria auth.users do zero) — nunca antes. Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-dev-users.mjs

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

// Se as variáveis não vierem do ambiente (uso local, fora de CI), busca de `supabase status`
// — conveniência para `npm run db:seed-users` funcionar sem passos manuais extras. Chama o
// binário `supabase` direto (sem npx): rodando via `npm run`, node_modules/.bin já está no
// PATH, resolvendo a versão pinada do projeto sem ambiguidade de resolução do npx.
let saidaStatusCache;
function statusEnv(chave) {
  saidaStatusCache ??= execSync("supabase status -o env", { encoding: "utf8" });
  const linha = saidaStatusCache.split("\n").find((l) => l.startsWith(`${chave}=`));
  return linha?.slice(chave.length + 1);
}

const url = process.env.SUPABASE_URL || statusEnv("API_URL");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || statusEnv("SERVICE_ROLE_KEY");

if (!url || !serviceRoleKey) {
  console.error(
    "Não consegui obter SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (nem do ambiente, nem de `supabase status`). O stack local está rodando (`npm run db:start`)?"
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SENHA_DEV = "globopac-dev-2026";

const USUARIOS = [
  {
    email: "inspetor.qualidade@dev.globopac.local",
    nomeCompleto: "Inspetor(a) de Qualidade (dev)",
    nomeUsuario: "inspetor.qualidade",
    nivelAcesso: "INSPETOR_QUALIDADE",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO"],
  },
  {
    email: "verificador@dev.globopac.local",
    nomeCompleto: "Verificador(a) (dev)",
    nomeUsuario: "verificador",
    nivelAcesso: "VERIFICADOR",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO"],
  },
  {
    email: "gestor.setor@dev.globopac.local",
    nomeCompleto: "Gestor(a) de Setor (dev)",
    nomeUsuario: "gestor.setor",
    nivelAcesso: "GESTOR_SETOR",
    setoresPermitidos: ["LINHA_DIF"],
  },
  {
    email: "admin.master@dev.globopac.local",
    nomeCompleto: "Administrador(a) Master (dev)",
    nomeUsuario: "admin.master",
    nivelAcesso: "ADMIN_MASTER",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO", "RECEPCAO", "EXPEDICAO", "MANUTENCAO"],
  },
  {
    email: "inspecao.federal@dev.globopac.local",
    nomeCompleto: "Inspeção Federal (dev)",
    nomeUsuario: "inspecao.federal",
    nivelAcesso: "INSPECAO_FEDERAL",
    setoresPermitidos: [],
  },
  {
    email: "inspetor.pcm@dev.globopac.local",
    nomeCompleto: "Inspetor(a) PCM (dev)",
    nomeUsuario: "inspetor.pcm",
    nivelAcesso: "INSPETOR_PCM",
    setoresPermitidos: ["MANUTENCAO"],
  },
];

for (const usuario of USUARIOS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: usuario.email,
    password: SENHA_DEV,
    email_confirm: true,
  });

  if (error || !data.user) {
    console.error(`Falha ao criar ${usuario.email}: ${error?.message}`);
    process.exit(1);
  }

  const { error: perfilError } = await admin.from("perfis_usuarios").insert({
    id: data.user.id,
    nome_completo: usuario.nomeCompleto,
    nome_usuario: usuario.nomeUsuario,
    nivel_acesso: usuario.nivelAcesso,
    setores_permitidos: usuario.setoresPermitidos,
  });

  if (perfilError) {
    console.error(`Falha ao criar perfil de ${usuario.email}: ${perfilError.message}`);
    process.exit(1);
  }

  console.log(`OK: ${usuario.email} (${usuario.nivelAcesso}) — id ${data.user.id}`);
}

console.log("Usuários de teste criados com sucesso.");
