import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";

interface ItemMenu {
  rota: string;
  rotulo: string;
}

const MENU_POR_PERFIL: Record<string, ItemMenu[]> = {
  INSPETOR_QUALIDADE: [{ rota: "/fichas/nova", rotulo: "Nova ficha" }],
  VERIFICADOR: [{ rota: "/verificacao", rotulo: "Verificação" }],
  INSPECAO_FEDERAL: [{ rota: "/auditoria", rotulo: "Auditoria" }],
  GESTOR_SETOR: [{ rota: "/rnc", rotulo: "Tratativas RNC" }],
  INSPETOR_PCM: [
    { rota: "/pcm", rotulo: "Ordens de Serviço" },
    { rota: "/pcm/nova", rotulo: "Nova OS" },
  ],
  ADMIN_MASTER: [
    { rota: "/fichas/nova", rotulo: "Nova ficha" },
    { rota: "/verificacao", rotulo: "Verificação" },
    { rota: "/rnc", rotulo: "Tratativas RNC" },
    { rota: "/pcm", rotulo: "Ordens de Serviço" },
    { rota: "/pcm/nova", rotulo: "Nova OS" },
    { rota: "/templates", rotulo: "Templates" },
    { rota: "/sif/liberar", rotulo: "Liberar ao SIF" },
    { rota: "/auditoria", rotulo: "Auditoria" },
    { rota: "/carimbos", rotulo: "Carimbos de tempo" },
  ],
};

export function AppShell() {
  const perfil = useSessionStore((s) => s.perfil);
  const itens = perfil ? (MENU_POR_PERFIL[perfil.nivelAcesso] ?? []) : [];

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-card">
        <div className="p-4 text-lg font-semibold">GloboPac 2.0</div>
        <nav className="flex flex-col gap-1 px-2">
          {itens.map((item) => (
            <NavLink
              key={item.rota}
              to={item.rota}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                  isActive && "bg-accent text-accent-foreground"
                )
              }
            >
              {item.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b p-4">
          <div className="text-sm text-muted-foreground">
            {perfil?.nomeCompleto} · {perfil?.nivelAcesso}
          </div>
          <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
