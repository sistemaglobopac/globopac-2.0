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
import { PainelVerificacao } from "@/modules/fichas/PainelVerificacao";
import { ConstrutorFichasPage } from "@/modules/fichas/ConstrutorFichasPage";
import { SetoresPage } from "@/modules/admin/SetoresPage";
import { CarimbosPendentesPage } from "@/modules/carimbos/CarimbosPendentesPage";
import { LiberarSifPage } from "@/modules/sif/LiberarSifPage";
import { AuditoriaFederalPage } from "@/modules/sif/AuditoriaFederalPage";
import { VerificarPage } from "@/modules/verificacao-publica/VerificarPage";
import { RncTratativasPage } from "@/modules/rnc/RncTratativasPage";
import { NovaRncPage } from "@/modules/rnc/NovaRncPage";
import { NovaOsPage } from "@/modules/pcm/NovaOsPage";
import { PainelOsPage } from "@/modules/pcm/PainelOsPage";
import { DashboardPage } from "@/modules/bi/DashboardPage";
import { PainelBordo } from "@/modules/bordo/PainelBordo";
import { PainelGestao } from "@/modules/gestao/PainelGestao";
import { RelatorioFolhaPausaPage } from "@/modules/gestao/RelatorioFolhaPausaPage";
import { MelhoriaContinuaPage } from "@/modules/gestao/MelhoriaContinuaPage";

const ROTA_INICIAL_POR_PERFIL: Record<string, string> = {
  INSPETOR_QUALIDADE: "/painel",
  VERIFICADOR: "/verificacao",
  ADMIN_MASTER: "/gestao",
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
          path="/painel"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_QUALIDADE", "ADMIN_MASTER"]}>
              <PainelBordo />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fichas/nova"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_QUALIDADE", "ADMIN_MASTER"]}>
              <NovaFichaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/nova-rnc"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_QUALIDADE", "ADMIN_MASTER"]}>
              <NovaRncPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/verificacao"
          element={
            <ProtectedRoute perfisPermitidos={["VERIFICADOR", "ADMIN_MASTER"]}>
              <PainelVerificacao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <ConstrutorFichasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/setores"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <SetoresPage />
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
            <ProtectedRoute perfisPermitidos={["GESTOR_SETOR", "VERIFICADOR", "ADMIN_MASTER"]}>
              <RncTratativasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pcm"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_PCM", "ADMIN_MASTER", "INSPETOR_QUALIDADE"]}>
              <PainelOsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pcm/nova"
          element={
            <ProtectedRoute perfisPermitidos={["INSPETOR_PCM", "ADMIN_MASTER", "INSPETOR_QUALIDADE"]}>
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
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER", "GESTOR_SETOR", "INSPETOR_PCM"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gestao"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <PainelGestao />
            </ProtectedRoute>
          }
        />
        <Route
          path="/relatorios/folha-pausa"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <RelatorioFolhaPausaPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/melhoria-continua"
          element={
            <ProtectedRoute perfisPermitidos={["ADMIN_MASTER"]}>
              <MelhoriaContinuaPage />
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
