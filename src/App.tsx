import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuthListener } from "@/modules/auth/useAuthListener";
import { useSessionStore } from "@/store/session";
import { LoginPage } from "@/modules/auth/LoginPage";
import { ProtectedRoute } from "@/modules/auth/ProtectedRoute";
import { AppShell } from "@/shared/AppShell";
import { UpdateNotifier } from "@/shared/UpdateNotifier";
import { NovaFichaPage } from "@/modules/fichas/NovaFichaPage";
import { VerificacaoPage } from "@/modules/fichas/VerificacaoPage";
import { TemplateBuilderPage } from "@/modules/fichas/TemplateBuilderPage";
import { CarimbosPendentesPage } from "@/modules/carimbos/CarimbosPendentesPage";
import { LiberarSifPage } from "@/modules/sif/LiberarSifPage";
import { AuditoriaFederalPage } from "@/modules/sif/AuditoriaFederalPage";
import { VerificarPage } from "@/modules/verificacao-publica/VerificarPage";
import { RncTratativasPage } from "@/modules/rnc/RncTratativasPage";
import { NovaOsPage } from "@/modules/pcm/NovaOsPage";
import { PainelOsPage } from "@/modules/pcm/PainelOsPage";

const ROTA_INICIAL_POR_PERFIL: Record<string, string> = {
  INSPETOR_QUALIDADE: "/fichas/nova",
  VERIFICADOR: "/verificacao",
  ADMIN_MASTER: "/fichas/nova",
  INSPECAO_FEDERAL: "/auditoria",
  GESTOR_SETOR: "/rnc",
  INSPETOR_PCM: "/pcm",
};

function HomeRedirect() {
  const perfil = useSessionStore((s) => s.perfil);
  const destino = perfil ? (ROTA_INICIAL_POR_PERFIL[perfil.nivelAcesso] ?? "/fichas/nova") : "/fichas/nova";
  return <Navigate to={destino} replace />;
}

function AppRoutes() {
  useAuthListener();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verificar" element={<VerificarPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomeRedirect />} />
        <Route
          path="/fichas/nova"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_QUALIDADE", "ADMIN_MASTER"]}>
              <NovaFichaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verificacao"
          element={
            <ProtectedRoute perfisPermitidos={["VERIFICADOR", "ADMIN_MASTER"]}>
              <VerificacaoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <TemplateBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/carimbos"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <CarimbosPendentesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sif/liberar"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <LiberarSifPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rnc"
          element={
            <ProtectedRoute perfisPermitidos={["GESTOR_SETOR", "ADMIN_MASTER"]}>
              <RncTratativasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pcm"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_PCM", "ADMIN_MASTER"]}>
              <PainelOsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pcm/nova"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_PCM", "ADMIN_MASTER"]}>
              <NovaOsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/auditoria"
          element={
            <ProtectedRoute perfisPermitidos={["INSPECAO_FEDERAL", "ADMIN_MASTER"]}>
              <AuditoriaFederalPage />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <UpdateNotifier />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
