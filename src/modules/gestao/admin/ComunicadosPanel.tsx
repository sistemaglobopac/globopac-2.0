import { useState } from "react";
import { Edit, Megaphone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { ModalShell } from "../ModalShell";
import { useAppDialog } from "../dialogSystem";
import { type ComunicadoCadastrado, useComunicadosCadastrados, useSalvarComunicados } from "../api";
import { useSessionStore } from "@/store/session";

/** Aba "comunicados" — feed simples de avisos internos, lista em app_config
 * (comunicados_publicados). Sem título "Painel de Gestão" no topo (tem cabeçalho próprio, ver
 * PainelGestao.tsx / ABAS_SEM_TITULO). */
export function ComunicadosPanel() {
  const dialog = useAppDialog();
  const perfil = useSessionStore((s) => s.perfil);
  const { data: comunicados, isLoading } = useComunicadosCadastrados();
  const salvar = useSalvarComunicados();

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<ComunicadoCadastrado | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");

  function abrirModal(item?: ComunicadoCadastrado) {
    setEditando(item ?? null);
    setTitulo(item?.titulo ?? "");
    setMensagem(item?.mensagem ?? "");
    setModalAberto(true);
  }

  async function salvarItem() {
    if (!titulo.trim() || !mensagem.trim()) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Preencha título e mensagem do comunicado.", icone: "warning" });
      return;
    }
    const lista = comunicados ?? [];
    const novoItem: ComunicadoCadastrado = {
      id: editando?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      mensagem: mensagem.trim(),
      autor: editando?.autor ?? perfil?.nomeCompleto ?? "Administrador",
      criadoEm: editando?.criadoEm ?? new Date().toISOString(),
    };
    const novaLista = editando ? lista.map((c) => (c.id === editando.id ? novoItem : c)) : [novoItem, ...lista];
    try {
      await salvar.mutateAsync(novaLista);
      dialog.sucesso(editando ? "Comunicado atualizado." : "Comunicado publicado.");
      setModalAberto(false);
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar comunicado");
    }
  }

  function confirmarExcluir(item: ComunicadoCadastrado) {
    dialog.confirm({
      titulo: "Excluir comunicado",
      mensagem: `Tem certeza que deseja excluir "${item.titulo}"?`,
      icone: "error",
      aoConfirmar: async () => {
        try {
          await salvar.mutateAsync((comunicados ?? []).filter((c) => c.id !== item.id));
          dialog.sucesso("Comunicado excluído.");
        } catch (erro) {
          dialog.erro(erro, "Falha ao excluir comunicado");
        }
      },
    });
  }

  const ordenados = [...(comunicados ?? [])].sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: "1px solid #dfe2e7" }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Megaphone className="h-7 w-7 shrink-0" style={{ color: "#6a5fc1" }} />
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#1f1633" }}>
              Comunicados
            </h2>
            <p className="text-sm" style={{ color: "#79628c" }}>Avisos internos publicados para toda a equipe.</p>
          </div>
        </div>
        <Button type="button" style={{ background: "#6a5fc1", color: "#fff" }} onClick={() => abrirModal()}>
          <Plus className="h-4 w-4" /> Novo Comunicado
        </Button>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "#79628c" }}>Carregando…</p>}
      {!isLoading && ordenados.length === 0 && <p className="text-sm" style={{ color: "#79628c" }}>Nenhum comunicado publicado.</p>}

      <div className="space-y-3">
        {ordenados.map((item) => (
          <article key={item.id} className="rounded-xl p-4" style={{ border: "1px solid #dfe2e7" }}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold" style={{ color: "#1f1633" }}>
                {item.titulo}
              </h3>
              <div className="flex shrink-0 gap-1.5">
                <Button type="button" variant="outline" size="sm" aria-label={`Editar ${item.titulo}`} onClick={() => abrirModal(item)}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Excluir ${item.titulo}`}
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => confirmarExcluir(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm" style={{ color: "#1f1633" }}>
              {item.mensagem}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#79628c" }}>
              {item.autor} · {new Date(item.criadoEm).toLocaleString("pt-BR")}
            </p>
          </article>
        ))}
      </div>

      {modalAberto && (
        <ModalShell
          titulo={editando ? "Editar Comunicado" : "Novo Comunicado"}
          onClose={() => setModalAberto(false)}
          rodape={
            <>
              <Button type="button" variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button type="button" style={{ background: "#6a5fc1", color: "#fff" }} disabled={salvar.isPending} onClick={salvarItem}>
                {salvar.isPending ? "Salvando…" : "Publicar"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="titulo-comunicado">Título</Label>
              <Input id="titulo-comunicado" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mensagem-comunicado">Mensagem</Label>
              <Textarea id="mensagem-comunicado" rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
