import { useMemo, useState } from "react";
import { CheckCircle2, Megaphone, Send, Users } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useAppDialog } from "../dialogSystem";
import { useInspetoresTrocaSetor } from "../api";
import { useComunicadosEnviados, useEnviarComunicado } from "@/modules/comunicados/api";

/** Comunicados do Administrador/Verificador: envio para toda a equipe (inspetores ativos) ou para
 * inspetores selecionados. Cada destinatário recebe um alerta com som na tela, em qualquer página,
 * que só fecha quando ele confirma a leitura — o histórico abaixo mostra quem já confirmou. */
export function ComunicadosPanel() {
  const dialog = useAppDialog();
  const { data: inspetores } = useInspetoresTrocaSetor();
  const { data: enviados, isLoading } = useComunicadosEnviados();
  const enviar = useEnviarComunicado();

  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [paraTodos, setParaTodos] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const nomes = useMemo(() => new Map((inspetores ?? []).map((i) => [i.id, i.nome_completo])), [inspetores]);

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function enviarComunicado() {
    if (!titulo.trim() || !mensagem.trim()) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Preencha título e mensagem do comunicado.", icone: "warning" });
      return;
    }
    if (!paraTodos && selecionados.size === 0) {
      dialog.alert({ titulo: "Destinatários", mensagem: "Selecione ao menos um inspetor ou envie para toda a equipe.", icone: "warning" });
      return;
    }
    try {
      await enviar.mutateAsync({ titulo: titulo.trim(), mensagem: mensagem.trim(), paraTodos, destinatarios: [...selecionados] });
      dialog.sucesso("Comunicado enviado. O alerta já abriu na tela dos inspetores.");
      setTitulo("");
      setMensagem("");
      setSelecionados(new Set());
    } catch (erro) {
      dialog.erro(erro, "Falha ao enviar comunicado");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <Megaphone className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-ink">Comunicados</h2>
            <p className="text-sm text-muted-foreground">
              O inspetor recebe um alerta com som na tela, em qualquer página, e só fecha depois de confirmar a leitura.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titulo-comunicado">Título</Label>
            <Input id="titulo-comunicado" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mensagem-comunicado">Mensagem</Label>
            <Textarea id="mensagem-comunicado" rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Enviar para</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="destino-comunicado" checked={paraTodos} onChange={() => setParaTodos(true)} />
              Toda a equipe (todos os inspetores ativos)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="destino-comunicado" checked={!paraTodos} onChange={() => setParaTodos(false)} />
              Inspetores selecionados
            </label>
            {!paraTodos && (
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-hairline p-2 sm:grid-cols-2" data-testid="lista-destinatarios">
                {(inspetores ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum inspetor ativo encontrado.</p>}
                {(inspetores ?? []).map((i) => (
                  <label key={i.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={selecionados.has(i.id)} onChange={() => alternar(i.id)} />
                    {i.nome_completo}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <Button type="button" disabled={enviar.isPending} onClick={enviarComunicado}>
            <Send className="h-4 w-4" /> {enviar.isPending ? "Enviando…" : "Enviar comunicado"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Enviados</h3>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && (enviados ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum comunicado enviado.</p>}
        <div className="space-y-3">
          {(enviados ?? []).map((c) => {
            const dest = c.comunicados_alerta_destinatarios;
            const lidos = dest.filter((d) => d.lido_em).length;
            const pendentes = dest.filter((d) => !d.lido_em);
            return (
              <article key={c.id} className="rounded-xl border border-hairline p-4">
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-ink">{c.titulo}</h4>
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    <Users className="h-3 w-3" /> {c.para_todos ? "Toda a equipe" : "Selecionados"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink">{c.mensagem}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.autor_nome} · {new Date(c.criado_em).toLocaleString("pt-BR")}
                </p>
                <p className={`mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold ${pendentes.length === 0 ? "text-success" : "text-warning-foreground"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {lidos} de {dest.length} confirmaram a leitura
                  {pendentes.length > 0 && (
                    <span className="font-normal text-muted-foreground"> — falta: {pendentes.map((p) => nomes.get(p.user_id) ?? "Inspetor").join(", ")}</span>
                  )}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
