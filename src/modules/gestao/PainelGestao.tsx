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
  Timer,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PainelBordo } from "@/modules/bordo/PainelBordo";
import { PainelVerificacao } from "@/modules/fichas/PainelVerificacao";
import { RncTratativasPage } from "@/modules/rnc/RncTratativasPage";
import { ConstrutorFichasPage } from "@/modules/fichas/ConstrutorFichasPage";
import { DashboardPage } from "@/modules/bi/DashboardPage";
import { PainelOsPage } from "@/modules/pcm/PainelOsPage";
import { SetoresPage } from "@/modules/admin/SetoresPage";
import { DialogProvider } from "./dialogSystem";
import { PageHeaderGestao } from "./PageHeaderGestao";
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

/** Injeta os keyframes/classes específicos do design system do Painel de Gestão (roxo/lima) —
 * o painel é um componente único e autocontido (não altera tailwind.config.ts/index.css
 * globais), então o CSS custom mora aqui, escopado por `.gs-scope`. */
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
      .gs-scope .gs-btn-ferramenta:hover { background: #422082 !important; }
      .gs-scope .gs-btn-sistema:hover { background: #2a2050 !important; }
    `}</style>
  );
}

function TituloPainelGestao() {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-4 text-white shadow-md"
      style={{ background: "linear-gradient(135deg, #6a5fc1, #422082)" }}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(255,255,255,0.18)" }}>
        <Settings className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-lg font-black">Painel de Gestão</h1>
        <p className="text-xs" style={{ color: "#e4defa" }}>Console administrativo master</p>
      </div>
    </div>
  );
}

function AvisoOperacaoAdmin({ aba }: { aba: AbaGestao }) {
  return (
    <div
      className="rounded-xl p-3 text-center text-sm font-bold"
      style={{ background: "#fff7e6", border: "1px solid #f0c96b", color: "#8a5a00" }}
    >
      {AVISO_POR_ABA[aba]} — qualquer ação executada aqui terá validade oficial e será registrada com o seu
      nome de administrador nos relatórios e na trilha de auditoria.
    </div>
  );
}

interface KpiCardGestaoProps {
  icon: LucideIcon;
  cor: string;
  textoEscuro?: boolean;
  rotulo: string;
  valor: number | string;
  subtitulo: string;
  indice: number;
  onClick: () => void;
}

function KpiCardGestao({ icon: Icon, cor, textoEscuro, rotulo, valor, subtitulo, indice, onClick }: KpiCardGestaoProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`gs-fade-up gs-d${indice} relative overflow-hidden rounded-2xl p-5 text-left shadow-md transition-transform hover:-translate-y-0.5`}
      style={{ background: `linear-gradient(145deg, ${cor}30, ${cor}10)`, border: `2px solid ${cor}B3` }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: cor }} />
      <Icon className="pointer-events-none absolute -right-3 -top-2 h-24 w-24" style={{ color: cor, opacity: 0.16 }} />
      <div className="relative flex h-10 w-10 items-center justify-center rounded-[11px]" style={{ background: cor }}>
        <Icon className="h-5 w-5" style={{ color: textoEscuro ? "#1f1633" : "#ffffff" }} />
      </div>
      <span
        className="relative mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
        style={{ background: cor, color: textoEscuro ? "#1f1633" : "#ffffff" }}
      >
        {rotulo}
      </span>
      <p className="relative mt-3 font-mono text-[2.5rem] font-black leading-none" style={{ color: "#1f1633" }}>
        {valor}
      </p>
      <p className="relative mt-1 text-sm" style={{ color: "#79628c" }}>
        {subtitulo}
      </p>
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
      className={`gs-fade-up gs-d${indice} gs-btn-ferramenta flex items-center gap-3 rounded-xl p-4 text-left text-white shadow-sm transition-colors`}
      style={{ background: "#6a5fc1" }}
    >
      <Icon className="h-6 w-6 shrink-0" style={{ color: "#c2ef4e" }} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#e4defa" }}>
          {categoria}
        </p>
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
      className={`gs-fade-up gs-d${indice} gs-btn-sistema flex items-center gap-3 rounded-xl p-4 text-left text-white shadow-sm transition-colors`}
      style={{ background: "#1f1633", border: "1px solid #362d59" }}
    >
      <Icon className="h-6 w-6 shrink-0" style={{ color: "#c2ef4e" }} />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#a99bd6" }}>
          {categoria}
        </p>
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
          cor="#6a5fc1"
          rotulo="Usuários Ativos"
          valor={onlineIds.size}
          subtitulo="Conectados agora"
          indice={1}
          onClick={() => setModalAberto("usuarios")}
        />
        <KpiCardGestao
          icon={Clock}
          cor="#79628c"
          rotulo="Pausa dos Inspetores"
          valor={pausas?.length ?? 0}
          subtitulo="Em andamento agora"
          indice={2}
          onClick={() => setModalAberto("pausas")}
        />
        <KpiCardGestao
          icon={FileText}
          cor="#c2ef4e"
          textoEscuro
          rotulo="Monitoramentos em Andamento"
          valor={monitoramentosHoje?.length ?? 0}
          subtitulo="Fichas criadas hoje"
          indice={3}
          onClick={() => setModalAberto("monitoramentos")}
        />
        <KpiCardGestao
          icon={AlertOctagon}
          cor="#dc2626"
          rotulo="RNCs Pendentes"
          valor={rncPendentesTotal}
          subtitulo="Aguardando tratativa/verificação"
          indice={4}
          onClick={() => setModalAberto("rncs")}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
          Ferramentas
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <BotaoFerramenta icon={ClipboardPlus} categoria="Ferramenta" titulo="Criar Fichas" indice={1} onClick={() => irPara("fichas_builder")} />
          <BotaoFerramenta icon={Megaphone} categoria="Comunicação" titulo="Comunicados" indice={2} onClick={() => irPara("comunicados")} />
          <BotaoFerramenta icon={Timer} categoria="Jornada" titulo="Folhas de Pausa" indice={3} onClick={() => setModalAberto("folhas")} />
          <BotaoFerramenta icon={Bug} categoria="Módulo Externo" titulo="Controle Pragas" indice={4} onClick={() => irPara("controle_pragas")} />
          <BotaoFerramenta icon={BarChart3} categoria="Análise" titulo="Dashboard BI" indice={5} onClick={() => irPara("dashboard_bi")} />
          <BotaoFerramenta icon={TrendingUp} categoria="Gestão" titulo="Melhoria Contínua" indice={6} onClick={() => navigate("/melhoria-continua")} />
        </div>
      </section>

      <div className="h-px" style={{ background: "#dfe2e7" }} />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
          Gestão do Sistema
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <BotaoGestaoSistema icon={Users} categoria="Configurações" titulo="Acessos de Usuários" indice={1} onClick={() => irPara("admin")} />
          <BotaoGestaoSistema icon={MapPin} categoria="Configurações" titulo="Setores Globais" indice={2} onClick={() => irPara("admin_setores")} />
          <BotaoGestaoSistema icon={Landmark} categoria="PCM" titulo="Áreas e Custos" indice={3} onClick={() => irPara("admin_areas")} />
          <BotaoGestaoSistema icon={Wrench} categoria="PCM" titulo="Aprovação de OS" indice={4} onClick={() => irPara("admin_os_aprovacao")} />
          <BotaoGestaoSistema icon={Cog} categoria="Configurações" titulo="Equipamentos" indice={5} onClick={() => irPara("equipamentos")} />
          <BotaoGestaoSistema icon={AlertTriangle} categoria="Configurações" titulo="Desvios" indice={6} onClick={() => irPara("desvios")} />
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
};

/** Painel de Gestão — console administrativo master do ADMIN_MASTER. Componente único e
 * autocontido: navegação por query string (`?tab=`, deep-linkável), design system próprio
 * (roxo/lima) aplicado via estilos inline + o pouco de CSS injetado por EstilosGestao, e
 * reaproveita os painéis operacionais/administrativos que já existem no resto do sistema para
 * as abas que só embutem um módulo existente. */
export function PainelGestao() {
  const [aba, irPara] = useAbaAtiva();
  const Painel = PAINEL_POR_ABA[aba];

  return (
    <DialogProvider>
      <div className="gs-scope space-y-6">
        <EstilosGestao />
        <PageHeaderGestao />
        {!ABAS_SEM_TITULO.has(aba) && <TituloPainelGestao />}
        {ABAS_COM_AVISO_ADMIN.has(aba) && <AvisoOperacaoAdmin aba={aba} />}
        {aba === "bi" ? <AbaHome irPara={irPara} /> : Painel ? <Painel /> : <AbaHome irPara={irPara} />}
      </div>
    </DialogProvider>
  );
}
