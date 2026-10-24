import { useState } from "react";
import { Printer } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { imprimirElemento } from "@/modules/fichas/utils/printHelper";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { RelatorioBpf } from "./RelatorioBpf";
import { useRelatorios } from "./api";
import { formatarData } from "./regras";
import type { StatusRelatorio } from "./tipos";

const ROTULO_STATUS: Record<StatusRelatorio, string> = {
  emitido: "aguardando verificação",
  verificado: "verificado, aguardando liberação ao SIF",
  liberado: "liberado ao SIF",
};
const BADGE_STATUS: Record<StatusRelatorio, "warning" | "info" | "success"> = { emitido: "warning", verificado: "info", liberado: "success" };

/** Consulta dos relatórios diários de OS. Só leitura: o Verificador verifica no Painel de Verificação e o administrador libera ao SIF
 * no Painel de Arquivo. */
function Conteudo() {
  const { data: relatorios, isLoading, isError } = useRelatorios();
  const [escolhidoId, setEscolhidoId] = useState("");

  const lista = relatorios ?? [];
  const selecionado = lista.find((r) => r.id === escolhidoId) ?? lista[0];

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
                  {formatarData(r.data_referencia)} — {ROTULO_STATUS[r.status]} ({r.qtd_nc} NC · {r.qtd_np} NP)
                </option>
              ))}
            </Select>
            <Badge variant={BADGE_STATUS[selecionado.status]}>{ROTULO_STATUS[selecionado.status]}</Badge>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={imprimirElemento}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
            </div>
          </div>
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
