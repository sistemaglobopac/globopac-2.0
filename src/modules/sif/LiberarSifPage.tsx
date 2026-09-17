import { useLiberarSif, useMonitoramentosParaLiberar } from "./api";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Liberação ao SIF (seção 7.3) — versão mínima da Fase 2: um monitoramento por vez. A
 * liberação em lote com hash agregador (lote_liberacao_sif) é Fase 3 — ver ASSUMPTIONS.md. */
export function LiberarSifPage() {
  const { data: pendentes, isLoading } = useMonitoramentosParaLiberar();
  const liberar = useLiberarSif();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Liberar ao SIF</h1>
      <p className="text-sm text-muted-foreground">
        Monitoramentos já verificados, ainda não liberados. Liberar assina como
        LIBERACAO_DIARIA e passa a aparecer para a Inspeção Federal.
      </p>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && pendentes?.length === 0 && (
        <p className="text-muted-foreground">Nada pendente de liberação.</p>
      )}

      {pendentes?.map((m) => (
        <Card key={m.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">
              <Badge variant="outline">{m.setor}</Badge>{" "}
              <Badge variant={m.conformidade ? "success" : "destructive"}>
                {m.conformidade ? "Conforme" : "Não conforme"}
              </Badge>
            </CardTitle>
            <Button
              size="sm"
              disabled={liberar.isPending}
              onClick={() => liberar.mutate(m.id)}
            >
              Liberar ao SIF
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Verificado em {m.verificado_em ? new Date(m.verificado_em).toLocaleString("pt-BR") : "—"}
          </CardContent>
        </Card>
      ))}

      {liberar.isError && <p className="text-sm text-destructive">Falha ao liberar.</p>}
    </div>
  );
}
