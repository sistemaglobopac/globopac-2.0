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

const loginSchema = z.object({
  matricula: z.string().min(1, "Informe a matrícula"),
  senha: z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

const ERRO_CREDENCIAIS = "Matrícula ou senha inválidos.";

export function LoginPage() {
  const [erro, setErro] = useState<string | null>(null);
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

    // Supabase Auth só autentica por e-mail/telefone — resolve matrícula -> e-mail via RPC
    // antes de chamar signInWithPassword. Mesma mensagem genérica para matrícula inexistente
    // e senha errada, para não revelar qual das duas está incorreta.
    const { data: email, error: erroLookup } = await supabase.rpc("email_por_matricula", {
      p_matricula: dados.matricula,
    });

    if (erroLookup || !email) {
      setErro(ERRO_CREDENCIAIS);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: dados.senha,
    });
    if (error) setErro(ERRO_CREDENCIAIS);
  }

  return (
    <div className="page-wash flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm rounded-xl border-white/70 bg-white/85 shadow-lg backdrop-blur-xl">
        <CardHeader>
          <img src="/logo-globopac.png" alt="GloboPac" className="h-10 w-auto self-start" />
          <CardDescription>Controle de qualidade e auditoria — SIF 1606</CardDescription>
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
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
