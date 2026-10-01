import { useMemo, useState } from "react";
import { Eye, FilterX, ListFilter, Printer } from "lucide-react";
import { useFichasTemplatesTodas, useUsuariosMap, pacsDoTemplate } from "@/modules/fichas/api";
import { RelatorioModal } from "@/modules/fichas/components/relatorio/RelatorioModal";
import { turnoDoDia } from "@/modules/bordo/api";
import { agruparPorDossie, setoresDoGrupo, tipoPorTemplate } from "@/modules/fichas/utils/recordGrouping";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { useLiberarLoteSif, useMonitoramentosArquivo } from "./api";
import { FILTROS_ARQUIVO_INICIAIS, filtrarArquivo, filtrosAtivos, type FiltrosArquivo } from "./filtrosArquivo";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { ROTULO_SITUACAO, situacaoDe } from "@/shared/situacaoConformidade";
import { useSessionStore } from "@/store/session";

/** Painel de Arquivo — destino de toda ficha já verificada (aprovada ou reprovada). Dá para filtrar
 * por data, PAC, setor, turno, ficha, situação, inspetor e liberação ao SIF. As fichas ainda não
 * liberadas podem ser selecionadas e liberadas em lote (seção 7.3 e 6.2); as já liberadas ficam
 * aqui para consulta e impressão. Não introduz um novo estado no banco. */
