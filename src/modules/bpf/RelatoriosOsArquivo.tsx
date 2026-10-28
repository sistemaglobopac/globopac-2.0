import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { RelatorioBpf } from "./RelatorioBpf";
import { formatarData } from "./regras";
import { CODIGO_FICHA_BPF, NOME_RELATORIO_BPF, PAC_BPF, type Relatorio } from "./tipos";

/** Card do relatório diário de OS (Monitoramento de Infraestrutura e Equipamentos) no Painel de Arquivo. Aparece na mesma lista dos
 * monitoramentos, com o mesmo desenho dos cards das fichas: os verificados são selecionados aqui e liberados ao SIF pelo mesmo botão
 * "Liberar selecionados" do painel (a seleção fica na página). */
export function CartaoRelatorioOsArquivo({
  relatorio: r,
  podeLiberar,
  selecionado,
  aoAlternar,
}: {
  relatorio: Relatorio;
  podeLiberar: boolean;
  selecionado: boolean;
  aoAlternar: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const verificado = r.status === "verificado";

  return (
    <Card data-testid={`arquivo-relatorio-os-${r.data_referencia}`}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
        <div className="flex flex-wrap items-center gap-3">
          {podeLiberar && verificado && (
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selecionado}
              onChange={() => aoAlternar(r.id)}
              aria-label={`Selecionar relatório de OS de ${formatarData(r.data_referencia)}`}
            />
          )}
          <CardTitle className="text-base">
            <Badge variant="outline">{PAC_BPF}</Badge> <Badge variant={r.qtd_nc === 0 ? "success" : "destructive"}>{r.qtd_nc === 0 ? "Conforme" : `${r.qtd_nc} não conforme(s)`}</Badge>{" "}
            <Badge variant="secondary">{r.qtd_np} no prazo</Badge> {!verificado && <Badge variant="outline">Liberado ao SIF</Badge>}
          </CardTitle>
        </div>
        <div className="flex gap-2 print:hidden">
          {aberto && (
            <Button type="button" size="sm" variant="ghost" onClick={imprimirElemento}>
              <Printer className="h-3.5 w-3.5" /> Imprimir
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setAberto((v) => !v)}>
            {aberto ? "Ocultar" : "Ver / Imprimir"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          {NOME_RELATORIO_BPF} <span className="font-normal text-muted-foreground">· {CODIGO_FICHA_BPF}</span>
        </p>
        <p>
          {r.emitido_por_nome}
          {r.verificado_por_nome ? ` · verificado por ${r.verificado_por_nome}` : ""} · {r.setor} · {formatarData(r.data_referencia)}
        </p>
        {aberto && (
          <div className="mt-3">
            <RelatorioBpf relatorio={r} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
