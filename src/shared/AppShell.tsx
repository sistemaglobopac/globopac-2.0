import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";
import { usePresenceTracking } from "@/modules/gestao/usePresenceTracking";
import { horaEmManaus } from "@/modules/bordo/api";
import { GlobalInspectorAlerts } from "@/modules/bordo/GlobalInspectorAlerts";
import { NIVEL_ACESSO_BADGE } from "@/modules/gestao/api";

interface ItemMenu {
  rota: string;
  rotulo: string;
}

const NIVEL_ACESSO_ROTULO: Record<string, string> = {
  INSPETOR_QUALIDADE: "Inspetor de Qualidade",
  VERIFICADOR: "Verificador",
  GESTOR_SETOR: "Gestor de Setor",
  ADMIN_MASTER: "Administrador",
  INSPECAO_FEDERAL: "Inspeção Federal",
  INSPETOR_PCM: "Inspetor PCM",
};

function saudacaoPorHora(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function iniciaisDoNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const MENU_POR_PERFIL: Record<string, ItemMenu[]> = {
  INSPETOR_QUALIDADE: [
    { rota: "/painel", rotulo: "Painel de Bordo" },
    { rota: "/nova-rnc", rotulo: "Abrir RNC" },
  ],
  VERIFICADOR: [
    { rota: "/verificacao", rotulo: "Painel de Verificação" },
    { rota: "/rnc", rotulo: "Revisão de RNC" },
    { rota: "/sif/liberar", rotulo: "Painel de Arquivo" },
  ],
  INSPECAO_FEDERAL: [{ rota: "/auditoria", rotulo: "Auditoria" }],
  GESTOR_SETOR: [
    { rota: "/rnc", rotulo: "Tratativas RNC" },
    { rota: "/dashboard", rotulo: "Painel gerencial" },
  ],
  INSPETOR_PCM: [
    { rota: "/pcm", rotulo: "Ordens de Serviço" },
    { rota: "/pcm/nova", rotulo: "Nova OS" },
    { rota: "/dashboard", rotulo: "Painel gerencial" },
  ],
  ADMIN_MASTER: [
    { rota: "/gestao", rotulo: "Painel de Gestão" },
    { rota: "/painel", rotulo: "Painel de Bordo" },
    { rota: "/verificacao", rotulo: "Painel de Verificação" },
    { rota: "/rnc", rotulo: "Tratativas RNC" },
    { rota: "/pcm", rotulo: "Ordens de Serviço" },
    { rota: "/pcm/nova", rotulo: "Nova OS" },
    { rota: "/templates", rotulo: "Construtor de Fichas" },
    { rota: "/admin/setores", rotulo: "Gestão de Setores" },
    { rota: "/sif/liberar", rotulo: "Painel de Arquivo" },
    { rota: "/auditoria", rotulo: "Auditoria" },
    { rota: "/carimbos", rotulo: "Carimbos de tempo" },
    { rota: "/dashboard", rotulo: "Painel gerencial" },
  ],
};

/** Barra superior fixa (sticky) do AppShell: saudação dinâmica, avatar com iniciais, data por
 * extenso e relógio ao vivo — tudo em America/Manaus, igual ao resto do sistema (ver
 * horaEmManaus/inicioDoDiaManaus em bordo/api.ts). Fica sempre visível ao rolar a página porque
 * mora no cabeçalho global do layout, não dentro do conteúdo de cada módulo. */
function CabecalhoGlobal({
  perfil,
  onAbrirMenu,
}: {
  perfil: PerfilSessao | null;
  onAbrirMenu: () => void;
}) {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const horaManaus = horaEmManaus(agora);
  const relogio = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(agora);
  const dataExtenso = capitalizar(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Manaus",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(agora)
  );
  const primeiroNome = perfil?.nomeCompleto.trim().split(/\s+/)[0] ?? "";
  const badge = perfil ? NIVEL_ACESSO_BADGE[perfil.nivelAcesso] : null;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-surface-dark p-3 text-ondark shadow-lg sm:gap-4 sm:p-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ondark hover:bg-white/10 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-ondark sm:h-10 sm:w-10 sm:text-sm"
          aria-hidden
        >
          {perfil ? iniciaisDoNome(perfil.nomeCompleto) : "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black leading-tight">
            {saudacaoPorHora(horaManaus)}, {primeiroNome}!
          </p>
          <p className="hidden truncate text-xs leading-tight text-ondark-soft sm:block">{dataExtenso}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="hidden font-mono text-base font-bold tabular-nums text-lime sm:inline">{relogio}</span>
        {badge && perfil && (
          <span
            className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:inline-block ${badge.className}`}
          >
            {NIVEL_ACESSO_ROTULO[perfil.nivelAcesso]}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="border-white/30 bg-white/10 text-ondark hover:bg-white/20"
          onClick={() => supabase.auth.signOut()}
        >
          Sair
        </Button>
      </div>
    </header>
  );
}

/** Conteúdo do menu, compartilhado entre a sidebar fixa (desktop, ≥lg) e o drawer (mobile/tablet).
 * `onNavegar` fecha o drawer ao escolher uma rota — sem isso o menu ficaria aberto cobrindo a
 * tela depois do usuário navegar, já que o drawer é controlado por estado, não pela rota. */
function MenuLateral({ itens, onNavegar }: { itens: ItemMenu[]; onNavegar?: () => void }) {
  return (
    <>
      <div className="p-4">
        <img src="/logo-globopac-white.png" alt="GloboPac" className="h-14 w-auto sm:h-16" />
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {itens.map((item) => (
          <NavLink
            key={item.rota}
            to={item.rota}
            onClick={onNavegar}
            className={({ isActive }) =>
              cn(
                "rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm font-medium text-ondark-soft transition-colors hover:bg-white/5 hover:text-ondark",
                isActive && "border-lime bg-white/10 font-semibold text-ondark"
              )
            }
          >
            {item.rotulo}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function AppShell() {
  const perfil = useSessionStore((s) => s.perfil);
  const itens = perfil ? (MENU_POR_PERFIL[perfil.nivelAcesso] ?? []) : [];
  const [menuAberto, setMenuAberto] = useState(false);
  const location = useLocation();
  // Presença global (qualquer perfil, não só ADMIN_MASTER) — o KPI "Usuários Ativos" do Painel
  // de Gestão precisa ver todo mundo com o app aberto, não só quem abriu o próprio painel.
  usePresenceTracking(perfil?.id);

  // Fecha o drawer sempre que a rota muda (ex.: navegação por trás, botão voltar do navegador)
  // — sem isso um NavLink clicado que não muda de rota (já está na página) deixaria o menu aberto.
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  return (
    <div className="page-wash flex min-h-screen">
      {/* Sidebar fixa — só em telas grandes (lg+). Em telas menores vira drawer abaixo. */}
      <aside className="glass-sidebar hidden w-60 shrink-0 border-r border-white/10 lg:block">
        <MenuLateral itens={itens} />
      </aside>

      {/* Drawer mobile/tablet: overlay + painel deslizante, só existe (e captura clique) quando aberto. */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuAberto(false)}
            aria-hidden
          />
          <aside className="glass-sidebar relative flex h-full w-72 max-w-[80vw] flex-col overflow-y-auto border-r border-white/10 shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-md text-ondark hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
            <MenuLateral itens={itens} onNavegar={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <CabecalhoGlobal perfil={perfil} onAbrirMenu={() => setMenuAberto(true)} />
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <GlobalInspectorAlerts />
    </div>
  );
}
