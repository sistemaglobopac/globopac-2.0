import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { turnoDoDia } from "@/modules/bordo/api";
import { useFichasTemplatesTodas } from "@/modules/fichas/api";
import { RelatorioModal } from "@/modules/fichas/components/relatorio/RelatorioModal";
import { agruparPorDossie, setoresDoGrupo, tipoPorTemplate } from "@/modules/fichas/utils/recordGrouping";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { Button } from "@/shared/ui/button";
import { useMonitoramentosLiberados } from "./api";
import { useOsLiberadas } from "@/modules/pcm/api";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { situacaoDe } from "@/shared/situacaoConformidade";

/** Painel de auditoria da INSPECAO_FEDERAL (seção 4, 7.3 e 7.4) — somente leitura, só
 * enxerga o que já foi liberado ao SIF (monitoramentos e, a partir da Fase 5, OS de
 * manutenção). A RLS de cada tabela é quem garante isso; esta tela não aplica nenhum filtro
 * adicional por conta própria. */
export function AuditoriaFederalPage() {
  const { data: liberados, isLoading } = useMonitoramentosLiberados();
  const { data: osLiberadas, isLoading: isLoadingOs } = useOsLiberadas();
  const { data: templates } = useFichasTemplatesTodas();
  const [relatorioIds, setRelatorioIds] = useState<string[] | null>(null);
  // Um relatório consolidado por tipo de ficha + turno: o auditor vê o dia inteiro do tipo.
  const tipoDaFicha = useMemo(() => tipoPorTemplate(new Map((templates ?? []).map((t) => [t.id, t.codigo]))), [templates]);
  const nomePorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.nome])), [templates]);
  const grupos = useMemo(() => agruparPorDossie(liberados ?? [], tipoDaFicha), [liberados, tipoDaFicha]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Painel de Auditoria</h1>
          <p className="text-sm text-muted-foreground">Documentos liberados ao Serviço de Inspeção Federal para auditoria.</p>
        </div>

        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && liberados?.length === 0 && (
          <p className="text-muted-foreground">Nenhum documento liberado ainda.</p>
        )}

        {grupos.map(({ chave, items }) => {
          const primeiro = items[0]!;
          const ids = items.map((m) => m.id);
          const desvios = items.filter((m) => situacaoDe(m) === "NAO_CONFORME").length;
          const tratados = items.filter((m) => situacaoDe(m) === "TRATADO").length;
          const ultimaVerificacao = items.map((m) => m.verificado_em).filter(Boolean).sort().at(-1);
          return (
            <Card key={chave}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                <CardTitle className="text-base">
                  <Badge variant="outline">{setoresDoGrupo(items)}</Badge>{" "}
                  <Badge variant={desvios === 0 ? "success" : "destructive"}>
                    {desvios === 0 ? (tratados > 0 ? "Tratado" : "Conforme") : `${desvios} não conforme(s)`}
                  </Badge>{" "}
                  <Badge variant="secondary">{items.length} monitoramento(s)</Badge>
                </CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={() => setRelatorioIds(ids)}>
                  <Eye className="h-3.5 w-3.5" />
                  Ver Relatório
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{nomePorTemplateId.get(primeiro.ficha_template_id) ?? "Ficha"}</p>
                <p>
                  {turnoDoDia(new Date(primeiro.criado_em))} · {ensureLocalTime(primeiro.criado_em).datePt} · Verificado em{" "}
                  {ultimaVerificacao ? new Date(ultimaVerificacao).toLocaleString("pt-BR") : "—"}
                </p>
              </CardContent>
            </Card>
          );
        })}
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

      {relatorioIds && <RelatorioModal ids={relatorioIds} onFechar={() => setRelatorioIds(null)} />}
    </div>
  );
}
