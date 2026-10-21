import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { useSessionStore } from "@/store/session";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { RelatorioBpf } from "./RelatorioBpf";
import { useLiberarRelatorio, useRelatorios } from "./api";
import { formatarData } from "./regras";

function Conteudo() {
  const dialog = useAppDialog();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: relatorios, isLoading, isError } = useRelatorios();
  const liberar = useLiberarRelatorio();
  const [escolhidoId, setEscolhidoId] = useState("");

  const lista = relatorios ?? [];
  const selecionado = lista.find((r) => r.id === escolhidoId) ?? lista[0];
  const podeLiberar =
    selecionado?.status === "emitido" &&
    (perfil?.nivelAcesso === "VERIFICADOR" || perfil?.nivelAcesso === "ADMIN_MASTER") &&
    selecionado.emitido_por !== perfil?.id;
  const ehEmissor = selecionado?.status === "emitido" && selecionado.emitido_por === perfil?.id;

  function confirmarLiberacao() {
    if (!selecionado) return;
    dialog.confirm({
      titulo: "Conferir e liberar ao SIF?",
      mensagem: `Ao liberar o relatório de ${formatarData(selecionado.data_referencia)}, a sua assinatura de conferência é gravada e o relatório passa a ficar disponível ao SIF, sem possibilidade de alteração.`,
      icone: "warning",
      aoConfirmar: () =>
        liberar.mutate(selecionado.id, {
          onSuccess: () => dialog.sucesso("Relatório liberado ao SIF.", "Liberado"),
          onError: (erro) => dialog.erro(erro, "Não foi possível liberar"),
        }),
    });
  }

  return (
    <>
      <CabecalhoBpf
        titulo="Relatórios diários — BPF Estrutural"
        descricao="Não conformidades apontadas pelo inspetor, com a programação do PCM e as assinaturas do dia."
      />

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {isError && <p className="text-destructive">Não foi possível carregar os relatórios.</p>}
      {!isLoading && lista.length === 0 && <p className="text-muted-foreground">Nenhum relatório disponível ainda.</p>}

      {selecionado && (
        <>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Select value={selecionado.id} onChange={(e) => setEscolhidoId(e.target.value)} className="max-w-sm" aria-label="Relatório">
              {lista.map((r) => (
                <option key={r.id} value={r.id}>
                  {formatarData(r.data_referencia)} — {r.status === "liberado" ? "liberado ao SIF" : "aguardando conferência"} ({r.qtd_nc} NC · {r.qtd_np} NP)
                </option>
              ))}
            </Select>
            <Badge variant={selecionado.status === "liberado" ? "success" : "warning"}>
              {selecionado.status === "liberado" ? "Liberado ao SIF" : "Aguardando o Verificador"}
            </Badge>
            <div className="ml-auto flex gap-2">
              {podeLiberar && (
                <Button type="button" onClick={confirmarLiberacao} disabled={liberar.isPending}>
                  {liberar.isPending ? "Liberando…" : "Conferir e liberar ao SIF"}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={imprimirElemento}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </div>
          </div>
          {ehEmissor && (
            <p className="text-sm text-muted-foreground print:hidden">
              Você emitiu este relatório; a conferência e a liberação ao SIF são feitas por um Verificador.
            </p>
          )}
          <RelatorioBpf relatorio={selecionado} />
        </>
      )}
    </>
  );
}

export function RelatoriosPage() {
  return (
    <PaginaBpf larga>
      <Conteudo />
    </PaginaBpf>
  );
}
