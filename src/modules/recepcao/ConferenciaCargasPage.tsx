import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { formatarDataHora } from "@/modules/fichas/fields/recepcaoAves";
import { formatarPctDoa } from "@/modules/fichas/fields/rastreabilidadeDoa";
import { useCargasJaMonitoradas, useCargasRastreabilidade, useDoaCargasRegistradas } from "./api";
import { montarConferencia, resumirConferencia } from "./conferenciaCargas";

function Selo({ feito, rotulo }: { feito: boolean; rotulo: string }) {
  return feito ? (
    <Badge className="border-transparent bg-success/15 text-success">
      <CheckCircle2 className="mr-1 h-3 w-3" /> {rotulo}
    </Badge>
  ) : (
    <Badge variant="warning">
      <Clock className="mr-1 h-3 w-3" /> Falta
    </Badge>
  );
}

/** Conferência do dia: todas as cargas programadas, com o que já foi feito em Recepção de Aves (transporte e jejum),
 * Peso por Caixa (densidade) e DOA — e o que falta de cada uma. */
export function ConferenciaCargasPage() {
  const [params] = useSearchParams();
  const hoje = ensureLocalTime(new Date().toISOString()).isoLocal;
  const [dia, setDia] = useState(params.get("data") ?? hoje);
  const [soPendencias, setSoPendencias] = useState(false);

  const { data: cargas, isLoading, isError } = useCargasRastreabilidade(dia);
  const { data: recepcaoIds } = useCargasJaMonitoradas("recepcao");
  const { data: pesoIds } = useCargasJaMonitoradas("peso");
  const { data: doaRegistradas } = useDoaCargasRegistradas(dia);

  const linhas = useMemo(
    () => montarConferencia(cargas ?? [], recepcaoIds ?? new Set(), pesoIds ?? new Set(), new Map((doaRegistradas ?? []).map((c) => [c.cargaId, c]))),
    [cargas, recepcaoIds, pesoIds, doaRegistradas]
  );
  const resumo = resumirConferencia(linhas);
  const visiveis = soPendencias ? linhas.filter((l) => l.faltas.length > 0) : linhas;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10" data-testid="conferencia-cargas">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Conferência das Cargas do Dia</h1>
            <p className="text-sm text-muted-foreground">Recepção de Aves · Peso por Caixa · DOA — carga a carga</p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="conf-data">Data do abate</Label>
            <Input id="conf-data" type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={soPendencias} onChange={(e) => setSoPendencias(e.target.checked)} />
            Só com pendências
          </label>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Cargas programadas", resumo.total, "total"],
            ["Completas", resumo.completas, "completas"],
            ["Com pendência", resumo.comPendencia, "pendencia"],
            ["Sem peso médio", resumo.semPesoMedio, "sem-peso"],
          ] as const
        ).map(([rotulo, valor, id]) => (
          <div key={id} className="rounded-lg border bg-card p-3">
            <p className="text-xs uppercase text-muted-foreground">{rotulo}</p>
            <p className="text-2xl font-black" data-testid={`resumo-${id}`}>
              {valor}
            </p>
          </div>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {isError && <p className="text-sm text-destructive">Não foi possível carregar as cargas (sem conexão?).</p>}
      {!isLoading && !isError && linhas.length === 0 && (
        <p className="rounded-lg border bg-muted/40 p-6 text-center text-sm text-muted-foreground">Nenhuma carga programada para esta data.</p>
      )}

      {visiveis.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-2">GTA / Carga</th>
                <th className="p-2">Previstas</th>
                <th className="p-2">Recepção (transporte e jejum)</th>
                <th className="p-2">Início da pendura</th>
                <th className="p-2">Peso por caixa</th>
                <th className="p-2">Peso médio (kg)</th>
                <th className="p-2">DOA</th>
                <th className="p-2">O que falta</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.cargaId} className={`border-b align-top ${l.faltas.length > 0 ? "" : "bg-success/5"}`} data-testid={`conf-${l.gta}`}>
                  <td className="p-2">
                    <strong>GTA {l.gta}</strong>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {l.integrado} · Aviário {l.aviario}
                      {l.nucleo ? ` · Núcleo ${l.nucleo}` : ""}
                      {l.placa ? ` · ${l.placa}` : ""}
                    </span>
                  </td>
                  <td className="p-2">{l.qtdPrevista.toLocaleString("pt-BR")}</td>
                  <td className="p-2">
                    <Selo feito={l.recepcaoFeita} rotulo="Feita" />
                  </td>
                  <td className="p-2">{formatarDataHora(l.penduraInicioEm)}</td>
                  <td className="p-2">
                    <Selo feito={l.pesoCaixaFeito} rotulo="Feito" />
                  </td>
                  <td className="p-2">{l.pesoMedioKg || "—"}</td>
                  <td className="p-2">
                    <Selo feito={l.doaApurada} rotulo="Apurada" />
                    {l.doaApurada && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {l.avesRecebidas} recebidas · {l.avesMortas} mortas · {formatarPctDoa(l.doaPct)}
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs font-medium text-destructive">
                    {l.faltas.length > 0 ? l.faltas.join("; ") : <span className="text-success">Completa</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
