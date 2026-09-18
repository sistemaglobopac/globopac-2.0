import { useAlertaCarimboHoras, useFilaCarimbo, useProcessarFilaAgora } from "./api";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Pendente",
  processando: "Processando",
  concluido: "Concluído",
  falhou_definitivo: "Falhou definitivamente",
};

function horasDesde(dataIso: string): number {
  return (Date.now() - new Date(dataIso).getTime()) / (1000 * 60 * 60);
}

/** Painel de pendências de carimbo (seção 7.5 do PROMPT MESTRE) — mostra o estado da fila de
 * carimbo RFC 3161 e destaca itens pendentes há mais do que o limiar configurado. O
 * processamento em si é assíncrono (worker via pg_cron); este botão só força uma rodada
 * imediata, útil para operação manual e para não depender de esperar o próximo minuto. */
export function CarimbosPendentesPage() {
  const { data: itens, isLoading } = useFilaCarimbo();
  const { data: alertaHoras } = useAlertaCarimboHoras();
  const processar = useProcessarFilaAgora();

  const porStatus = (itens ?? []).reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const limiar = alertaHoras ?? 4;
  const pendentesAlertando = (itens ?? []).filter(
    (i) => i.status === "pendente" && horasDesde(i.criado_em) > limiar
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Carimbos de tempo — pendências</h1>
        <Button onClick={() => processar.mutate()} disabled={processar.isPending}>
          {processar.isPending ? "Processando…" : "Processar agora"}
        </Button>
      </div>

      {processar.data && (
        <p className="text-sm text-muted-foreground">
          Última rodada: {processar.data.processados} processados, {processar.data.concluidos} concluídos,{" "}
          {processar.data.falharam} continuam pendentes/falharam.
        </p>
      )}
      {processar.isError && <p className="text-sm text-destructive">Falha ao processar a fila.</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(ROTULO_STATUS).map(([chave, rotulo]) => (
          <Card key={chave} className="glass-kpi rounded-xl border-white/65 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] font-normal text-muted-foreground">{rotulo}</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-[26px] font-medium leading-tight text-ink">
              {porStatus[chave] ?? 0}
            </CardContent>
          </Card>
        ))}
      </div>

      {pendentesAlertando.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="text-base text-warning">
              {pendentesAlertando.length} carimbo(s) pendente(s) há mais de {limiar}h
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      <Card className="glass-panel rounded-xl border-white/70">
        <CardHeader>
          <CardTitle className="text-base">Itens recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Carregando…</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-1">Tipo</th>
                <th>Status</th>
                <th>Tentativas</th>
                <th>Criado em</th>
                <th>Último erro</th>
              </tr>
            </thead>
            <tbody>
              {itens?.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="py-1">{item.tipo_assinatura}</td>
                  <td>
                    <Badge
                      variant={
                        item.status === "concluido"
                          ? "success"
                          : item.status === "falhou_definitivo"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {ROTULO_STATUS[item.status]}
                    </Badge>
                  </td>
                  <td>{item.tentativas}</td>
                  <td>{new Date(item.criado_em).toLocaleString("pt-BR")}</td>
                  <td className="max-w-xs truncate text-muted-foreground" title={item.ultimo_erro ?? ""}>
                    {item.ultimo_erro ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
