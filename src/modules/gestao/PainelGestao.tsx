import { useState, type ComponentType } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bug,
  ClipboardPlus,
  Clock,
  Cog,
  FileText,
  Landmark,
  MapPin,
  Megaphone,
  Settings,
  ShieldAlert,
  Timer,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PainelBordo } from "@/modules/bordo/PainelBordo";
import { PainelVerificacao } from "@/modules/fichas/PainelVerificacao";
import { RncTratativasPage } from "@/modules/rnc/RncTratativasPage";
import { ConstrutorFichasPage } from "@/modules/fichas/ConstrutorFichasPage";
import { DashboardPage } from "@/modules/bi/DashboardPage";
import { PainelOsPage } from "@/modules/pcm/PainelOsPage";
import { SetoresPage } from "@/modules/admin/SetoresPage";
import { DialogProvider } from "./dialogSystem";
import { usePresenceStore } from "./presenceStore";
import { useMonitoramentosHoje, usePausasEmAndamento, useRncsPendentesDetalhado } from "./api";
import { ModalUsuariosAtivos } from "./modals/ModalUsuariosAtivos";
import { ModalPausasInspetores } from "./modals/ModalPausasInspetores";
import { ModalMonitoramentosAndamento } from "./modals/ModalMonitoramentosAndamento";
import { ModalRncsPendentes } from "./modals/ModalRncsPendentes";
import { ModalFolhasPausa } from "./modals/ModalFolhasPausa";
import { UsuariosAdminPanel } from "./admin/UsuariosAdminPanel";
import { AreasAdminPanel } from "./admin/AreasAdminPanel";
import { EquipamentosAdminPanel } from "./admin/EquipamentosAdminPanel";
import { DesviosAdminPanel } from "./admin/DesviosAdminPanel";
import { ComunicadosPanel } from "./admin/ComunicadosPanel";
import { ControlePragasPanel } from "./admin/ControlePragasPanel";
import { SegurancaLoginPanel } from "./admin/SegurancaLoginPanel";

const ABAS_VALIDAS = [
  "bi",
  "simulador",
  "verificacao",
  "tratativas",
  "admin",
  "admin_setores",
  "admin_areas",
  "admin_os_aprovacao",
  "fichas_builder",
  "dashboard_bi",
  "equipamentos",
  "desvios",
  "comunicados",
  "controle_pragas",
  "seguranca_login",
] as const;
type AbaGestao = (typeof ABAS_VALIDAS)[number];

const ABAS_SEM_TITULO = new Set<AbaGestao>(["tratativas", "simulador", "verificacao", "comunicados"]);
const ABAS_COM_AVISO_ADMIN = new Set<AbaGestao>(["simulador", "verificacao", "tratativas"]);

const AVISO_POR_ABA: Record<string, string> = {
  simulador: "Você está operando temporariamente o Painel de Bordo (Monitor de Qualidade)",
  verificacao: "Você está operando temporariamente o Painel de Verificação (Verificador)",
  tratativas: "Você está operando temporariamente as Tratativas de RNC (Encarregado de Setor)",
};

function ehAbaValida(valor: string | null): valor is AbaGestao {
  return !!valor && (ABAS_VALIDAS as readonly string[]).includes(valor);
}

function useAbaAtiva(): [AbaGestao, (aba: AbaGestao) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const aba: AbaGestao = ehAbaValida(raw) ? raw : "bi";
  const irPara = (novaAba: AbaGestao) => setParams(novaAba === "bi" ? {} : { tab: novaAba });
  return [aba, irPara];
}

/** Injeta só a animação de entrada dos cartões/botões do Painel de Gestão — cor e superfícies
 * agora vêm inteiramente das classes utilitárias Tailwind/design system, não deste bloco. */
function EstilosGestao() {
  return (
    <style>{`
      @keyframes gs-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .gs-scope .gs-fade-up { animation: gs-fade-up 0.45s ease both; }
      .gs-scope .gs-d1 { animation-delay: .04s; }
      .gs-scope .gs-d2 { animation-delay: .08s; }
      .gs-scope .gs-d3 { animation-delay: .12s; }
      .gs-scope .gs-d4 { animation-delay: .16s; }
      .gs-scope .gs-d5 { animation-delay: .2s; }
      .gs-scope .gs-d6 { animation-delay: .24s; }
    `}</style>
  );
}

/** Título elegante da página, abaixo do cabeçalho global sticky (saudação/relógio já vivem lá,
 * em AppShell) — rola normalmente com o conteúdo, não fica fixo. */
function TituloPainelGestao() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-primary-active p-4 text-ondark shadow-md">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
        <Settings className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-lg font-black">Painel de Gestão</h1>
        <p className="text-xs text-ondark-soft">Console administrativo master</p>
      </div>
    </div>
  );
}

function AvisoOperacaoAdmin({ aba }: { aba: AbaGestao }) {
  return (
    <div className="rounded-xl border border-warning bg-warning/10 p-3 text-center text-sm font-bold text-warning">
      {AVISO_POR_ABA[aba]} — qualquer ação executada aqui terá validade oficial e será registrada com o seu
      nome de administrador nos relatórios e na trilha de auditoria.
    </div>
  );
}

