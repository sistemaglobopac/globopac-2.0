import { useState } from "react";
import {
  useMonitoramentosPendentesVerificacao,
  useVerificarMonitoramento,
  type MonitoramentoPendente,
} from "./api";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";

type Severidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export function VerificacaoPage() {
  const { data: pendentes, isLoading } = useMonitoramentosPendentesVerificacao();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Verificação</h1>

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && pendentes?.length === 0 && (
        <p className="text-muted-foreground">Nenhum monitoramento pendente de verificação.</p>
      )}

      {pendentes?.map((m) => (
        <MonitoramentoPendenteCard key={m.id} monitoramento={m} />
      ))}
    </div>
  );
}

function MonitoramentoPendenteCard({ monitoramento: m }: { monitoramento: MonitoramentoPendente }) {
  const [mostrarReprovacao, setMostrarReprovacao] = useState(false);
  const [severidade, setSeveridade] = useState<Severidade>("MEDIA");
  const [descricao, setDescricao] = useState("");
  const verificar = useVerificarMonitoramento();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            {m.nomeTemplate} · <Badge variant="outline">{m.setor}</Badge>
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {new Date(m.criado_em).toLocaleString("pt-BR")}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(m.dados_dinamicos).map(([chave, valor]) => (
            <div key={chave}>
              <dt className="text-muted-foreground">{chave}</dt>
              <dd>{String(valor)}</dd>
            </div>
          ))}
        </dl>

        {mostrarReprovacao && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <Select value={severidade} onChange={(e) => setSeveridade(e.target.value as Severidade)}>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </Select>
            <Textarea
              placeholder="Descrição da não conformidade (opcional)"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        )}

        {verificar.isError && (
          <p className="mt-2 text-sm text-destructive">Falha ao registrar a verificação.</p>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        {!mostrarReprovacao ? (
          <>
            <Button
              variant="default"
              disabled={verificar.isPending}
              onClick={() => verificar.mutate({ monitoramentoId: m.id, decisao: "aprovar" })}
            >
              Aprovar e assinar
            </Button>
            <Button variant="destructive" onClick={() => setMostrarReprovacao(true)}>
              Reprovar
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="destructive"
              disabled={verificar.isPending}
              onClick={() =>
                verificar.mutate({
                  monitoramentoId: m.id,
                  decisao: "reprovar",
                  severidade,
                  descricao: descricao || undefined,
                })
              }
            >
              Confirmar reprovação (abre RNC)
            </Button>
            <Button variant="outline" onClick={() => setMostrarReprovacao(false)}>
              Cancelar
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
