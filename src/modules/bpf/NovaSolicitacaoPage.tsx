import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useAppDialog } from "@/modules/gestao/dialogSystem";
import { useCentrosCusto } from "@/modules/gestao/api";
import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { DadosSolicitacao } from "./componentesBpf";
import { useAbrirSolicitacao, useSolicitacoes } from "./api";
import { CATEGORIAS_BPF } from "./tipos";

/** Data/hora atual de Manaus no formato do <input type="datetime-local"> (AAAA-MM-DDTHH:mm). */
function agoraManausParaInput(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

function Conteudo() {
  const dialog = useAppDialog();
  const { data: centros } = useCentrosCusto();
  const { data: recentes, isLoading } = useSolicitacoes({ limite: 30 });
  const abrir = useAbrirSolicitacao();

  const [centroId, setCentroId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [local, setLocal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [constatadoEm, setConstatadoEm] = useState(agoraManausParaInput);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!centroId || !categoria || descricao.trim().length < 10) {
      dialog.alert({
        titulo: "Preencha os campos obrigatórios",
        mensagem: "Informe o setor, a categoria e descreva a não conformidade (mínimo de 10 caracteres).",
        icone: "warning",
      });
      return;
    }
    abrir.mutate(
      {
        centroCustoId: centroId,
        categoria,
        descricao,
        localDetalhe: local,
        // O campo é no horário de Manaus (UTC-4, sem horário de verão).
        constatadoEm: `${constatadoEm}:00-04:00`,
      },
      {
        onSuccess: () => {
          dialog.sucesso("Solicitação enviada. Ela aguarda a assinatura de um administrador.", "Solicitação aberta");
          setDescricao("");
          setLocal("");
          setConstatadoEm(agoraManausParaInput());
        },
        onError: (erro) => dialog.erro(erro, "Não foi possível abrir a solicitação"),
      }
    );
  }

  return (
    <>
      <CabecalhoBpf
        titulo="Nova solicitação de serviço"
        descricao="Registre o que foi visto na inspeção. Um administrador assina a solicitação e, depois, o PCM programa o serviço."
        acoes={
          <Button asChild variant="outline" size="sm">
            <Link to="/bpf">Voltar à verificação diária</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>O que foi encontrado</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bpf-centro">Setor / área (centro de custo)</Label>
                <Select id="bpf-centro" value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {(centros ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.codigo})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bpf-categoria">Tipo de não conformidade</Label>
                <Select id="bpf-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Selecione…</option>
                  {CATEGORIAS_BPF.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpf-local">Onde exatamente (opcional)</Label>
              <Input
                id="bpf-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex.: acima do escaldador de cabeça, lado da parede"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpf-descricao">Descrição da não conformidade</Label>
              <Textarea
                id="bpf-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Descreva o que foi visto: avaria, oxidação, vazamento, solda não sanitária, falta de iluminação…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpf-quando">Data e hora da constatação</Label>
              <Input
                id="bpf-quando"
                type="datetime-local"
                value={constatadoEm}
                max={agoraManausParaInput()}
                onChange={(e) => setConstatadoEm(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button type="submit" disabled={abrir.isPending}>
              {abrir.isPending ? "Enviando…" : "Enviar para aprovação"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Solicitações recentes</h2>
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && (recentes ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma solicitação aberta ainda.</p>}
        {(recentes ?? []).map((ss) => (
          <Card key={ss.id}>
            <CardContent className="p-4">
              <DadosSolicitacao ss={ss} mostrarAssinatura />
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  );
}

export function NovaSolicitacaoPage() {
  return (
    <PaginaBpf>
      <Conteudo />
    </PaginaBpf>
  );
}