/** Paleta fechada de variantes semânticas para os KPIs do Painel de Gestão — só os tokens do
 * design system (primary/lime/warning/destructive/success), nunca hex arbitrário por card. */
const KPI_VARIANTES = {
  primary: { soft: "bg-primary/10 border-primary/40", solid: "bg-primary", solidText: "text-primary-foreground", tint: "text-primary" },
  lime: { soft: "bg-lime/10 border-lime/50", solid: "bg-lime", solidText: "text-primary", tint: "text-lime" },
  warning: { soft: "bg-warning/10 border-warning/40", solid: "bg-warning", solidText: "text-warning-foreground", tint: "text-warning" },
  destructive: { soft: "bg-destructive/10 border-destructive/40", solid: "bg-destructive", solidText: "text-destructive-foreground", tint: "text-destructive" },
  success: { soft: "bg-success/10 border-success/40", solid: "bg-success", solidText: "text-success-foreground", tint: "text-success" },
} as const;

interface KpiCardGestaoProps {
  icon: LucideIcon;
  variante: keyof typeof KPI_VARIANTES;
  rotulo: string;
  valor: number | string;
  subtitulo: string;
  indice: number;
  onClick: () => void;
}

function KpiCardGestao({ icon: Icon, variante, rotulo, valor, subtitulo, indice, onClick }: KpiCardGestaoProps) {
  const v = KPI_VARIANTES[variante];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "gs-fade-up relative overflow-hidden rounded-2xl border-2 p-5 text-left shadow-md transition-transform hover:-translate-y-0.5",
        v.soft,
        `gs-d${indice}`
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-1", v.solid)} />
      <Icon className={cn("pointer-events-none absolute -right-3 -top-2 h-24 w-24 opacity-15", v.tint)} />
      <div className={cn("relative flex h-10 w-10 items-center justify-center rounded-[11px]", v.solid)}>
        <Icon className={cn("h-5 w-5", v.solidText)} />
      </div>
      <span
        className={cn(
          "relative mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
          v.solid,
          v.solidText
        )}
      >
        {rotulo}
      </span>
      <p className="relative mt-3 font-mono text-[2.5rem] font-black leading-none text-ink">{valor}</p>
      <p className="relative mt-1 text-sm text-muted-foreground">{subtitulo}</p>
    </button>
  );
}

function BotaoFerramenta({
  icon: Icon,
  categoria,
  titulo,
  indice,
  onClick,
}: {
  icon: LucideIcon;
  categoria: string;
  titulo: string;
  indice: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gs-fade-up gs-d${indice} flex items-center gap-3 rounded-xl bg-primary p-4 text-left text-ondark shadow-sm transition-colors hover:bg-primary-active`}
    >
      <Icon className="h-6 w-6 shrink-0 text-lime" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ondark-soft">{categoria}</p>
        <p className="text-sm font-bold">{titulo}</p>
      </div>
    </button>
  );
}

function BotaoGestaoSistema({
  icon: Icon,
  categoria,
  titulo,
  indice,
  onClick,
}: {
  icon: LucideIcon;
  categoria: string;
  titulo: string;
  indice: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gs-fade-up gs-d${indice} flex items-center gap-3 rounded-xl border border-white/10 bg-surface-dark p-4 text-left text-ondark shadow-sm transition-colors hover:bg-primary-active`}
    >
      <Icon className="h-6 w-6 shrink-0 text-lime" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-ondark-soft">{categoria}</p>
        <p className="text-sm font-bold">{titulo}</p>
      </div>
    </button>
  );
}

type ModalKpi = "usuarios" | "pausas" | "monitoramentos" | "rncs" | "folhas" | null;

