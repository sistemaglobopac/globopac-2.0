import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/shared/ui/card";
import { TurnstileWidget } from "./TurnstileWidget";

const loginSchema = z.object({
  matricula: z.string().min(1, "Informe a matrícula"),
  senha: z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

const ERRO_CREDENCIAIS = "Matrícula ou senha inválidos.";
const ERRO_IP_BLOQUEADO = "Login bloqueado para este IP por excesso de tentativas. Contate um administrador.";

interface RespostaLogin {
  access_token?: string;
  refresh_token?: string;
  erro?: string;
  flag?: "captcha_necessario" | "ip_bloqueado";
}

async function lerCorpoErro(error: unknown): Promise<RespostaLogin | null> {
  const contexto = (error as { context?: Response } | null)?.context;
  if (!contexto) return null;
  try {
    return (await contexto.json()) as RespostaLogin;
  } catch {
    return null;
  }
}

export function LoginPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [exigeCaptcha, setExigeCaptcha] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  // O sucesso do login não navega sozinho: useAuthListener só atualiza o session store (o
  // dado), a navegação em si é responsabilidade da tela. Sem isto, um login bem-sucedido
  // deixava o usuário parado em /login (bug real, encontrado via E2E: a chamada de rede
  // retornava 200, mas a página nunca saía da tela de login).
  useEffect(() => {
    if (perfil) navigate("/", { replace: true });
  }, [perfil, navigate]);

  async function aoEnviar(dados: LoginForm) {
    setErro(null);
    const tokenParaEnviar = turnstileToken;
    // Um token do Turnstile só serve para UMA verificação — descarta e força o widget a gerar
    // um novo a cada tentativa (o key={captchaNonce} abaixo remonta o componente).
    setTurnstileToken(null);
    setCaptchaNonce((n) => n + 1);

    // O gate de tentativas por IP (5 falhas -> CAPTCHA, 10 -> bloqueio só desbloqueável por
    // ADMIN_MASTER) só pode ser aplicado no servidor — por isso o login passa pela Edge
    // Function "login" em vez de chamar supabase.auth.signInWithPassword diretamente daqui.
    // Ver ADR 0015.
    const { data, error } = await supabase.functions.invoke<RespostaLogin>("login", {
      body: { matricula: dados.matricula, senha: dados.senha, turnstile_token: tokenParaEnviar },
    });

    const corpo = data ?? (await lerCorpoErro(error));

    if (corpo?.flag === "ip_bloqueado") {
      setBloqueado(true);
      setExigeCaptcha(false);
      setErro(ERRO_IP_BLOQUEADO);
      return;
    }
    if (corpo?.flag === "captcha_necessario") {
      setExigeCaptcha(true);
      setErro("Confirme o desafio abaixo para continuar tentando.");
      return;
    }
    if (error || !corpo?.access_token || !corpo.refresh_token) {
      setErro(ERRO_CREDENCIAIS);
      return;
    }

    setErro(null);
    setExigeCaptcha(false);
    await supabase.auth.setSession({
      access_token: corpo.access_token,
      refresh_token: corpo.refresh_token,
    });
  }

  return (
    <div className="page-wash flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm rounded-xl border-white/70 bg-white/85 shadow-lg backdrop-blur-xl">
        <CardHeader className="items-center text-center">
          <img src="/logo-globopac.png" alt="GloboPac" className="h-12 w-auto" />
          <CardDescription>Gestão do Autocontrole</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="matricula">Matrícula</Label>
              <Input
                id="matricula"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                {...register("matricula")}
              />
              {errors.matricula && (
                <p className="text-sm text-destructive">{errors.matricula.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" autoComplete="current-password" {...register("senha")} />
              {errors.senha && <p className="text-sm text-destructive">{errors.senha.message}</p>}
            </div>
            {exigeCaptcha && !bloqueado && <TurnstileWidget key={captchaNonce} onToken={setTurnstileToken} />}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || bloqueado || (exigeCaptcha && !turnstileToken)}
            >
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Desenvolvido por Wanderson Alves de Moura · PMPPA Universidade Brasil · 2026
      </p>
    </div>
  );
}
