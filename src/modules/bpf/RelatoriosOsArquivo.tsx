import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { RelatorioBpf } from "./RelatorioBpf";
import { useRelatorios } from "./api";
import { formatarData, relatoriosOsDoArquivo, type FiltroLiberacaoRelatorios } from "./regras";

/** Relatórios diários de OS (BPF Estrutural) no Painel de Arquivo. Funcionam como as fichas de monitoramento: os verificados
 * são selecionados aqui e liberados ao SIF pelo mesmo botão "Liberar selecionados" do painel (a seleção fica na página). */
export function RelatoriosOsArquivo({
  liberacao,
  podeLiberar,
  selecionados,
  aoAlternar,
}: {
  liberacao: FiltroLiberacaoRelatorios;
  podeLiberar: boolean;
  selecionados: Set<string>;
  aoAlternar: (id: string) => void;
}) {
  const { data: relatorios } = useRelatorios();
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const lista = relatoriosOsDoArquivo(relatorios, liberacao);
  if (lista.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="relatorios-os-arquivo">
      <h2 className="text-lg font-medium">Relatórios de OS (BPF)</h2>
      {lista.map((r) => {
        const aberto = abertoId === r.id;
        const verificado = r.status === "verificado";
        return (
          <Card key={r.id} data-testid={`arquivo-relatorio-os-${r.data_referencia}`}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
              <div className="flex flex-wrap items-center gap-3">
                {podeLiberar && verificado && (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selecionados.has(r.id)}
                    onChange={() => aoAlternar(r.id)}
                    aria-label={`Selecionar relatório de OS de ${formatarData(r.data_referencia)}`}
                  />
                )}
                <CardTitle className="text-base">
                  <Badge variant="outline">BPF — OS</Badge> <Badge variant={r.qtd_nc === 0 ? "success" : "destructive"}>{r.qtd_nc} NC</Badge>{" "}
                  <Badge variant="secondary">{r.qtd_np} NP</Badge> {!verificado && <Badge variant="outline">Liberado ao SIF</Badge>}
                </CardTitle>
              </div>
              <div className="flex gap-2 print:hidden">
                {aberto && (
                  <Button type="button" size="sm" variant="ghost" onClick={imprimirElemento}>
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setAbertoId(aberto ? null : r.id)}>
                  {aberto ? "Ocultar" : "Ver / Imprimir"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Relatório diário de OS — {formatarData(r.data_referencia)}</p>
              <p>
                Emitido por {r.emitido_por_nome}
                {r.verificado_por_nome ? ` · verificado por ${r.verificado_por_nome}` : ""}
              </p>
              {aberto && (
                <div className="mt-3">
                  <RelatorioBpf relatorio={r} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
