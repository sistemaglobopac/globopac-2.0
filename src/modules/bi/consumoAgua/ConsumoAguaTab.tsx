import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { baixarCsv, linhasParaCsv } from "@/lib/csv";
import { dataManaus } from "@/modules/fichas/utils/horaMonitoramento";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { CartaoKpi } from "../CartaoKpi";
import { COR_AGUA, COR_LIMA, COR_NAVY, COR_WARNING } from "../cores";
import { useRegistrosAgua } from "./api";
import {
  agregar,
  calcularEventos,
  INTERVALO_MAXIMO_HORAS,
  PONTOS_AGUA,
  SISTEMAS_AGUA,
  type Granularidade,
  type PontoAgua,
  type SistemaAgua,
} from "./calculo";

type Unidade = "m3" | "L";
type Preset = "hoje" | "7d" | "30d" | "mes" | "personalizado";

const MS_DIA = 24 * 3_600_000;
const LIMITE_DIAS_POR_HORA = 31;
const COR_SISTEMA: Record<SistemaAgua, string> = { carcacas: COR_NAVY, partes: COR_LIMA, miudos: COR_WARNING, chuveiro: COR_AGUA };
const ORDEM_SISTEMAS = Object.keys(SISTEMAS_AGUA) as SistemaAgua[];

const PRESETS: { valor: Preset; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "personalizado", rotulo: "Personalizado" },
];
const GRANULARIDADES: { valor: Granularidade; rotulo: string }[] = [
  { valor: "hora", rotulo: "Hora" },
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * MS_DIA).toISOString().slice(0, 10);
}

