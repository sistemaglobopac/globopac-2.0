import * as React from "react";
import { cn } from "@/lib/utils";

/** O navegador não pode preencher campos da ficha sozinho. Com um campo de senha na tela (assinatura, reconexão), o gerenciador
 * de senhas do Chrome preenche a senha salva do login e joga o "usuário" (a matrícula) no campo de texto logo antes dela — era
 * assim que a matrícula aparecia na temperatura do Chiller 2. Por isso: texto fica com autocomplete "off" e senha com
 * "new-password" (o navegador não oferece credencial salva para ela). Quem precisa de outro valor (tela de login) passa o seu. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, autoComplete, ...props }, ref) => {
    const ehSenha = type === "password";
    return (
      <input
        type={type}
        autoComplete={autoComplete ?? (ehSenha ? "new-password" : "off")}
        {...(ehSenha ? { "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": "true" } : {})}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
