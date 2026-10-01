import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useFichasTemplatesTodas, useUsuariosMap, pacsDoTemplate } from "@/modules/fichas/api";
import { RelatorioModal } from "@/modules/fichas/components/relatorio/RelatorioModal";
import { turnoDoDia } from "@/modules/bordo/api";
import { agruparPorDossie, setoresDoGrupo, tipoPorTemplate } from "@/modules/fichas/utils/recordGrouping";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { useLiberarLoteSif, useMonitoramentosParaLiberar } from "./api";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { situacaoDe } from "@/shared/situacaoConformidade";

/** Painel de Arquivo — fichas já verificadas (aprovadas ou reprovadas) e ainda não liberadas ao
 * SIF/auditoria. Mesma ação de "aprovar e assinar" de Painel de Verificação; esta tela é só o
 * destino/pool de onde o Verificador libera o lote (seção 7.3 e 6.2) — não introduz um novo
 * estado no banco. */
export function PainelArquivoPage() {
  const { data: pendentes, isLoading } = useMonitoramentosParaLiberar();
  const { data: templates } = useFichasTemplatesTodas();
  const { data: usuarios } = useUsuariosMap();
  const liberar = useLiberarLoteSif();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [relatorioIds, setRelatorioIds] = useState<string[] | null>(null);

  const pacPorTemplateId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of templates ?? []) mapa.set(t.id, pacsDoTemplate(t).join(" / ") || "—");
    return mapa;
  }, [templates]);
  const tipoDaFicha = useMemo(() => tipoPorTemplate(new Map((templates ?? []).map((t) => [t.id, t.codigo]))), [templates]);
  const nomePorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.nome])), [templates]);

  // Um relatório consolidado por tipo de ficha + turno: selecionar o card seleciona todos os
  // monitoramentos dele.
  const grupos = useMemo(() => agruparPorDossie(pendentes ?? [], tipoDaFicha), [pendentes, tipoDaFicha]);

  function alternarGrupo(ids: string[]) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      const todos = ids.every((id) => novo.has(id));
      for (const id of ids) {
        if (todos) novo.delete(id);
        else novo.add(id);
      }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel de Arquivo</h1>
          <p className="text-sm text-muted-foreground">
            Fichas já verificadas, aguardando liberação ao SIF. Selecione uma ou mais — a
            liberação gera um hash agregador do lote e assina cada documento como
            LIBERACAO_DIARIA.
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

      {grupos.map(({ chave, items }) => {
        const primeiro = items[0]!;
        const ids = items.map((m) => m.id);
        const todosSelecionados = ids.every((id) => selecionados.has(id));
        // Tratado (RNC procedente) não conta como desvio em aberto.
        const desvios = items.filter((m) => situacaoDe(m) === "NAO_CONFORME").length;
        const tratados = items.filter((m) => situacaoDe(m) === "TRATADO").length;
        return (
          <Card key={chave}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={todosSelecionados}
                  onChange={() => alternarGrupo(ids)}
                  aria-label={`Selecionar relatório consolidado de ${nomePorTemplateId.get(primeiro.ficha_template_id) ?? "ficha"}`}
                />
                <CardTitle className="text-base">
                  <Badge variant="outline">{pacPorTemplateId.get(primeiro.ficha_template_id) ?? primeiro.setor}</Badge>{" "}
                  <Badge variant={desvios === 0 ? "success" : "destructive"}>
                    {desvios === 0 ? (tratados > 0 ? "Tratado" : "Conforme") : `${desvios} não conforme(s)`}
                  </Badge>{" "}
                  <Badge variant="secondary">{items.length} monitoramento(s)</Badge>
                </CardTitle>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRelatorioIds(ids)}>
                <Eye className="h-3.5 w-3.5" />
                Ver Dados
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{nomePorTemplateId.get(primeiro.ficha_template_id) ?? "Ficha"}</p>
              <p>
                {usuarios?.get(primeiro.user_id) ?? "Inspetor"} · {setoresDoGrupo(items)} · {turnoDoDia(new Date(primeiro.criado_em))} ·{" "}
                {ensureLocalTime(primeiro.criado_em).datePt}
              </p>
            </CardContent>
          </Card>
        );
      })}

      {relatorioIds && <RelatorioModal ids={relatorioIds} onFechar={() => setRelatorioIds(null)} />}
    </div>
  );
}
