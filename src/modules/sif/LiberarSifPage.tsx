import { useState } from "react";
import { useLiberarLoteSif, useMonitoramentosParaLiberar } from "./api";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Liberação ao SIF em lote (seção 7.3 e 6.2) — seleciona um ou mais monitoramentos
 * verificados e libera todos de uma vez, com um único hash agregador cobrindo o lote. */
export function LiberarSifPage() {
  const { data: pendentes, isLoading } = useMonitoramentosParaLiberar();
  const liberar = useLiberarLoteSif();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function liberarSelecionados() {
    const ids = Array.from(selecionados);
    if (ids.length === 0) return;
    await liberar.mutateAsync(ids);
    setSelecionados(new Set());
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Liberar ao SIF</h1>
          <p className="text-sm text-muted-foreground">
            Selecione um ou mais monitoramentos verificados — a liberação gera um hash
            agregador do lote e assina cada documento como LIBERACAO_DIARIA.
          </p>
        </div>
        <Button onClick={liberarSelecionados} disabled={selecionados.size === 0 || liberar.isPending}>
          {liberar.isPending ? "Liberando…" : `Liberar selecionados (${selecionados.size})`}
        </Button>
      </div>

      {liberar.isSuccess && (
        <p className="text-sm text-success">
          Lote {liberar.data.lote_id} liberado: {liberar.data.quantidade_liberada} documento(s).
        </p>
      )}
      {liberar.isError && <p className="text-sm text-destructive">Falha ao liberar o lote selecionado.</p>}

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && pendentes?.length === 0 && (
        <p className="text-muted-foreground">Nada pendente de liberação.</p>
      )}

      {pendentes?.map((m) => (
        <Card key={m.id}>
          <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selecionados.has(m.id)}
              onChange={() => alternarSelecao(m.id)}
              aria-label={`Selecionar monitoramento ${m.id}`}
            />
            <CardTitle className="text-base">
              <Badge variant="outline">{m.setor}</Badge>{" "}
              <Badge variant={m.conformidade ? "success" : "destructive"}>
                {m.conformidade ? "Conforme" : "Não conforme"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Verificado em {m.verificado_em ? new Date(m.verificado_em).toLocaleString("pt-BR") : "—"}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
