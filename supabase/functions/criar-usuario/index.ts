// Edge Function: criar-usuario (Painel de Gestão → Acessos de Usuários).
//
// Criar um colaborador exige duas escritas que o cliente nunca pode fazer sozinho com a anon
// key: (1) auth.admin.createUser, que só existe com service_role; e (2) o INSERT em
// perfis_usuarios, que a RLS (perfis_usuarios_update em 20260916000016_rls_policies.sql) só
// libera para UPDATE, nunca INSERT — igual ao script scripts/seed-dev-users.mjs, só que
// chamado pelo próprio painel em vez de rodado manualmente. O login é sempre por matrícula
// (email_por_matricula), então o e-mail do Auth é fictício e nunca é mostrado/usado pelo
// colaborador.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { corsHeadersAutenticado } from "../_shared/cors.ts";

const DOMINIO_EMAIL_FICTICIO = "colaborador.globopac.com.br";

const requestSchema = z.object({
  nome_completo: z.string().trim().min(1),
  nome_usuario: z
    .string()
    .trim()
    .min(1)
    .regex(/^\S+$/, "usuário de login não pode conter espaços"),
  matricula: z.string().trim().min(1),
  senha: z.string().min(6),
  nivel_acesso: z.enum([
    "INSPETOR_QUALIDADE",
    "INSPETOR_PCM",
    "VERIFICADOR",
    "GESTOR_SETOR",
    "ADMIN_MASTER",
    "INSPECAO_FEDERAL",
  ]),
  setores_permitidos: z.array(z.string()),
  email_alerta: z.string().email().nullable().optional(),
  configuracoes_extras: z.string().nullable().optional(),
});

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = (nivel: "info" | "error", evento: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ correlationId, funcao: "criar-usuario", nivel, evento, ...extra }));

  const cors = corsHeadersAutenticado(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError(401, "não autenticado", correlationId, cors);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) return jsonError(401, "não autenticado", correlationId, cors);

    const { data: perfilChamador } = await callerClient
      .from("perfis_usuarios")
      .select("nivel_acesso")
      .eq("id", user.id)
      .single();
    if (perfilChamador?.nivel_acesso !== "ADMIN_MASTER") {
      return jsonError(403, "só ADMIN_MASTER cadastra colaboradores", correlationId, cors);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "payload inválido", correlationId, cors, parsed.error.flatten());
    }
    const input = parsed.data;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const emailFicticio = `${input.nome_usuario}@${DOMINIO_EMAIL_FICTICIO}`;
    const { data: criado, error: erroCriar } = await adminClient.auth.admin.createUser({
      email: emailFicticio,
      password: input.senha,
      email_confirm: true,
    });

    // Um e-mail já cadastrado às vezes não vem como erro — a Admin API retorna 200 com um user
    // cujo array `identities` está vazio (comportamento documentado do GoTrue para não
    // vazar quais e-mails já existem). Sem esta checagem, o cadastro pareceria bem-sucedido e
    // nunca criaria a linha em perfis_usuarios.
    if (erroCriar || !criado.user || criado.user.identities?.length === 0) {
      log("error", "criar_auth_falhou", { erro: erroCriar?.message, nomeUsuario: input.nome_usuario });
      return jsonError(409, `usuário "${input.nome_usuario}" já está cadastrado`, correlationId, cors);
    }

    const { error: erroPerfil } = await adminClient.from("perfis_usuarios").insert({
      id: criado.user.id,
      nome_completo: input.nome_completo,
      nome_usuario: input.nome_usuario,
      matricula: input.matricula,
      nivel_acesso: input.nivel_acesso,
      setores_permitidos: input.setores_permitidos,
      email_alerta: input.email_alerta ?? null,
      configuracoes_extras: input.configuracoes_extras ?? null,
    });

    if (erroPerfil) {
      // Desfaz a criação no Auth para não deixar um usuário órfão sem perfil (ex.: matrícula
      // duplicada, que só a constraint de perfis_usuarios detecta).
      await adminClient.auth.admin.deleteUser(criado.user.id);
      log("error", "criar_perfil_falhou", { erro: erroPerfil.message });
      const mensagem = erroPerfil.message.includes("matricula")
        ? `matrícula "${input.matricula}" já está em uso`
        : "falha ao criar o perfil do colaborador";
      return jsonError(409, mensagem, correlationId, cors);
    }

    log("info", "usuario_criado", { userId: criado.user.id, nomeUsuario: input.nome_usuario });
    return new Response(JSON.stringify({ id: criado.user.id }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (erro) {
    log("error", "excecao_nao_tratada", { erro: erro instanceof Error ? erro.message : String(erro) });
    return jsonError(500, "erro interno", correlationId, cors);
  }
});

function jsonError(status: number, mensagem: string, correlationId: string, cors: HeadersInit, detalhes?: unknown) {
  return new Response(JSON.stringify({ erro: mensagem, correlationId, detalhes }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
