import { useState } from "react";
import { Cog, Edit, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { ModalShell } from "../ModalShell";
import { useAppDialog } from "../dialogSystem";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { type EquipamentoCadastrado, useEquipamentosCadastrados, useSalvarEquipamentos } from "../api";

/** Aba "equipamentos" — lista simples em app_config (chave equipamentos_cadastrados), mesmo
 * padrão de setores_cadastrados: um único array reescrito por inteiro a cada operação. */
export function EquipamentosAdminPanel() {
  const dialog = useAppDialog();
  const { data: equipamentos, isLoading } = useEquipamentosCadastrados();
  const { data: setores } = useSetoresCadastrados();
  const salvar = useSalvarEquipamentos();

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<EquipamentoCadastrado | null>(null);
  const [codigo, setCodigo] = useState("");
  const [tag, setTag] = useState("");
  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState("");

  function abrirModal(item?: EquipamentoCadastrado) {
    setEditando(item ?? null);
    setCodigo(item?.codigo ?? "");
    setTag(item?.tag ?? "");
    setNome(item?.nome ?? "");
    setSetor(item?.setor ?? "");
    setModalAberto(true);
  }

  async function salvarItem() {
    if (!nome.trim() || !setor) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Informe ao menos o nome do equipamento e o setor.", icone: "warning" });
      return;
    }
    const lista = equipamentos ?? [];
    const novoItem: EquipamentoCadastrado = { id: editando?.id ?? crypto.randomUUID(), codigo: codigo.trim(), tag: tag.trim(), nome: nome.trim(), setor };
    const novaLista = editando ? lista.map((e) => (e.id === editando.id ? novoItem : e)) : [...lista, novoItem];
    try {
      await salvar.mutateAsync(novaLista);
      dialog.sucesso(editando ? "Equipamento atualizado." : "Equipamento cadastrado.");
      setModalAberto(false);
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar equipamento");
    }
  }

  function confirmarExcluir(item: EquipamentoCadastrado) {
    dialog.confirm({
      titulo: "Excluir equipamento",
      mensagem: `Tem certeza que deseja excluir "${item.nome}"?`,
      icone: "error",
      aoConfirmar: async () => {
        try {
          await salvar.mutateAsync((equipamentos ?? []).filter((e) => e.id !== item.id));
          dialog.sucesso("Equipamento excluído.");
        } catch (erro) {
          dialog.erro(erro, "Falha ao excluir equipamento");
        }
      },
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Cog className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-ink">Gestão de Equipamentos</h2>
            <p className="text-sm text-muted-foreground">Catálogo de equipamentos por setor, usado nos apontamentos e no PCM.</p>
          </div>
        </div>
        <Button type="button" onClick={() => abrirModal()}>
          <Plus className="h-4 w-4" /> Novo Equipamento
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-surface-soft">
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">TAG</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Setor</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(equipamentos ?? []).map((item) => (
              <tr key={item.id} className="border-t border-hairline">
                <td className="px-4 py-2 text-ink">{item.codigo || "—"}</td>
                <td className="px-4 py-2 font-mono text-ink">{item.tag || "—"}</td>
                <td className="px-4 py-2 font-bold text-ink">{item.nome}</td>
                <td className="px-4 py-2 text-ink">{item.setor}</td>
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
            {!isLoading && (equipamentos ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum equipamento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalShell
          titulo={editando ? "Editar Equipamento" : "Novo Equipamento"}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codigo-equip">Código</Label>
                <Input id="codigo-equip" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tag-equip">TAG</Label>
                <Input id="tag-equip" value={tag} onChange={(e) => setTag(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome-equip">Nome do Equipamento</Label>
              <Input id="nome-equip" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setor-equip">Setor</Label>
              <Select id="setor-equip" value={setor} onChange={(e) => setSetor(e.target.value)}>
                <option value="">Selecione…</option>
                {(setores ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
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
