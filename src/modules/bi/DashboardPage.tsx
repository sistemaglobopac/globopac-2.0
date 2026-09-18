import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMonitoramentosResumo, useOsResumo, useRncResumo, type MonitoramentoResumo, type OsResumo, type RncResumo } from "./api";
import { baixarCsv, linhasParaCsv } from "@/lib/csv";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

// Cores literais do design system GloboPac v1.0 (mesmos valores de tailwind.config.ts) —
// recharts não consome classes Tailwind, só valores de cor diretos.
const COR_NAVY = "#002060";
const COR_LIMA = "#8fb524"; // lima escurecido p/ contraste em texto/gráfico sobre fundo claro
const COR_DOWN = "#cf202f";
const COR_WARNING = "hsl(38, 92%, 45%)";
const COR_NEUTRO = "#a4a9b2";

function contarPorChave<T>(linhas: T[], chave: (item: T) => string): { rotulo: string; valor: number }[] {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const k = chave(linha);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return Array.from(contagem.entries()).map(([rotulo, valor]) => ({ rotulo, valor }));
}

function CartaoKpi({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <Card className="glass-kpi rounded-xl border-white/65 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-normal text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="font-mono text-[26px] font-medium leading-tight text-ink">{valor}</CardContent>
    </Card>
  );
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

/** Painel de BI (seção 7.7) — KPIs e gráficos agregados sobre os mesmos dados que RLS já
 * permite ao usuário ver em outras telas (monitoramentos, RNC, OS): ADMIN_MASTER vê tudo,
 * GESTOR_SETOR só o próprio setor, INSPETOR_PCM só OS. Nenhuma permissão nova — agregação é
 * só uma projeção do que a tela já mostraria em detalhe. */
export function DashboardPage() {
  const { data: monitoramentos, isLoading: carregandoMonitoramentos } = useMonitoramentosResumo();
  const { data: rncs, isLoading: carregandoRnc } = useRncResumo();
  const { data: osList, isLoading: carregandoOs } = useOsResumo();

  const conformes = (monitoramentos ?? []).filter((m) => m.conformidade === true).length;
  const naoConformes = (monitoramentos ?? []).filter((m) => m.conformidade === false).length;
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
    const csv = linhasParaCsv<MonitoramentoResumo>(
      [
        { chave: "id", rotulo: "ID" },
        { chave: "setor", rotulo: "Setor" },
        { chave: "conformidade", rotulo: "Conforme" },
        { chave: "criado_em", rotulo: "Criado em" },
        { chave: "verificado_em", rotulo: "Verificado em" },
        { chave: "liberado_sif", rotulo: "Liberado ao SIF" },
        { chave: "liberado_em", rotulo: "Liberado em" },
      ],
      monitoramentos ?? []
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Painel gerencial</h1>
        <p className="text-sm text-muted-foreground">
          Monitoramentos dos últimos 30 dias; RNC e Ordens de Serviço sem corte de data. Cada
          seção mostra só o que seu perfil já pode ver nas telas correspondentes.
        </p>
      </div>

      {carregando && <p className="text-muted-foreground">Carregando…</p>}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Monitoramentos (30 dias)</h2>
          <Button variant="outline" size="sm" onClick={exportarMonitoramentos} disabled={!monitoramentos?.length}>
            Exportar CSV
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <CartaoKpi titulo="Total" valor={monitoramentos?.length ?? 0} />
          <CartaoKpi titulo="Conformes" valor={conformes} />
          <CartaoKpi titulo="Não conformes" valor={naoConformes} />
          <CartaoKpi titulo="Pendentes verificação" valor={pendentesVerificacao} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
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
        <div className="flex items-center justify-between">
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
