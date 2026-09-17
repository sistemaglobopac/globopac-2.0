import { useMonitoramentosLiberados } from "./api";
import { useOsLiberadas } from "@/modules/pcm/api";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Painel de auditoria da INSPECAO_FEDERAL (seção 4, 7.3 e 7.4) — somente leitura, só
 * enxerga o que já foi liberado ao SIF (monitoramentos e, a partir da Fase 5, OS de
 * manutenção). A RLS de cada tabela é quem garante isso; esta tela não aplica nenhum filtro
 * adicional por conta própria. */
export function AuditoriaFederalPage() {
  const { data: liberados, isLoading } = useMonitoramentosLiberados();
  const { data: osLiberadas, isLoading: isLoadingOs } = useOsLiberadas();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-4">
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

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Ordens de Serviço liberadas ao SIF</h2>

        {isLoadingOs && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoadingOs && osLiberadas?.length === 0 && (
          <p className="text-muted-foreground">Nenhuma OS liberada ainda.</p>
        )}

        {osLiberadas?.map((os) => (
          <Card key={os.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Badge variant="outline">{os.setor}</Badge> {os.descricao}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Concluída em {os.concluido_em ? new Date(os.concluido_em).toLocaleString("pt-BR") : "—"} · Liberada em{" "}
              {os.liberado_em ? new Date(os.liberado_em).toLocaleString("pt-BR") : "—"}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