function intervaloDoPreset(preset: Exclude<Preset, "personalizado">, hoje: string): { de: string; ate: string } {
  if (preset === "hoje") return { de: hoje, ate: hoje };
  if (preset === "7d") return { de: somarDias(hoje, -6), ate: hoje };
  if (preset === "30d") return { de: somarDias(hoje, -29), ate: hoje };
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

function nomeDoPonto(p: PontoAgua): string {
  return p.sistema === "chuveiro" ? p.rotulo : `${SISTEMAS_AGUA[p.sistema].rotulo} · ${p.rotulo}`;
}

function Segmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={rotulo}>
        {opcoes.map((o) => (
          <Button key={o.valor} type="button" size="sm" variant={o.valor === valor ? "default" : "outline"} aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
            {o.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Aba "Consumo de água" do Painel de BI: água (hidrômetro, SEM gelo) de cada chiller/tanque do pré-resfriamento e do chuveiro final, por
 * hora, dia, semana e mês, com o total dos chillers somados. Regras de cálculo em consumoAgua/calculo.ts. */
export function ConsumoAguaTab() {
  const hoje = dataManaus(new Date());
  const [preset, setPreset] = useState<Preset>("7d");
  const [intervalo, setIntervalo] = useState(() => intervaloDoPreset("7d", hoje));
  const [granularidade, setGranularidade] = useState<Granularidade>("dia");
  const [unidade, setUnidade] = useState<Unidade>("m3");

  const periodoValido = /^\d{4}-\d{2}-\d{2}$/.test(intervalo.de) && /^\d{4}-\d{2}-\d{2}$/.test(intervalo.ate) && intervalo.de <= intervalo.ate;
  // Manaus é UTC−4 fixo; o fim é exclusivo (dia seguinte, 00h) para incluir o último dia inteiro.
  const deMs = Date.parse(`${intervalo.de}T00:00:00-04:00`);
  const ateMs = Date.parse(`${intervalo.ate}T00:00:00-04:00`) + MS_DIA;
  const dias = periodoValido ? Math.round((ateMs - deMs) / MS_DIA) : 0;
  const horaMuitoLonga = granularidade === "hora" && dias > LIMITE_DIAS_POR_HORA;

  const { dados, carregando, erro } = useRegistrosAgua(deMs, ateMs, periodoValido);
  const eventos = useMemo(() => (dados ? calcularEventos(dados.registros, dados.templates) : null), [dados]);
  const resultado = useMemo(
    () => (eventos && periodoValido && !horaMuitoLonga ? agregar(eventos.eventos, granularidade, deMs, ateMs, eventos.descartadasEm) : null),
    [eventos, granularidade, deMs, ateMs, periodoValido, horaMuitoLonga]
  );

  const fator = unidade === "m3" ? 1 : 1000;
  const sufixo = unidade === "m3" ? "m³" : "L";
  const fmt = (m3: number) =>
    unidade === "m3"
      ? m3.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : Math.round(m3 * fator).toLocaleString("pt-BR");
  const fmtCelula = (m3: number) => (m3 === 0 ? "–" : fmt(m3));

  function escolherPreset(novo: Preset) {
    setPreset(novo);
    if (novo !== "personalizado") setIntervalo(intervaloDoPreset(novo, hoje));
  }

  const dadosGrafico = useMemo(
    () =>
      (resultado?.buckets ?? []).map((b) => ({
        rotulo: b.rotulo,
        ...Object.fromEntries(ORDEM_SISTEMAS.map((s) => [SISTEMAS_AGUA[s].rotulo, b.porSistema[s] * fator])),
      })),
    [resultado, fator]
  );
  const dadosRanking = useMemo(
    () =>
      PONTOS_AGUA.map((p) => ({ rotulo: nomeDoPonto(p), valor: (resultado?.totaisPorPonto[p.id] ?? 0) * fator, cor: COR_SISTEMA[p.sistema] })).sort(
        (a, b) => b.valor - a.valor
      ),
    [resultado, fator]
  );

  function exportarCsv() {
    if (!resultado) return;
    type Linha = Record<string, string | number>;
    const numero = (m3: number) =>
      unidade === "m3" ? m3.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false }) : String(Math.round(m3 * fator));
    const colunas: { chave: string; rotulo: string }[] = [
      { chave: "periodo", rotulo: "Período" },
      ...PONTOS_AGUA.map((p) => ({ chave: p.id, rotulo: `${nomeDoPonto(p)} (${sufixo})` })),
      { chave: "chillers", rotulo: `Total chillers (${sufixo})` },
      { chave: "total", rotulo: `Total geral (${sufixo})` },
    ];
    const linhas: Linha[] = resultado.buckets.map((b) => ({
      periodo: b.rotulo,
      ...Object.fromEntries(PONTOS_AGUA.map((p) => [p.id, numero(b.porPonto[p.id] ?? 0)])),
      chillers: numero(b.chillers),
      total: numero(b.total),
    }));
    linhas.push({
      periodo: "TOTAL",
      ...Object.fromEntries(PONTOS_AGUA.map((p) => [p.id, numero(resultado.totaisPorPonto[p.id] ?? 0)])),
      chillers: numero(resultado.chillers),
      total: numero(resultado.total),
    });
    baixarCsv(`consumo-agua-${granularidade}-${intervalo.de}-a-${intervalo.ate}.csv`, linhasParaCsv<Linha>(colunas, linhas));
  }

  const mediaDia = resultado && resultado.diasComConsumo > 0 ? resultado.total / resultado.diasComConsumo : 0;
  const semDados = !!resultado && resultado.leituras === 0;

  return (
    <div className="space-y-6">
      <Card className="glass-panel rounded-xl border-white/70">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <Segmentado rotulo="Período" opcoes={PRESETS} valor={preset} onChange={escolherPreset} />
            {preset === "personalizado" && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  De
                  <Input type="date" className="w-40" value={intervalo.de} max={hoje} onChange={(e) => setIntervalo((i) => ({ ...i, de: e.target.value }))} />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Até
                  <Input type="date" className="w-40" value={intervalo.ate} max={hoje} onChange={(e) => setIntervalo((i) => ({ ...i, ate: e.target.value }))} />
                </label>
              </div>
            )}
            <Segmentado rotulo="Agrupar por" opcoes={GRANULARIDADES} valor={granularidade} onChange={setGranularidade} />
            <Segmentado
              rotulo="Unidade"
              opcoes={[
                { valor: "m3", rotulo: "m³" },
                { valor: "L", rotulo: "Litros" },
              ]}
              valor={unidade}
              onChange={setUnidade}
            />
          </div>
          {!periodoValido && <p className="text-sm text-destructive">Informe um período válido (a data inicial não pode ser depois da final).</p>}
          {horaMuitoLonga && <p className="text-sm text-destructive">Para ver hora a hora, escolha um período de até {LIMITE_DIAS_POR_HORA} dias.</p>}
        </CardContent>
      </Card>

      {carregando && <p className="text-muted-foreground">Carregando…</p>}
      {erro && <p className="text-destructive">Não foi possível carregar o consumo de água: {erro.message}</p>}

      {resultado && !semDados && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <CartaoKpi titulo="Consumo total (chillers + chuveiro)" valor={`${fmt(resultado.total)} ${sufixo}`} />
            <CartaoKpi titulo="Total dos chillers somados" valor={`${fmt(resultado.chillers)} ${sufixo}`} />
            <CartaoKpi titulo="Chuveiro Final" valor={`${fmt(resultado.chuveiro)} ${sufixo}`} />
            <CartaoKpi titulo="Média por dia com consumo" valor={`${fmt(mediaDia)} ${sufixo}`} detalhe={`${resultado.diasComConsumo} dia(s) com leitura`} />
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ORDEM_SISTEMAS.map((s) => (
              <CartaoKpi key={s} titulo={SISTEMAS_AGUA[s].rotulo} valor={`${fmt(resultado.totaisPorSistema[s])} ${sufixo}`} />
            ))}
          </div>

          <Card className="glass-panel rounded-xl border-white/70">
            <CardHeader>
              <CardTitle className="text-base">Consumo por {GRANULARIDADES.find((g) => g.valor === granularidade)?.rotulo.toLowerCase()} ({sufixo})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dadosGrafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" fontSize={11} minTickGap={16} />
                  <YAxis fontSize={12} width={64} tickFormatter={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
                  <Tooltip formatter={(v: number) => `${fmt(v / fator)} ${sufixo}`} />
                  <Legend />
                  {ORDEM_SISTEMAS.map((s) => (
                    <Bar key={s} dataKey={SISTEMAS_AGUA[s].rotulo} stackId="agua" fill={COR_SISTEMA[s]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-xl border-white/70">
            <CardHeader>
              <CardTitle className="text-base">Consumo por chiller no período ({sufixo})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={PONTOS_AGUA.length * 30 + 30}>
                <BarChart data={dadosRanking} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={12} tickFormatter={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
                  <YAxis type="category" dataKey="rotulo" fontSize={12} width={200} />
                  <Tooltip formatter={(v: number) => `${fmt(v / fator)} ${sufixo}`} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {dadosRanking.map((d) => (
                      <Cell key={d.rotulo} fill={d.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-panel rounded-xl border-white/70">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Tabela de consumo ({sufixo})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportarCsv}>
                Exportar CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-h-[32rem] overflow-auto rounded-md border">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                  <thead className="bg-muted/60 text-xs">
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-[1] bg-muted px-3 py-2 text-left font-semibold">
                        Período
                      </th>
                      {ORDEM_SISTEMAS.map((s) => {
                        const pontos = PONTOS_AGUA.filter((p) => p.sistema === s);
                        const sozinho = pontos.length === 1;
                        return (
                          <th key={s} colSpan={pontos.length} rowSpan={sozinho ? 2 : 1} className="border-l px-3 py-2 text-center font-semibold">
                            {SISTEMAS_AGUA[s].rotulo}
                          </th>
                        );
                      })}
                      <th rowSpan={2} className="border-l px-3 py-2 text-right font-semibold">
                        Total chillers
                      </th>
                      <th rowSpan={2} className="border-l px-3 py-2 text-right font-semibold">
                        Total geral
                      </th>
                    </tr>
                    <tr>
                      {PONTOS_AGUA.filter((p) => PONTOS_AGUA.filter((q) => q.sistema === p.sistema).length > 1).map((p) => (
                        <th key={p.id} className="border-l px-3 py-1 text-right font-medium text-muted-foreground">
                          {p.rotulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px] tabular-nums">
                    {resultado.buckets.map((b) => (
                      <tr key={b.inicio} className="border-t">
                        <th scope="row" className="sticky left-0 z-[1] whitespace-nowrap bg-background px-3 py-1.5 text-left font-sans font-medium">
                          {b.rotulo}
                        </th>
                        {PONTOS_AGUA.map((p) => (
                          <td key={p.id} className="border-l px-3 py-1.5 text-right">
                            {fmtCelula(b.porPonto[p.id] ?? 0)}
                          </td>
                        ))}
                        <td className="border-l px-3 py-1.5 text-right font-semibold">{fmtCelula(b.chillers)}</td>
                        <td className="border-l px-3 py-1.5 text-right font-semibold">{fmtCelula(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-muted/40 font-mono text-[13px] font-semibold tabular-nums">
                    <tr>
                      <th scope="row" className="sticky left-0 z-[1] bg-muted px-3 py-2 text-left font-sans">
                        Total
                      </th>
                      {PONTOS_AGUA.map((p) => (
                        <td key={p.id} className="border-l px-3 py-2 text-right">
                          {fmtCelula(resultado.totaisPorPonto[p.id] ?? 0)}
                        </td>
                      ))}
                      <td className="border-l px-3 py-2 text-right">{fmtCelula(resultado.chillers)}</td>
                      <td className="border-l px-3 py-2 text-right">{fmtCelula(resultado.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {semDados && <p className="py-8 text-center text-sm text-muted-foreground">Sem leituras de hidrômetro apuradas no período.</p>}

      <Card className="glass-panel rounded-xl border-white/70">
        <CardHeader>
          <CardTitle className="text-base">Como o consumo é calculado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>
            • <strong>Só água:</strong> leitura atual − leitura anterior do hidrômetro de cada tanque nos monitoramentos de renovação da água. O
            gelo adicionado <strong>não</strong> entra.
          </p>
          <p>
            • <strong>Total dos chillers:</strong> pré-chiller e chillers 01/02 de Carcaças, chillers 01/02 de Partes e os 5 mini-chillers de
            Miúdos. O Chuveiro Final aparece separado e entra no total geral.
          </p>
          <p>
            • <strong>Por hora:</strong> o hidrômetro é lido a cada monitoramento; o volume entre duas leituras é distribuído proporcionalmente nas
            horas do intervalo (horário de Manaus). O 1º monitoramento do dia não tem leitura anterior e não gera consumo.
          </p>
          <p>• Registros corrigidos por aditivo contam uma só vez (vale a versão corrigida).</p>
          {resultado && resultado.leiturasSemIntervalo > 0 && (
            <p className="text-warning">
              • {resultado.leiturasSemIntervalo} leitura(s) sem leitura anterior nas últimas {INTERVALO_MAXIMO_HORAS} h tiveram o volume lançado na hora da própria leitura.
            </p>
          )}
          {resultado && resultado.descartadas > 0 && (
            <p className="text-destructive">• {resultado.descartadas} leitura(s) com valor menor que o anterior foram desconsideradas (possível erro de digitação).</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
