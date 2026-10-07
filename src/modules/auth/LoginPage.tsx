import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { entrarOffline, mensagemDaRecusaOffline, registrarLoginOnline } from "@/lib/credencialOffline";
import { useOnline } from "@/lib/useOnline";
import { WifiOff } from "lucide-react";
import { abrirSessaoOffline } from "./acessoOffline";
import { loginNoServidor } from "./loginServidor";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/shared/ui/card";
import { HCaptchaWidget } from "./HCaptchaWidget";

const loginSchema = z.object({
  matricula: z.string().min(1, "Informe a matrícula"),
  senha: z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

const ERRO_CREDENCIAIS = "Matrícula ou senha inválidos.";
const ERRO_IP_BLOQUEADO = "Login bloqueado para este IP por excesso de tentativas. Contate um administrador.";

export function LoginPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [exigeCaptcha, setExigeCaptcha] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const navigate = useNavigate();
  const perfil = useSessionStore((s) => s.perfil);
  const online = useOnline();
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
    const tokenParaEnviar = captchaToken;
    // Um token de captcha só serve para UMA verificação — descarta e força o widget a gerar
    // um novo a cada tentativa (o key={captchaNonce} abaixo remonta o componente).
    setCaptchaToken(null);
    setCaptchaNonce((n) => n + 1);

    // O gate de tentativas por IP (5 falhas -> CAPTCHA, 10 -> bloqueio só desbloqueável por
    // ADMIN_MASTER) só pode ser aplicado no servidor — por isso o login passa pela Edge
    // Function "login" em vez de chamar supabase.auth.signInWithPassword diretamente daqui.
    // Ver ADR 0015. Sem internet (ou sem resposta do servidor) cai no acesso offline do inspetor (ADR 0016).
    const resultado = navigator.onLine ? await loginNoServidor(dados.matricula, dados.senha, tokenParaEnviar) : ({ tipo: "sem_rede" } as const);

    if (resultado.tipo === "sem_rede") {
      await entrarSemInternet(dados);
      return;
    }
    if (resultado.tipo === "ip_bloqueado") {
      setBloqueado(true);
      setExigeCaptcha(false);
      setErro(ERRO_IP_BLOQUEADO);
      return;
    }
    if (resultado.tipo === "captcha_necessario") {
      setExigeCaptcha(true);
      setErro("Confirme o desafio abaixo para continuar tentando.");
      return;
    }
    if (resultado.tipo !== "ok") {
      setErro(ERRO_CREDENCIAIS);
      return;
    }

    setErro(null);
    setExigeCaptcha(false);
    const { data: sessao } = await supabase.auth.setSession({
      access_token: resultado.accessToken,
      refresh_token: resultado.refreshToken,
    });
    // Guarda neste aparelho o verificador da senha: é o que permite entrar SEM internet no próximo turno.
    if (sessao.session) await registrarLoginOnline({ userId: sessao.session.user.id, matricula: dados.matricula, senha: dados.senha });
  }

  async function entrarSemInternet(dados: LoginForm) {
    const r = await entrarOffline(dados.matricula, dados.senha);
    if (!r.ok) {
      setErro(mensagemDaRecusaOffline(r));
      return;
    }
    setErro(null);
    await abrirSessaoOffline(r);
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
            {!online && (
              <p role="status" className="flex items-start gap-2 rounded-md border border-warning bg-warning/15 p-2 text-xs text-warning-foreground">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                Sem conexão: se você já entrou neste aparelho com internet nos últimos 7 dias, entre normalmente com matrícula e senha.
              </p>
            )}
            {exigeCaptcha && !bloqueado && <HCaptchaWidget key={captchaNonce} onToken={setCaptchaToken} />}
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || bloqueado || (exigeCaptcha && !captchaToken)}
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
