import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMonitoramentosResumo, useOsResumo, useRncResumo, type MonitoramentoResumo, type OsResumo, type RncResumo } from "./api";
import { baixarCsv, linhasParaCsv } from "@/lib/csv";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { rotuloSituacao, situacaoDe } from "@/shared/situacaoConformidade";
import { useSessionStore } from "@/store/session";
import { cn } from "@/lib/utils";
import { CartaoKpi } from "./CartaoKpi";
import { ConsumoAguaTab } from "./consumoAgua/ConsumoAguaTab";
import { COR_DOWN, COR_LIMA, COR_NAVY, COR_NEUTRO, COR_WARNING } from "./cores";

function contarPorChave<T>(linhas: T[], chave: (item: T) => string): { rotulo: string; valor: number }[] {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const k = chave(linha);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return Array.from(contagem.entries()).map(([rotulo, valor]) => ({ rotulo, valor }));
}

function GraficoBarras({ dados, cores }: { dados: { rotulo: string; valor: number }[]; cores: string[] }) {
  if (dados.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="rotulo" fontSize={12} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
          {dados.map((_, indice) => (
            <Cell key={indice} fill={cores[indice % cores.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Aba "Visão geral" — KPIs e gráficos agregados sobre os mesmos dados que RLS já permite ao
 * usuário ver em outras telas (monitoramentos, RNC, OS): ADMIN_MASTER vê tudo, GESTOR_SETOR só o
 * próprio setor, INSPETOR_PCM só OS. Nenhuma permissão nova — agregação é só uma projeção do que a
 * tela já mostraria em detalhe. */
function VisaoGeralTab() {
  const { data: monitoramentos, isLoading: carregandoMonitoramentos } = useMonitoramentosResumo();
  const { data: rncs, isLoading: carregandoRnc } = useRncResumo();
  const { data: osList, isLoading: carregandoOs } = useOsResumo();

  const conformes = (monitoramentos ?? []).filter((m) => situacaoDe(m) === "CONFORME").length;
  const tratados = (monitoramentos ?? []).filter((m) => situacaoDe(m) === "TRATADO").length;
  const naoConformes = (monitoramentos ?? []).filter((m) => situacaoDe(m) === "NAO_CONFORME").length;
  const pendentesVerificacao = (monitoramentos ?? []).filter((m) => m.conformidade === null).length;

  const rncsAbertas = (rncs ?? []).filter((r) => r.status !== "FECHADA").length;
  const rncsSlaVencido = (rncs ?? []).filter(
    (r) => r.status !== "FECHADA" && new Date(r.prazo_sla).getTime() < Date.now()
  ).length;
  const rncsPorSeveridade = contarPorChave(rncs ?? [], (r) => r.severidade);

  const osEmAndamento = (osList ?? []).filter((os) => os.status !== "CONCLUIDA").length;
  const osConcluidas = (osList ?? []).filter((os) => os.status === "CONCLUIDA").length;
  const osPorStatus = contarPorChave(osList ?? [], (os) => os.status);

  function exportarMonitoramentos() {
    const csv = linhasParaCsv<MonitoramentoResumo & { situacao: string }>(
      [
        { chave: "id", rotulo: "ID" },
        { chave: "setor", rotulo: "Setor" },
        { chave: "situacao", rotulo: "Situação" },
        { chave: "criado_em", rotulo: "Criado em" },
        { chave: "verificado_em", rotulo: "Verificado em" },
        { chave: "liberado_sif", rotulo: "Liberado ao SIF" },
        { chave: "liberado_em", rotulo: "Liberado em" },
      ],
      (monitoramentos ?? []).map((m) => ({ ...m, situacao: rotuloSituacao(m) }))
    );
    baixarCsv(`monitoramentos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function exportarRnc() {
    const csv = linhasParaCsv<RncResumo>(
      [
        { chave: "id", rotulo: "ID" },
        { chave: "setor", rotulo: "Setor" },
        { chave: "severidade", rotulo: "Severidade" },
        { chave: "status", rotulo: "Status" },
        { chave: "criado_em", rotulo: "Criado em" },
        { chave: "prazo_sla", rotulo: "Prazo SLA" },
        { chave: "fechado_em", rotulo: "Fechado em" },
      ],
      rncs ?? []
    );
    baixarCsv(`rnc-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function exportarOs() {
    const csv = linhasParaCsv<OsResumo>(
      [
        { chave: "id", rotulo: "ID" },
        { chave: "setor", rotulo: "Setor" },
        { chave: "descricao", rotulo: "Descrição" },
        { chave: "status", rotulo: "Status" },
        { chave: "criado_em", rotulo: "Criado em" },
        { chave: "concluido_em", rotulo: "Concluído em" },
        { chave: "liberado_sif", rotulo: "Liberado ao SIF" },
        { chave: "liberado_em", rotulo: "Liberado em" },
      ],
      osList ?? []
    );
    baixarCsv(`ordens-servico-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const carregando = carregandoMonitoramentos || carregandoRnc || carregandoOs;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Monitoramentos dos últimos 30 dias; RNC e Ordens de Serviço sem corte de data. Cada
        seção mostra só o que seu perfil já pode ver nas telas correspondentes.
      </p>

      {carregando && <p className="text-muted-foreground">Carregando…</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Monitoramentos (30 dias)</h2>
          <Button variant="outline" size="sm" onClick={exportarMonitoramentos} disabled={!monitoramentos?.length}>
            Exportar CSV
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CartaoKpi titulo="Total" valor={monitoramentos?.length ?? 0} />
          <CartaoKpi titulo="Conformes" valor={conformes} />
          <CartaoKpi titulo="Tratados (RNC procedente)" valor={tratados} />
          <CartaoKpi titulo="Não conformes" valor={naoConformes} />
          <CartaoKpi titulo="Pendentes verificação" valor={pendentesVerificacao} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">RNC — por severidade</h2>
          <Button variant="outline" size="sm" onClick={exportarRnc} disabled={!rncs?.length}>
            Exportar CSV
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CartaoKpi titulo="Abertas" valor={rncsAbertas} />
          <CartaoKpi titulo="SLA vencido" valor={rncsSlaVencido} />
          <CartaoKpi titulo="Total" valor={rncs?.length ?? 0} />
          <CartaoKpi titulo="Fechadas" valor={(rncs ?? []).filter((r) => r.status === "FECHADA").length} />
        </div>
        <Card className="glass-panel rounded-xl border-white/70">
          <CardContent className="pt-6">
            <GraficoBarras dados={rncsPorSeveridade} cores={[COR_DOWN, COR_WARNING, COR_NAVY, COR_NEUTRO]} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Ordens de Serviço — por status</h2>
          <Button variant="outline" size="sm" onClick={exportarOs} disabled={!osList?.length}>
            Exportar CSV
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CartaoKpi titulo="Em andamento" valor={osEmAndamento} />
          <CartaoKpi titulo="Concluídas" valor={osConcluidas} />
          <CartaoKpi titulo="Total" valor={osList?.length ?? 0} />
          <CartaoKpi titulo="Liberadas ao SIF" valor={(osList ?? []).filter((os) => os.liberado_sif).length} />
        </div>
        <Card className="glass-panel rounded-xl border-white/70">
          <CardContent className="pt-6">
            <GraficoBarras dados={osPorStatus} cores={[COR_NAVY, COR_LIMA, COR_WARNING, COR_DOWN, COR_NEUTRO]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type AbaBi = "visao-geral" | "consumo-agua";

interface DefinicaoAba {
  id: AbaBi;
  rotulo: string;
  /** Perfis que veem a aba; ausente = todos os que chegam ao painel. */
  perfis?: string[];
}

// Novas métricas do BI entram aqui como novas abas (uma por assunto).
const ABAS: DefinicaoAba[] = [
  { id: "visao-geral", rotulo: "Visão geral" },
  // Os monitoramentos de água são das fichas do pré-resfriamento — não fazem parte do que o Inspetor PCM enxerga.
  { id: "consumo-agua", rotulo: "Consumo de água", perfis: ["ADMIN_MASTER", "GESTOR_SETOR"] },
];

/** Painel de BI (seção 7.7) — uma aba por assunto/métrica. Todas leem só o que a RLS já permite ao usuário ver
 * nas telas correspondentes; nenhuma permissão nova. */
export function DashboardPage() {
  const nivel = useSessionStore((s) => s.perfil?.nivelAcesso);
  const abas = ABAS.filter((a) => !a.perfis || (nivel !== undefined && a.perfis.includes(nivel)));
  const [abaEscolhida, setAbaEscolhida] = useState<AbaBi>("visao-geral");
  const aba = abas.find((a) => a.id === abaEscolhida)?.id ?? "visao-geral";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel de BI</h1>
        <p className="text-sm text-muted-foreground">Indicadores gerenciais do GloboPac, uma aba por assunto.</p>
      </div>

      {abas.length > 1 && (
        <div role="tablist" aria-label="Métricas do Painel de BI" className="flex flex-wrap gap-1 border-b">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-bi-${a.id}`}
              aria-selected={a.id === aba}
              aria-controls={`painel-bi-${a.id}`}
              onClick={() => setAbaEscolhida(a.id)}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                a.id === aba ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel" id={`painel-bi-${aba}`} aria-labelledby={`aba-bi-${aba}`}>
        {aba === "consumo-agua" ? <ConsumoAguaTab /> : <VisaoGeralTab />}
      </div>
    </div>
  );
}
