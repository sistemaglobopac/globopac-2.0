import { useState } from "react";
import { PROXIMA_ETAPA, useAvancarEtapaOs, useLiberarRelatorioOsSif, useOsDoSetor, type Os } from "./api";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const RENOME_STATUS: Record<Os["status"], string> = {
  ABERTURA: "Aberta",
  AUTORIZACAO: "Autorizada",
  PROGRAMACAO: "Programada",
  EXECUCAO: "Em execução",
  VALIDACAO: "Validação",
  CONCLUIDA: "Concluída",
};

function CartaoOs({ os }: { os: Os }) {
  const avancar = useAvancarEtapaOs();
  const proximaEtapa = PROXIMA_ETAPA[os.status];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline">{os.setor}</Badge>
          <Badge variant={os.status === "CONCLUIDA" ? "success" : "default"}>{RENOME_STATUS[os.status]}</Badge>
          {os.liberado_sif && <Badge variant="secondary">Liberada ao SIF</Badge>}
        </CardTitle>
        {os.ativo_referencia && (
          <p className="text-xs text-muted-foreground">Ativo: {os.ativo_referencia}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{os.descricao}</p>

        {proximaEtapa && !os.liberado_sif && (
          <Button
            size="sm"
            onClick={() => avancar.mutate({ osId: os.id, tipo: proximaEtapa.tipo })}
            disabled={avancar.isPending}
          >
            {avancar.isPending ? "Registrando…" : proximaEtapa.rotulo}
          </Button>
        )}
        {avancar.isError && <p className="text-sm text-destructive">Falha ao avançar a etapa.</p>}
      </CardContent>
    </Card>
  );
}

/** Painel PCM/OS (seção 7.4) — INSPETOR_PCM/ADMIN_MASTER acompanham o ciclo completo da OS
 * (RLS já restringe ao próprio setor desde a Fase 0) e liberam o relatório diário ao SIF. */
export function PainelOsPage() {
  const { data: todasOs, isLoading } = useOsDoSetor();
  const [dataRelatorio, setDataRelatorio] = useState(() => new Date().toISOString().slice(0, 10));
  const liberarRelatorio = useLiberarRelatorioOsSif();

  const pendentes = (todasOs ?? []).filter((os) => !os.liberado_sif);
  const concluidasNaoLiberadas = pendentes.filter((os) => os.status === "CONCLUIDA");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ordens de Serviço</h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o ciclo ABERTURA → AUTORIZACAO → PROGRAMACAO → EXECUCAO → VALIDACAO →
          CONCLUIDA. Cada etapa gera uma assinatura eletrônica própria.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Liberação diária ao SIF</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {concluidasNaoLiberadas.length} OS concluída(s) e ainda não liberada(s) no total.
            Informe a data de referência (baseada em quando a OS foi concluída) e libere o
            relatório do dia.
          </p>
          <div className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="data_relatorio">Data de referência</Label>
              <Input
                id="data_relatorio"
                type="date"
                value={dataRelatorio}
                onChange={(e) => setDataRelatorio(e.target.value)}
              />
            </div>
            <Button onClick={() => liberarRelatorio.mutate(dataRelatorio)} disabled={liberarRelatorio.isPending}>
              {liberarRelatorio.isPending ? "Liberando…" : "Liberar relatório do dia"}
            </Button>
          </div>
          {liberarRelatorio.isSuccess && (
            <p className="text-sm text-success">
              Relatório {liberarRelatorio.data.relatorio_id} liberado:{" "}
              {liberarRelatorio.data.quantidade_liberada} OS.
            </p>
          )}
          {liberarRelatorio.isError && (
            <p className="text-sm text-destructive">
              Falha ao liberar — confira se há OS concluídas e não liberadas nessa data.
            </p>
          )}
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && pendentes.length === 0 && (
        <p className="text-muted-foreground">Nenhuma OS pendente.</p>
      )}
      {pendentes.map((os) => (
        <CartaoOs key={os.id} os={os} />
      ))}
    </div>
  );
}
