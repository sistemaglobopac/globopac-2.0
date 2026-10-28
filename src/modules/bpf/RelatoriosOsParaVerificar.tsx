import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { DialogProvider, useAppDialog } from "@/modules/gestao/dialogSystem";
import { useSessionStore } from "@/store/session";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { RelatorioBpf } from "./RelatorioBpf";
import { useRelatorios, useVerificarRelatorio } from "./api";
import { formatarData } from "./regras";
import { CODIGO_FICHA_BPF, NOME_RELATORIO_BPF } from "./tipos";

/** Relatórios diários de OS (BPF Estrutural) emitidos pelo inspetor e aguardando a verificação do Verificador, feita aqui, no
 * Painel de Verificação. Verificar NÃO libera ao SIF: o relatório verificado segue para o Painel de Arquivo, de onde o
 * administrador o libera. Some quando não há nenhum. Quem emitiu o relatório não o verifica (o banco também recusa). */
function Conteudo() {
  const dialog = useAppDialog();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: relatorios } = useRelatorios();
  const verificar = useVerificarRelatorio();
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const pendentes = (relatorios ?? []).filter((r) => r.status === "emitido");
  if (pendentes.length === 0) return null;

  function confirmarVerificacao(id: string, dataReferencia: string) {
    dialog.confirm({
      titulo: "Verificar o relatório de OS?",
      mensagem: `Ao verificar o relatório de OS de ${formatarData(dataReferencia)}, a sua assinatura de verificação é gravada e o relatório segue para o Painel de Arquivo, de onde é liberado ao SIF.`,
      icone: "warning",
      aoConfirmar: () =>
        verificar.mutate(id, {
          onSuccess: () => dialog.sucesso("Relatório verificado. Ele segue para o Painel de Arquivo.", "Verificado"),
          onError: (erro) => dialog.erro(erro, "Não foi possível verificar"),
        }),
    });
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4" data-testid="relatorios-os-para-verificar">
      <div>
        <h2 className="text-lg font-medium">{NOME_RELATORIO_BPF} ({CODIGO_FICHA_BPF}) — aguardando sua verificação ({pendentes.length})</h2>
        <p className="text-sm text-muted-foreground">
          Confira as não conformidades apontadas pelo inspetor, a programação do PCM e as assinaturas do dia. Depois de verificado, o relatório vai para o
          Painel de Arquivo, onde é selecionado para liberação ao SIF.
        </p>
      </div>
      {pendentes.map((r) => {
        const aberto = abertoId === r.id;
        const ehEmissor = r.emitido_por === perfil?.id;
        return (
          <div key={r.id} className="space-y-3 rounded-lg border bg-card p-3" data-testid={`relatorio-os-${r.data_referencia}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{formatarData(r.data_referencia)}</span>
              <Badge variant="warning">
                {r.qtd_nc} NC · {r.qtd_np} NP
              </Badge>
              <div className="ml-auto flex flex-wrap gap-2 print:hidden">
                <Button type="button" variant="outline" size="sm" onClick={() => setAbertoId(aberto ? null : r.id)}>
                  {aberto ? "Ocultar relatório" : "Ver relatório"}
                </Button>
                {aberto && (
                  <Button type="button" variant="outline" size="sm" onClick={imprimirElemento}>
                    <Printer className="h-4 w-4" /> Imprimir
                  </Button>
                )}
                {!ehEmissor && (
                  <Button type="button" size="sm" onClick={() => confirmarVerificacao(r.id, r.data_referencia)} disabled={verificar.isPending}>
                    {verificar.isPending ? "Verificando…" : "Verificar relatório"}
                  </Button>
                )}
              </div>
            </div>
            {ehEmissor && <p className="text-sm text-muted-foreground">Você emitiu este relatório; a verificação é feita por um Verificador.</p>}
            {aberto && <RelatorioBpf relatorio={r} />}
          </div>
        );
      })}
    </section>
  );
}

/** Próprio DialogProvider: o Painel de Verificação (onde esta seção aparece) não tem um. */
export function RelatoriosOsParaVerificar() {
  return (
    <DialogProvider>
      <Conteudo />
    </DialogProvider>
  );
}