function AbaHome({ irPara }: { irPara: (aba: AbaGestao) => void }) {
  const navigate = useNavigate();
  const onlineIds = usePresenceStore((s) => s.onlineIds);
  const { data: pausas } = usePausasEmAndamento();
  const { data: monitoramentosHoje } = useMonitoramentosHoje();
  const { data: rncDetalhado } = useRncsPendentesDetalhado();
  const [modalAberto, setModalAberto] = useState<ModalKpi>(null);

  const rncPendentesTotal =
    (rncDetalhado?.emTratativa.length ?? 0) + (rncDetalhado?.pendenteVerificacao.length ?? 0) + (rncDetalhado?.fichasSemRnc.length ?? 0);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCardGestao
          icon={Users}
          variante="primary"
          rotulo="Usuários Ativos"
          valor={onlineIds.size}
          subtitulo="Conectados agora"
          indice={1}
          onClick={() => setModalAberto("usuarios")}
        />
        <KpiCardGestao
          icon={Clock}
          variante="warning"
          rotulo="Pausa dos Inspetores"
          valor={pausas?.length ?? 0}
          subtitulo="Em andamento agora"
          indice={2}
          onClick={() => setModalAberto("pausas")}
        />
        <KpiCardGestao
          icon={FileText}
          variante="lime"
          rotulo="Monitoramentos em Andamento"
          valor={monitoramentosHoje?.length ?? 0}
          subtitulo="Fichas criadas hoje"
          indice={3}
          onClick={() => setModalAberto("monitoramentos")}
        />
        <KpiCardGestao
          icon={AlertOctagon}
          variante="destructive"
          rotulo="RNCs Pendentes"
          valor={rncPendentesTotal}
          subtitulo="Aguardando tratativa/verificação"
          indice={4}
          onClick={() => setModalAberto("rncs")}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Ferramentas</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <BotaoFerramenta icon={ClipboardPlus} categoria="Ferramenta" titulo="Criar Fichas" indice={1} onClick={() => irPara("fichas_builder")} />
          <BotaoFerramenta icon={Megaphone} categoria="Comunicação" titulo="Comunicados" indice={2} onClick={() => irPara("comunicados")} />
          <BotaoFerramenta icon={Timer} categoria="Jornada" titulo="Folhas de Pausa" indice={3} onClick={() => setModalAberto("folhas")} />
          <BotaoFerramenta icon={Bug} categoria="Módulo Externo" titulo="Controle Pragas" indice={4} onClick={() => irPara("controle_pragas")} />
          <BotaoFerramenta icon={BarChart3} categoria="Análise" titulo="Dashboard BI" indice={5} onClick={() => irPara("dashboard_bi")} />
          <BotaoFerramenta icon={TrendingUp} categoria="Gestão" titulo="Melhoria Contínua" indice={6} onClick={() => navigate("/melhoria-continua")} />
        </div>
      </section>

      <div className="h-px bg-hairline" />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Gestão do Sistema</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <BotaoGestaoSistema icon={Users} categoria="Configurações" titulo="Acessos de Usuários" indice={1} onClick={() => irPara("admin")} />
          <BotaoGestaoSistema icon={MapPin} categoria="Configurações" titulo="Setores Globais" indice={2} onClick={() => irPara("admin_setores")} />
          <BotaoGestaoSistema icon={Landmark} categoria="PCM" titulo="Áreas e Custos" indice={3} onClick={() => irPara("admin_areas")} />
          <BotaoGestaoSistema icon={Wrench} categoria="PCM" titulo="Aprovação de OS" indice={4} onClick={() => irPara("admin_os_aprovacao")} />
          <BotaoGestaoSistema icon={Cog} categoria="Configurações" titulo="Equipamentos" indice={5} onClick={() => irPara("equipamentos")} />
          <BotaoGestaoSistema icon={AlertTriangle} categoria="Configurações" titulo="Desvios" indice={6} onClick={() => irPara("desvios")} />
          <BotaoGestaoSistema icon={ShieldAlert} categoria="Configurações" titulo="Segurança de Login" indice={7} onClick={() => irPara("seguranca_login")} />
        </div>
      </section>

      {modalAberto === "usuarios" && <ModalUsuariosAtivos onClose={() => setModalAberto(null)} />}
      {modalAberto === "pausas" && <ModalPausasInspetores onClose={() => setModalAberto(null)} />}
      {modalAberto === "monitoramentos" && <ModalMonitoramentosAndamento onClose={() => setModalAberto(null)} />}
      {modalAberto === "rncs" && <ModalRncsPendentes onClose={() => setModalAberto(null)} />}
      {modalAberto === "folhas" && <ModalFolhasPausa onClose={() => setModalAberto(null)} />}
    </div>
  );
}

const PAINEL_POR_ABA: Partial<Record<AbaGestao, ComponentType>> = {
  simulador: PainelBordo,
  verificacao: PainelVerificacao,
  tratativas: RncTratativasPage,
  admin: UsuariosAdminPanel,
  admin_setores: SetoresPage,
  admin_areas: AreasAdminPanel,
  admin_os_aprovacao: PainelOsPage,
  fichas_builder: ConstrutorFichasPage,
  dashboard_bi: DashboardPage,
  equipamentos: EquipamentosAdminPanel,
  desvios: DesviosAdminPanel,
  comunicados: ComunicadosPanel,
  controle_pragas: ControlePragasPanel,
  seguranca_login: SegurancaLoginPanel,
};

/** Painel de Gestão — console administrativo master do ADMIN_MASTER. Componente único e
 * autocontido: navegação por query string (`?tab=`, deep-linkável), usa o mesmo design system
 * GloboPac (navy/lima) do resto do app via classes Tailwind + a animação de entrada injetada
 * por EstilosGestao, e reaproveita os painéis operacionais/administrativos que já existem no
 * resto do sistema para as abas que só embutem um módulo existente. */
export function PainelGestao() {
  const [aba, irPara] = useAbaAtiva();
  const Painel = PAINEL_POR_ABA[aba];

  return (
    <DialogProvider>
      <div className="gs-scope space-y-6">
        <EstilosGestao />
        {!ABAS_SEM_TITULO.has(aba) && <TituloPainelGestao />}
        {ABAS_COM_AVISO_ADMIN.has(aba) && <AvisoOperacaoAdmin aba={aba} />}
        {aba === "bi" ? <AbaHome irPara={irPara} /> : Painel ? <Painel /> : <AbaHome irPara={irPara} />}
      </div>
    </DialogProvider>
  );
}
