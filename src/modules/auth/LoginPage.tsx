import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabase";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  senha: z.string().min(1, "Informe a senha"),
});
type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [erro, setErro] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function aoEnviar(dados: LoginForm) {
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: dados.email,
      password: dados.senha,
    });
    if (error) setErro("E-mail ou senha inválidos.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>GloboPac 2.0</CardTitle>
          <CardDescription>Controle de qualidade e auditoria — SIF 1606</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="username" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
