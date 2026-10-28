import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { RelatorioBpf } from "./RelatorioBpf";
import { useGerarRelatorioDoDia } from "./api";
import { hojeManaus } from "./regras";
import type { RelatorioDoDia, StatusRelatorio } from "./tipos";

const ROTULO_STATUS: Record<StatusRelatorio, string> = {
  emitido: "emitido, aguardando verificação",
  verificado: "verificado, aguardando liberação ao SIF",
  liberado: "liberado ao SIF",
};
const BADGE_STATUS: Record<StatusRelatorio, "warning" | "info" | "success"> = { emitido: "warning", verificado: "info", liberado: "success" };

/** Relatório diário por data: nada aparece pronto. O usuário escolhe a data e o sistema gera o relatório na hora — com o emitido
 * (assinado) daquela data, se o inspetor já encerrou o dia, ou montado com os registros do dia, marcado como não emitido. */
export function RelatorioPorData() {
  const dialog = useAppDialog();
  const gerar = useGerarRelatorioDoDia();
  const [dia, setDia] = useState("");
  const [gerado, setGerado] = useState<RelatorioDoDia | null>(null);
  const hoje = hojeManaus();

  function escolher(novoDia: string) {
    setDia(novoDia);
    setGerado(null); // o relatório na tela é sempre o da data escolhida
  }

  function executar() {
    gerar.mutate(dia, {
      onSuccess: setGerado,
      onError: (erro) => dialog.erro(erro, "Não foi possível gerar o relatório"),
    });
  }

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-3 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (dia && !gerar.isPending) executar();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="relatorio-bpf-data">Data do relatório</Label>
          <Input id="relatorio-bpf-data" type="date" value={dia} max={hoje} onChange={(e) => escolher(e.target.value)} className="w-44" />
        </div>
        <Button type="submit" disabled={!dia || gerar.isPending}>
          {gerar.isPending ? "Gerando…" : "Gerar relatório"}
        </Button>
        {gerado && (
          <>
            {gerado.provisorio ? <Badge variant="warning">gerado na hora — dia ainda não emitido</Badge> : <Badge variant={BADGE_STATUS[gerado.status]}>{ROTULO_STATUS[gerado.status]}</Badge>}
            <div className="ml-auto">
              <Button type="button" variant="outline" onClick={imprimirElemento}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </div>
          </>
        )}
      </form>

      {!gerado && <p className="text-sm text-muted-foreground print:hidden">Escolha a data e clique em "Gerar relatório".</p>}
      {gerado && <RelatorioBpf relatorio={gerado} />}
    </>
  );
}