export function PainelArquivoPage() {
  const { data: arquivo, isLoading } = useMonitoramentosArquivo();
  const { data: templates } = useFichasTemplatesTodas();
  const { data: usuarios } = useUsuariosMap();
  const liberar = useLiberarLoteSif();
  // A liberação à Auditoria Oficial SIF é exclusiva do administrador (a Edge Function liberar-sif recusa os demais).
  const podeLiberar = useSessionStore((s) => s.perfil?.nivelAcesso === "ADMIN_MASTER");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [relatorioIds, setRelatorioIds] = useState<string[] | null>(null);
  const [relatorioGrupos, setRelatorioGrupos] = useState<string[][] | null>(null);
  const [filtros, setFiltros] = useState<FiltrosArquivo>(FILTROS_ARQUIVO_INICIAIS);

  const pacsPorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, pacsDoTemplate(t)])), [templates]);
  const pacPorTemplateId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const [id, pacs] of pacsPorTemplateId) mapa.set(id, pacs.join(" / ") || "—");
    return mapa;
  }, [pacsPorTemplateId]);
  const tipoDaFicha = useMemo(() => tipoPorTemplate(new Map((templates ?? []).map((t) => [t.id, t.codigo]))), [templates]);
  const nomePorTemplateId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.nome])), [templates]);

  const ctx = useMemo(() => ({ pacsDoTemplate: (id: string) => pacsPorTemplateId.get(id) ?? [], tipoDaFicha }), [pacsPorTemplateId, tipoDaFicha]);

  // Opções dos filtros: só o que existe no arquivo.
  const opcoes = useMemo(() => {
    const pacs = new Set<string>();
    const setores = new Set<string>();
    const fichas = new Map<string, string>();
    const inspetores = new Set<string>();
    for (const m of arquivo ?? []) {
      for (const p of ctx.pacsDoTemplate(m.ficha_template_id)) pacs.add(p);
      setores.add(m.setor);
      fichas.set(tipoDaFicha(m.ficha_template_id), nomePorTemplateId.get(m.ficha_template_id) ?? tipoDaFicha(m.ficha_template_id));
      inspetores.add(m.user_id);
    }
    const ordenar = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
    return {
      pacs: [...pacs].sort(ordenar),
      setores: [...setores].sort(ordenar),
      fichas: [...fichas.entries()].sort((a, b) => ordenar(a[1], b[1])),
      inspetores: [...inspetores].map((id) => [id, usuarios?.get(id) ?? "Inspetor"] as const).sort((a, b) => ordenar(a[1], b[1])),
    };
  }, [arquivo, ctx, tipoDaFicha, nomePorTemplateId, usuarios]);

  const filtrados = useMemo(() => filtrarArquivo(arquivo ?? [], filtros, ctx), [arquivo, filtros, ctx]);

  // Um relatório consolidado por tipo de ficha + turno: selecionar o card seleciona os monitoramentos
  // dele que ainda não foram liberados. Mais recentes primeiro.
  const grupos = useMemo(
    () =>
      agruparPorDossie(filtrados, tipoDaFicha).sort(
        (a, b) => new Date(b.items[0]!.criado_em).getTime() - new Date(a.items[0]!.criado_em).getTime()
      ),
    [filtrados, tipoDaFicha]
  );

  function definir<K extends keyof FiltrosArquivo>(chave: K, valor: FiltrosArquivo[K]) {
    setFiltros((atual) => ({ ...atual, [chave]: valor }));
  }

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

  // Só o que ainda não foi liberado entra na liberação; qualquer ficha selecionada pode ser impressa.
  const idsParaLiberar = (arquivo ?? []).filter((m) => selecionados.has(m.id) && !m.liberado_sif).map((m) => m.id);
  const gruposSelecionados = grupos.filter((g) => g.items.some((m) => selecionados.has(m.id))).map((g) => g.items.map((m) => m.id));

  async function liberarSelecionados() {
    const ids = idsParaLiberar;
    if (ids.length === 0) return;
    await liberar.mutateAsync(ids);
    setSelecionados(new Set());
  }

  const nFiltros = filtrosAtivos(filtros);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel de Arquivo</h1>
          <p className="text-sm text-muted-foreground">
            Todas as fichas já verificadas. Busque por data, PAC, setor e mais, selecione os cards e imprima os relatórios ou libere para a
            Auditoria Oficial SIF — a liberação gera um hash agregador do lote, assina cada documento como LIBERACAO_DIARIA e só então
            o auditor passa a vê-los.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={gruposSelecionados.length === 0} onClick={() => setRelatorioGrupos(gruposSelecionados)}>
            <Printer className="h-4 w-4" />
            Imprimir selecionados ({gruposSelecionados.length})
          </Button>
          {podeLiberar && (
            <Button onClick={liberarSelecionados} disabled={idsParaLiberar.length === 0 || liberar.isPending}>
              {liberar.isPending ? "Liberando…" : `Liberar selecionados para Auditoria (${idsParaLiberar.length})`}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListFilter className="h-4 w-4" /> Filtros
            {nFiltros > 0 && <Badge variant="secondary">{nFiltros} ativo(s)</Badge>}
          </CardTitle>
          <Button type="button" size="sm" variant="ghost" disabled={nFiltros === 0} onClick={() => setFiltros(FILTROS_ARQUIVO_INICIAIS)}>
            <FilterX className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="filtros-arquivo">
            <div className="space-y-1">
              <Label htmlFor="arq-de">Data inicial</Label>
              <Input id="arq-de" type="date" value={filtros.de} max={filtros.ate || undefined} onChange={(e) => definir("de", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-ate">Data final</Label>
              <Input id="arq-ate" type="date" value={filtros.ate} min={filtros.de || undefined} onChange={(e) => definir("ate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-pac">PAC</Label>
              <Select id="arq-pac" value={filtros.pac} onChange={(e) => definir("pac", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.pacs.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-setor">Setor</Label>
              <Select id="arq-setor" value={filtros.setor} onChange={(e) => definir("setor", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.setores.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-turno">Turno</Label>
              <Select id="arq-turno" value={filtros.turno} onChange={(e) => definir("turno", e.target.value)}>
                <option value="">Todos</option>
                <option value="1º Turno">1º Turno</option>
                <option value="2º Turno">2º Turno</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-ficha">Ficha</Label>
              <Select id="arq-ficha" value={filtros.ficha} onChange={(e) => definir("ficha", e.target.value)}>
                <option value="">Todas</option>
                {opcoes.fichas.map(([tipo, nome]) => (
                  <option key={tipo} value={tipo}>
                    {nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-situacao">Situação</Label>
              <Select id="arq-situacao" value={filtros.situacao} onChange={(e) => definir("situacao", e.target.value as FiltrosArquivo["situacao"])}>
                <option value="">Todas</option>
                {(Object.keys(ROTULO_SITUACAO) as (keyof typeof ROTULO_SITUACAO)[]).map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-inspetor">Inspetor</Label>
              <Select id="arq-inspetor" value={filtros.inspetor} onChange={(e) => definir("inspetor", e.target.value)}>
                <option value="">Todos</option>
                {opcoes.inspetores.map(([id, nome]) => (
                  <option key={id} value={id}>
                    {nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="arq-liberacao">Liberação ao SIF</Label>
              <Select id="arq-liberacao" value={filtros.liberacao} onChange={(e) => definir("liberacao", e.target.value as FiltrosArquivo["liberacao"])}>
                <option value="pendentes">Aguardando liberação</option>
                <option value="liberadas">Já liberadas</option>
                <option value="todas">Todas (arquivo completo)</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {liberar.isSuccess && (
        <p className="text-sm text-success">
          Lote {liberar.data.lote_id} liberado: {liberar.data.quantidade_liberada} documento(s) — já visíveis para a Auditoria Oficial SIF.
        </p>
      )}
      {liberar.isError && <p className="text-sm text-destructive">Falha ao liberar o lote selecionado.</p>}

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && (
        <p className="text-sm text-muted-foreground" data-testid="resumo-arquivo">
          {filtrados.length} monitoramento(s) em {grupos.length} relatório(s)
          {nFiltros > 0 ? ` — filtrado de ${arquivo?.length ?? 0}` : ""}.
        </p>
      )}
      {!isLoading && filtrados.length === 0 && (
        <p className="text-muted-foreground">{nFiltros > 0 ? "Nenhuma ficha corresponde aos filtros." : "Nenhuma ficha verificada ainda."}</p>
      )}

      {grupos.map(({ chave, items }) => {
        const primeiro = items[0]!;
        const ids = items.map((m) => m.id);
        const idsPendentes = items.filter((m) => !m.liberado_sif).map((m) => m.id);
        const todosSelecionados = ids.every((id) => selecionados.has(id));
        const liberados = items.length - idsPendentes.length;
        // Tratado (RNC procedente) não conta como desvio em aberto.
        const desvios = items.filter((m) => situacaoDe(m) === "NAO_CONFORME").length;
        const tratados = items.filter((m) => situacaoDe(m) === "TRATADO").length;
        return (
          <Card key={chave} data-testid="grupo-arquivo">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
              <div className="flex flex-wrap items-center gap-3">
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
                  <Badge variant="secondary">{items.length} monitoramento(s)</Badge>{" "}
                  {idsPendentes.length === 0 ? (
                    <Badge variant="outline">Liberado ao SIF</Badge>
                  ) : liberados > 0 ? (
                    <Badge variant="warning">{liberados} liberado(s)</Badge>
                  ) : null}
                </CardTitle>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRelatorioIds(ids)}>
                <Eye className="h-3.5 w-3.5" />
                Ver / Imprimir
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
      {relatorioGrupos && <RelatorioModal ids={[]} grupos={relatorioGrupos} onFechar={() => setRelatorioGrupos(null)} />}
    </div>
  );
}
