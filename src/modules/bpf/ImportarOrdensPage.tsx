import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { useCentrosCusto } from "@/modules/gestao/api";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { useImportarOrdens, type ResultadoImportacao } from "./api";
import { CABECALHO_MODELO_CSV, LINHA_EXEMPLO_CSV, lerCsvOrdens, type ResultadoLeituraCsv } from "./importacao";
import { formatarData, rotuloProgramacao } from "./regras";

function baixarModelo() {
  const blob = new Blob(["\uFEFF" + CABECALHO_MODELO_CSV + "\r\n" + LINHA_EXEMPLO_CSV + "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-importacao-os.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function Conteudo() {
  const dialog = useAppDialog();
  const { data: centros } = useCentrosCusto();
  const importar = useImportarOrdens();
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [leitura, setLeitura] = useState<ResultadoLeituraCsv | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const centrosNovos = useMemo(() => {
    if (!leitura) return [];
    const existentes = new Set((centros ?? []).map((c) => c.nome.trim().toLowerCase()));
    return [...new Set(leitura.itens.map((i) => i.setor_area.trim()))].filter((n) => !existentes.has(n.toLowerCase()));
  }, [leitura, centros]);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    setResultado(null);
    if (!arquivo) {
      setLeitura(null);
      setNomeArquivo("");
      return;
    }
    setNomeArquivo(arquivo.name);
    setLeitura(lerCsvOrdens(await arquivo.text()));
  }

  function confirmar() {
    if (!leitura || leitura.itens.length === 0) return;
    dialog.confirm({
      titulo: `Importar ${leitura.itens.length} OS?`,
      mensagem:
        "As OS entram já programadas e passam a aparecer na verificação diária do inspetor. OS com número que já existe no sistema são ignoradas." +
        (centrosNovos.length ? ` Serão criados ${centrosNovos.length} setor(es) novo(s) no cadastro de áreas.` : ""),
      icone: "info",
      aoConfirmar: () =>
        importar.mutate(leitura.itens, {
          onSuccess: (r) => {
            setResultado(r);
            setLeitura(null);
            setNomeArquivo("");
          },
          onError: (erro) => dialog.erro(erro, "Não foi possível importar"),
        }),
    });
  }

  return (
    <>
      <CabecalhoBpf
        titulo="Importar OS já programadas"
        descricao="Carga única do relatório manual anterior, para o inspetor já monitorar a execução dessas OS."
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link to="/bpf/aprovacoes">Voltar às aprovações</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>1. Arquivo CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Colunas: <code className="text-xs">{CABECALHO_MODELO_CSV}</code>. Em <em>reprogramacoes</em>, separe várias datas por <code>|</code> (na ordem Rep. I, Rep. II…); o
            prazo vigente é o último. Datas em DD/MM/AAAA.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="bpf-csv">Arquivo</Label>
              <Input id="bpf-csv" type="file" accept=".csv,text/csv" onChange={(e) => void aoEscolherArquivo(e)} />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
              Baixar modelo
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="font-semibold text-success">{resultado.importadas} OS importadas.</p>
            {resultado.ignoradas.length > 0 && <p>Ignoradas por já existirem: {resultado.ignoradas.join(", ")}.</p>}
            {resultado.centros_criados.length > 0 && <p>Setores criados: {resultado.centros_criados.join(", ")}.</p>}
            <Button asChild size="sm" className="mt-2">
              <Link to="/bpf">Ir para a verificação diária</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {leitura && (
        <Card>
          <CardHeader>
            <CardTitle>2. Conferir ({nomeArquivo})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {leitura.erros.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-down-soft p-3 text-sm text-down">
                <p className="font-semibold">{leitura.erros.length} linha(s) com problema — não serão importadas:</p>
                <ul className="list-disc pl-5">
                  {leitura.erros.slice(0, 30).map((er) => (
                    <li key={er}>{er}</li>
                  ))}
                </ul>
              </div>
            )}
            {centrosNovos.length > 0 && (
              <p className="text-sm text-warning">
                Setores que ainda não existem no cadastro e serão criados: <strong>{centrosNovos.join(", ")}</strong>. Confira a grafia — um setor escrito diferente vira um cadastro novo.
              </p>
            )}
            <p className="text-sm">
              <strong>{leitura.itens.length}</strong> OS prontas para importar.
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-hairline">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th className="p-2">OS</th>
                    <th className="p-2">Setor</th>
                    <th className="p-2">Anomalia</th>
                    <th className="p-2">Programação</th>
                  </tr>
                </thead>
                <tbody>
                  {leitura.itens.map((i) => (
                    <tr key={i.numero_os} className="border-t border-hairline align-top">
                      <td className="p-2 font-mono">{i.numero_os}</td>
                      <td className="p-2">{i.setor_area}</td>
                      <td className="p-2">{i.descricao}</td>
                      <td className="p-2">{i.prazos.map((p, idx) => `${rotuloProgramacao(idx)} ${formatarData(p)}`).join(" → ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" onClick={confirmar} disabled={leitura.itens.length === 0 || importar.isPending}>
              {importar.isPending ? "Importando…" : `Importar ${leitura.itens.length} OS`}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function ImportarOrdensPage() {
  return (
    <PaginaBpf larga>
      <Conteudo />
    </PaginaBpf>
  );
}
