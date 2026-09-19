import { useSearchParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { usePerfisGestao, useRelatorioJornada } from "./api";

const ROTULO_TIPO_PAUSA: Record<string, string> = {
  CURTA_20M: "Pausa curta (20 min)",
  ALMOCO_72M: "Almoço/Jantar (1h12)",
  JANTAR_72M: "Almoço/Jantar (1h12)",
};

function formatarHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Relatório de Jornada (Folha de Pausa) — pensado para impressão em A4 (`window.print()`);
 * uma seção por inspetor quando `lote=1`, com quebra de página entre elas via CSS de print. */
export function RelatorioFolhaPausaPage() {
  const [params] = useSearchParams();
  const mes = params.get("mes") ?? "";
  const inspetorId = params.get("inspetorId");
  const lote = params.get("lote") === "1";

  const { data: perfis } = usePerfisGestao();
  const idsAlvo = lote
    ? (perfis ?? []).filter((p) => p.nivel_acesso === "INSPETOR_QUALIDADE").map((p) => p.id)
    : inspetorId
      ? [inspetorId]
      : [];

  const { data: relatorio, isLoading } = useRelatorioJornada(idsAlvo, mes);

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold">Folha de Pausa — {mes}</h1>
          <p className="text-sm text-muted-foreground">Jornada e pausas consolidadas do mês, prontas para assinatura.</p>
        </div>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && (relatorio ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum inspetor selecionado.</p>}

      {(relatorio ?? []).map((inspetor) => (
        <section key={inspetor.id} className="space-y-3 rounded-lg border p-6 print:break-after-page print:border-0">
          <header className="border-b pb-2">
            <h2 className="text-lg font-bold">{inspetor.nome}</h2>
            <p className="text-sm text-muted-foreground">Referência: {mes}</p>
          </header>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Turnos</h3>
            {inspetor.turnos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum turno registrado.</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1">Data</th>
                  <th className="py-1">Início</th>
                  <th className="py-1">Fim</th>
                  <th className="py-1">Setor</th>
                </tr>
              </thead>
              <tbody>
                {inspetor.turnos.map((t) => (
                  <tr key={t.id} className="border-b">
                    <td className="py-1">{formatarData(t.inicio)}</td>
                    <td className="py-1">{formatarHora(t.inicio)}</td>
                    <td className="py-1">{formatarHora(t.fim)}</td>
                    <td className="py-1">{t.setor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pausas</h3>
            {inspetor.pausas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pausa registrada.</p>}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-1">Data</th>
                  <th className="py-1">Tipo</th>
                  <th className="py-1">Início</th>
                  <th className="py-1">Fim</th>
                </tr>
              </thead>
              <tbody>
                {inspetor.pausas.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-1">{formatarData(p.hora_inicio)}</td>
                    <td className="py-1">{ROTULO_TIPO_PAUSA[p.tipo_pausa] ?? p.tipo_pausa}</td>
                    <td className="py-1">{formatarHora(p.hora_inicio)}</td>
                    <td className="py-1">{formatarHora(p.hora_fim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-between gap-8 pt-8 text-xs text-muted-foreground">
            <div className="flex-1 border-t pt-1 text-center">Assinatura do colaborador</div>
            <div className="flex-1 border-t pt-1 text-center">Assinatura do responsável</div>
          </div>
        </section>
      ))}
    </div>
  );
}
