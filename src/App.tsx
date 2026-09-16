import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuthListener } from "@/modules/auth/useAuthListener";
import { LoginPage } from "@/modules/auth/LoginPage";
import { ProtectedRoute } from "@/modules/auth/ProtectedRoute";
import { AppShell } from "@/shared/AppShell";
import { NovaFichaPage } from "@/modules/fichas/NovaFichaPage";
import { VerificacaoPage } from "@/modules/fichas/VerificacaoPage";
import { TemplateBuilderPage } from "@/modules/fichas/TemplateBuilderPage";

function AppRoutes() {
  useAuthListener();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/fichas/nova" replace />} />
        <Route path="/fichas/nova" element={<NovaFichaPage />} />
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
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
