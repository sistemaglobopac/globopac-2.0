import { useMonitoramentosLiberados } from "./api";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Painel de auditoria da INSPECAO_FEDERAL (seção 4 e 7.3) — somente leitura, só enxerga o
 * que já foi liberado ao SIF. A RLS (monitoramentos_select) é quem garante isso; esta tela
 * não aplica nenhum filtro adicional por conta própria. */
export function AuditoriaFederalPage() {
  const { data: liberados, isLoading } = useMonitoramentosLiberados();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Auditoria — documentos liberados ao SIF</h1>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && liberados?.length === 0 && (
        <p className="text-muted-foreground">Nenhum documento liberado ainda.</p>
      )}

      {liberados?.map((m) => (
        <Card key={m.id}>
          <CardHeader className="pb-2">
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
