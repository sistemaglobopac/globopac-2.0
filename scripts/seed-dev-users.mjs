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

// supabase-js sempre inicializa um RealtimeClient ao construir o client (mesmo sem usar
// nenhum recurso de realtime aqui), o que exige um WebSocket global — nativo só a partir do
// Node 22. Este script roda em CI com Node 20 (e pode rodar localmente também), então
// preenche o polyfill antes de createClient(), em vez de forçar todo o projeto a Node 22 por
// causa de um script de seed que nem usa realtime.
if (typeof globalThis.WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  globalThis.WebSocket = WebSocket;
}

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

// `supabase status -o env` envolve os valores em aspas duplas (formato .env); se alguma
// variável chegar via um caminho que não descarta aspas (ex.: $GITHUB_ENV do Actions, que
// não é um parser de .env), sobra a aspa dentro do valor e createClient() rejeita a URL.
// Removê-las aqui torna o script robusto independente de como as env vars chegaram.
function semAspas(valor) {
  return valor?.trim().replace(/^"|"$/g, "");
}

const url = semAspas(process.env.SUPABASE_URL) || semAspas(statusEnv("API_URL"));
const serviceRoleKey =
  semAspas(process.env.SUPABASE_SERVICE_ROLE_KEY) || semAspas(statusEnv("SERVICE_ROLE_KEY"));

if (!url || !serviceRoleKey) {
  console.error(
    "Não consegui obter SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (nem do ambiente, nem de `supabase status`). O stack local está rodando (`npm run db:start`)?"
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SENHA_DEV = "121072";

const USUARIOS = [
  {
    email: "inspetor.qualidade@dev.globopac.local",
    nomeCompleto: "Inspetor(a) de Qualidade (dev)",
    nomeUsuario: "inspetor.qualidade",
    matricula: "1001",
    nivelAcesso: "INSPETOR_QUALIDADE",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO"],
  },
  {
    email: "verificador@dev.globopac.local",
    nomeCompleto: "Verificador(a) (dev)",
    nomeUsuario: "verificador",
    matricula: "1002",
    nivelAcesso: "VERIFICADOR",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO"],
  },
  {
    email: "gestor.setor@dev.globopac.local",
    nomeCompleto: "Gestor(a) de Setor (dev)",
    nomeUsuario: "gestor.setor",
    matricula: "1003",
    nivelAcesso: "GESTOR_SETOR",
    setoresPermitidos: ["LINHA_DIF"],
  },
  {
    email: "admin.master@dev.globopac.local",
    nomeCompleto: "Administrador(a) (dev)",
    nomeUsuario: "admin.master",
    matricula: "1004",
    nivelAcesso: "ADMIN_MASTER",
    setoresPermitidos: ["LINHA_DIF", "PRE_INSPECAO", "RECEPCAO", "EXPEDICAO", "MANUTENCAO"],
  },
  {
    email: "inspecao.federal@dev.globopac.local",
    nomeCompleto: "Inspeção Federal (dev)",
    nomeUsuario: "inspecao.federal",
    matricula: "1005",
    nivelAcesso: "INSPECAO_FEDERAL",
    setoresPermitidos: [],
  },
  {
    email: "inspetor.pcm@dev.globopac.local",
    nomeCompleto: "Inspetor(a) PCM (dev)",
    nomeUsuario: "inspetor.pcm",
    matricula: "1006",
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
    matricula: usuario.matricula,
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
