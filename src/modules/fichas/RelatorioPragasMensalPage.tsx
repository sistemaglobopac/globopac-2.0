import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { useFichasTemplatesTodas } from "./api";
import {
  consolidarPragasMes,
  diasNoMes,
  MEDIDAS_CORRETIVAS,
  PRAGAS,
  type RegistroPragaDia,
} from "./fields/pragas";
import type { OcorrenciaPragasValor } from "./fields/tiposCompostos";
import { ensureLocalTime } from "./utils/tempo";
import { imprimirElemento } from "./utils/printHelper";

const RAZAO_SOCIAL = "KAEFER AGRO INDUSTRIAL LTDA. - SIF1606";
const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function mesAtualManaus(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Manaus" })
    .slice(0, 7);
}

interface LinhaBruta {
  id: string;
  setor: string;
  criado_em: string;
  dados_dinamicos: Record<string, unknown>;
}

/** Monitoramentos do mês (fuso de Manaus, UTC−4) de todas as versões do template escolhido. */
function useRegistrosPragasMes(
  templateIds: string[],
  ano: number,
  mes: number,
) {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-04:00`;
  const proximo =
    mes === 12
      ? `${ano + 1}-01-01T00:00:00-04:00`
      : `${ano}-${String(mes + 1).padStart(2, "0")}-01T00:00:00-04:00`;
  return useQuery({
    queryKey: ["pragas-mensal", templateIds.join(","), ano, mes],
    enabled: templateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitoramentos")
        .select("id, setor, criado_em, dados_dinamicos")
        .in("ficha_template_id", templateIds)
        .gte("criado_em", inicio)
        .lt("criado_em", proximo)
        .order("criado_em", { ascending: true })
        .overrideTypes<LinhaBruta[], { merge: false }>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

function RelatorioSetor({
  tipo,
  setor,
  registros,
  ano,
  mes,
}: {
  tipo: { codigo: string; nome: string };
  setor: string;
  registros: RegistroPragaDia[];
  ano: number;
  mes: number;
}) {
  const consolidado = useMemo(
    () => consolidarPragasMes(registros, ano, mes),
    [registros, ano, mes],
  );
  const totalDias = diasNoMes(ano, mes);
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1);
  const diasComPraga = [
    ...new Set(consolidado.ocorrencias.map((o) => Number(o.dia.slice(8, 10)))),
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4 [break-after:page] last:[break-after:auto] print:border-0 print:p-0">
      <div className="border-b pb-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground print:text-[9px]">
          {RAZAO_SOCIAL}
        </p>
        <h1 className="text-lg font-extrabold print:text-sm">
          Relatório Mensal de Ocorrência de Pragas — {setor} —{" "}
          {NOMES_MES[mes - 1]}/{ano}
        </h1>
        <p className="text-xs text-muted-foreground print:text-[9px]">
          {tipo.nome} ({tipo.codigo}) · {setor} ·{" "}
          {consolidado.diasMonitorados.length} de {totalDias} dia(s) com
          registro
        </p>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-center text-[11px] print:text-[8px]"
          data-testid="tabela-pragas"
        >
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-2 py-1 text-left">Praga</th>
              {dias.map((d) => (
                <th key={d} className="w-7 border px-0.5 py-1 print:w-5">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRAGAS.map((praga) => (
              <tr key={praga.chave}>
                <td className="whitespace-nowrap border px-2 py-0.5 text-left font-medium">
                  {praga.rotulo}
                </td>
                {dias.map((d) => {
                  const status = consolidado.statusPorDia[d];
                  const presente =
                    consolidado.presencaPorPraga[praga.chave]?.[d];
                  return (
                    <td
                      key={d}
                      className={`border px-0.5 py-0.5 font-bold ${
                        status === "sem-registro"
                          ? "bg-muted/30 text-muted-foreground"
                          : presente
                            ? "bg-down-soft text-down"
                            : "text-success"
                      }`}
                    >
                      {status === "sem-registro" ? "" : presente ? "P" : "A"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-muted/60 font-bold">
              <td className="border px-2 py-0.5 text-left">Situação do dia</td>
              {dias.map((d) => {
                const status = consolidado.statusPorDia[d];
                return (
                  <td
                    key={d}
                    className={`border px-0.5 py-0.5 ${status === "presente" ? "text-down" : status === "ausente" ? "text-success" : "text-muted-foreground"}`}
                  >
                    {status === "presente"
                      ? "P"
                      : status === "ausente"
                        ? "A"
                        : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground print:text-[8px]">
        <strong>P</strong> = presença de praga · <strong>A</strong> = ausência
        de praga · célula em branco / — = sem registro no dia (o monitoramento é
        obrigatório todos os dias).
        {consolidado.diasSemRegistro.length > 0 && (
          <> Dias sem registro: {consolidado.diasSemRegistro.join(", ")}.</>
        )}
      </p>

      {consolidado.houvePragaNoMes ? (
        <div
          className="space-y-2 rounded-md border-2 border-down/40 p-3 print:p-2"
          data-testid="medidas-corretivas"
        >
          <p className="text-sm font-bold uppercase text-down print:text-[10px]">
            Houve presença de pragas em {diasComPraga.length} dia(s) do mês —
            medidas corretivas adotadas
          </p>
          <p className="text-xs print:text-[9px]">{MEDIDAS_CORRETIVAS}</p>
          <table className="max-sm:block max-sm:overflow-x-auto w-full border-collapse text-left text-[11px] print:text-[8px]">
            <thead>
              <tr className="bg-muted/60">
                <th className="border px-2 py-0.5">Data</th>
                <th className="border px-2 py-0.5">Setor</th>
                <th className="border px-2 py-0.5">Praga</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.ocorrencias.map((o, i) => (
                <tr key={`${o.dia}-${o.praga}-${o.setor}-${i}`}>
                  <td className="border px-2 py-0.5">
                    {o.dia.split("-").reverse().join("/")}
                  </td>
                  <td className="border px-2 py-0.5">{o.setor}</td>
                  <td className="border px-2 py-0.5">{o.rotulo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        consolidado.diasMonitorados.length > 0 && (
          <p className="rounded-md border border-success/40 bg-success/10 p-2 text-xs font-medium text-success print:text-[9px]">
            Não houve presença de pragas nos dias monitorados do mês.
          </p>
        )
      )}
    </div>
  );
}

/** Relatório mensal consolidado de ocorrência de pragas (VERIFICADOR / ADMIN_MASTER): uma tabela
 * numa só página com praga × dia (P = presença, A = ausência, vazio = sem registro). Se houve
 * praga em pelo menos um dia, as medidas corretivas constam expressamente no relatório. */
export function RelatorioPragasMensalPage() {
  const { data: templates, isLoading: carregandoTemplates } =
    useFichasTemplatesTodas();
  const [mesEscolhido, setMesEscolhido] = useState(mesAtualManaus);
  const [codigo, setCodigo] = useState("");
  const [setor, setSetor] = useState("");

  // Um "tipo" por código: as versões (V2, V3…) do mesmo template entram juntas.
  const tiposPragas = useMemo(() => {
    const porCodigo = new Map<
      string,
      { codigo: string; nome: string; ids: string[] }
    >();
    for (const t of templates ?? []) {
      const campo = t.schema_campos.find((c) => c.tipo === "ocorrencia_pragas");
      if (!campo) continue;
      const base = t.codigo.replace(/\s*V\d+\s*$/i, "").trim() || t.codigo;
      const atual = porCodigo.get(base) ?? {
        codigo: base,
        nome: t.nome,
        ids: [] as string[],
      };
      atual.ids.push(t.id);
      porCodigo.set(base, atual);
    }
    return [...porCodigo.values()];
  }, [templates]);

  const tipo = tiposPragas.find((t) => t.codigo === codigo) ?? tiposPragas[0];
  const [ano, mes] = mesEscolhido.split("-").map(Number) as [number, number];
  const {
    data: linhas,
    isLoading,
    isError,
  } = useRegistrosPragasMes(tipo?.ids ?? [], ano, mes);

  const setores = useMemo(
    () => [...new Set((linhas ?? []).map((l) => l.setor))].sort(),
    [linhas],
  );

  // Um relatório POR SETOR: "Todos" gera um relatório (uma página) para cada setor.
  const registrosPorSetor = useMemo(() => {
    const mapa = new Map<string, RegistroPragaDia[]>();
    for (const l of linhas ?? []) {
      if (setor && l.setor !== setor) continue;
      if (!mapa.has(l.setor)) mapa.set(l.setor, []);
      mapa.get(l.setor)!.push({
        dia: ensureLocalTime(l.criado_em).isoLocal,
        setor: l.setor,
        // Cada versão do template guarda o valor na sua própria chave de campo.
        valor: (Object.values(l.dados_dinamicos).find(
          (v) =>
            v &&
            typeof v === "object" &&
            "pragas" in (v as object) &&
            "houvePraga" in (v as object),
        ) ?? null) as OcorrenciaPragasValor | null,
      });
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [linhas, setor]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <style>
        {"@media print { @page { size: A4 landscape; margin: 8mm; } }"}
      </style>

      <div className="gs-no-print">
        <Button asChild variant="outline" size="sm">
          <Link to="/gestao">
            <ArrowLeft className="h-4 w-4" /> Painel de Gestão
          </Link>
        </Button>
      </div>

      <div className="gs-no-print flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="mes-pragas">Mês</Label>
          <input
            id="mes-pragas"
            type="month"
            value={mesEscolhido}
            onChange={(e) => e.target.value && setMesEscolhido(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        {tiposPragas.length > 1 && (
          <div className="space-y-1">
            <Label>Ficha</Label>
            <Select
              value={tipo?.codigo ?? ""}
              onChange={(e) => setCodigo(e.target.value)}
            >
              {tiposPragas.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.codigo} — {t.nome}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label>Setor</Label>
          <Select value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos (um relatório por setor)</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="accent"
          onClick={() => imprimirElemento()}
          disabled={!tipo || isLoading}
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      {carregandoTemplates && (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      )}
      {!carregandoTemplates && !tipo && (
        <p className="rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Nenhuma ficha com o campo "Ocorrência Diária de Pragas" foi criada
          ainda. Crie-a no Construtor de Fichas (frequência Diário).
        </p>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando registros…
        </div>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          Falha ao carregar os registros do mês.
        </p>
      )}

      {tipo && !isLoading && !isError && registrosPorSetor.length === 0 && (
        <p className="rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          Nenhum registro neste mês.
        </p>
      )}
      {tipo && !isLoading && !isError && (
        <div id="relatorio-impressao" className="space-y-6 print:space-y-0">
          {registrosPorSetor.map(([nomeSetor, registros]) => (
            <RelatorioSetor
              key={nomeSetor}
              tipo={tipo}
              setor={nomeSetor}
              registros={registros}
              ano={ano}
              mes={mes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
