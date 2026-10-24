import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { DialogProvider, useAppDialog } from "@/modules/gestao/dialogSystem";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { RelatorioBpf } from "./RelatorioBpf";
import { useLiberarRelatorio, useRelatorios } from "./api";
import { formatarData } from "./regras";

export type FiltroLiberacaoRelatorios = "pendentes" | "liberadas" | "todas";

/** Relatórios diários de OS (BPF Estrutural) no Painel de Arquivo: os já verificados pelo Verificador aguardam aqui a liberação ao
 * SIF — selecionados e liberados pelo administrador (como as fichas) — e os liberados ficam para consulta e impressão. */
function Conteudo({ liberacao, podeLiberar }: { liberacao: FiltroLiberacaoRelatorios; podeLiberar: boolean }) {
  const dialog = useAppDialog();
  const { data: relatorios } = useRelatorios();
  const liberar = useLiberarRelatorio();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [liberando, setLiberando] = useState(false);

  const lista = (relatorios ?? []).filter((r) => {
    if (r.status === "emitido") return false; // ainda não verificado: não chegou ao arquivo
    if (liberacao === "pendentes") return r.status === "verificado";
    if (liberacao === "liberadas") return r.status === "liberado";
    return true;
  });
  if (lista.length === 0) return null;

  const idsParaLiberar = lista.filter((r) => r.status === "verificado" && selecionados.has(r.id)).map((r) => r.id);

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function confirmarLiberacao() {
    const ids = idsParaLiberar;
    dialog.confirm({
      titulo: "Liberar ao SIF?",
      mensagem: `Ao liberar ${ids.length} relatório(s) de OS, a sua assinatura de liberação é gravada e eles passam a ficar disponíveis ao SIF, sem possibilidade de alteração.`,
      icone: "warning",
      aoConfirmar: async () => {
        setLiberando(true);
        try {
          for (const id of ids) await liberar.mutateAsync(id);
          setSelecionados(new Set());
          dialog.sucesso(`${ids.length} relatório(s) de OS liberado(s) ao SIF.`, "Liberado");
        } catch (erro) {
          dialog.erro(erro, "Não foi possível liberar");
        } finally {
          setLiberando(false);
        }
      },
    });
  }

  return (
    <section className="space-y-3" data-testid="relatorios-os-arquivo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Relatórios de OS (BPF)</h2>
        {podeLiberar && (
          <Button type="button" onClick={confirmarLiberacao} disabled={idsParaLiberar.length === 0 || liberando}>
            {liberando ? "Liberando…" : `Liberar relatórios de OS ao SIF (${idsParaLiberar.length})`}
          </Button>
        )}
      </div>
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
                    onChange={() => alternar(r.id)}
                    aria-label={`Selecionar relatório de OS de ${formatarData(r.data_referencia)}`}
                  />
                )}
                <CardTitle className="text-base">
                  <Badge variant="outline">BPF — OS</Badge> <Badge variant={r.qtd_nc === 0 ? "success" : "destructive"}>{r.qtd_nc} NC</Badge>{" "}
                  <Badge variant="secondary">{r.qtd_np} NP</Badge> <Badge variant={verificado ? "warning" : "outline"}>{verificado ? "Verificado" : "Liberado ao SIF"}</Badge>
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
                {r.liberado_por_nome ? ` · liberado por ${r.liberado_por_nome}` : ""}
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

/** Próprio DialogProvider: o Painel de Arquivo (onde esta seção aparece) não tem um. */
export function RelatoriosOsArquivo(props: { liberacao: FiltroLiberacaoRelatorios; podeLiberar: boolean }) {
  return (
    <DialogProvider>
      <Conteudo {...props} />
    </DialogProvider>
  );
}
