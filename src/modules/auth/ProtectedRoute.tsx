import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSessionStore } from "@/store/session";
import type { NivelAcesso } from "@/lib/database.types";

interface ProtectedRouteProps {
  children: ReactNode;
  perfisPermitidos?: NivelAcesso[];
}

/**
 * Gate de rota client-side — só para EXPERIÊNCIA de navegação (esconder o que o usuário não
 * deveria nem tentar acessar). Nunca é a fonte de autorização real: mesmo que este componente
 * tivesse um bug, a RLS no banco continua negando os dados. Ver seção 8 do PROMPT MESTRE.
 */
export function ProtectedRoute({ children, perfisPermitidos }: ProtectedRouteProps) {
  const perfil = useSessionStore((s) => s.perfil);
  const carregando = useSessionStore((s) => s.carregando);

  if (carregando) return null;
  if (!perfil) return <Navigate to="/login" replace />;
  if (perfisPermitidos && !perfisPermitidos.includes(perfil.nivelAcesso)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
