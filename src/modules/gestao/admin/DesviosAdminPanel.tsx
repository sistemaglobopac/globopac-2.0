import { useState } from "react";
import { AlertTriangle, Edit, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { ModalShell } from "../ModalShell";
import { useAppDialog } from "../dialogSystem";
import { COR_GRUPO_DESVIO, type DesvioCadastrado, GRUPOS_DESVIO, type GrupoDesvio, useDesviosCadastrados, useSalvarDesvios } from "../api";

/** Aba "desvios" — Motivos de Desvio (classificação de paradas/não conformidades), lista
 * simples em app_config (desvios_cadastrados). */
export function DesviosAdminPanel() {
  const dialog = useAppDialog();
  const { data: desvios, isLoading } = useDesviosCadastrados();
  const salvar = useSalvarDesvios();

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<DesvioCadastrado | null>(null);
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState<GrupoDesvio>(GRUPOS_DESVIO[0]);

  function abrirModal(item?: DesvioCadastrado) {
    setEditando(item ?? null);
    setNome(item?.nome ?? "");
    setGrupo(item?.grupo ?? GRUPOS_DESVIO[0]);
    setModalAberto(true);
  }

  async function salvarItem() {
    if (!nome.trim()) {
      dialog.alert({ titulo: "Campo obrigatório", mensagem: "Informe o nome/motivo do desvio.", icone: "warning" });
      return;
    }
    const lista = desvios ?? [];
    const novoItem: DesvioCadastrado = { id: editando?.id ?? crypto.randomUUID(), nome: nome.trim(), grupo };
    const novaLista = editando ? lista.map((d) => (d.id === editando.id ? novoItem : d)) : [...lista, novoItem];
    try {
      await salvar.mutateAsync(novaLista);
      dialog.sucesso(editando ? "Motivo atualizado." : "Motivo cadastrado.");
      setModalAberto(false);
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar motivo de desvio");
    }
  }

  function confirmarExcluir(item: DesvioCadastrado) {
    dialog.confirm({
      titulo: "Excluir motivo de desvio",
      mensagem: `Tem certeza que deseja excluir "${item.nome}"?`,
      icone: "error",
      aoConfirmar: async () => {
        try {
          await salvar.mutateAsync((desvios ?? []).filter((d) => d.id !== item.id));
          dialog.sucesso("Motivo excluído.");
        } catch (erro) {
          dialog.erro(erro, "Falha ao excluir motivo de desvio");
        }
      },
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-ink">Gestão de Motivos de Desvio</h2>
            <p className="text-sm text-muted-foreground">Classificação de paradas e não conformidades usada em todo o sistema.</p>
          </div>
        </div>
        <Button type="button" onClick={() => abrirModal()}>
          <Plus className="h-4 w-4" /> Novo Motivo
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-surface-soft">
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Motivo/Categoria</th>
              <th className="px-4 py-2">Grupo/Classificação</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(desvios ?? []).map((item) => (
              <tr key={item.id} className="border-t border-hairline">
                <td className="px-4 py-2 font-bold text-ink">{item.nome}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_GRUPO_DESVIO[item.grupo]}`}>
                    {item.grupo}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="outline" size="sm" aria-label={`Editar ${item.nome}`} onClick={() => abrirModal(item)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Excluir ${item.nome}`}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => confirmarExcluir(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (desvios ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum motivo cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalShell
          titulo={editando ? "Editar Motivo" : "Novo Motivo"}
          onClose={() => setModalAberto(false)}
          rodape={
            <>
              <Button type="button" variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={salvar.isPending} onClick={salvarItem}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome-desvio">Motivo</Label>
              <Input id="nome-desvio" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grupo-desvio">Grupo (Natureza)</Label>
              <Select id="grupo-desvio" value={grupo} onChange={(e) => setGrupo(e.target.value as GrupoDesvio)}>
                {GRUPOS_DESVIO.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
