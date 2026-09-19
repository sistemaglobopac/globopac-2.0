import { useState } from "react";
import { Edit, Landmark, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { ModalShell } from "../ModalShell";
import { useAppDialog } from "../dialogSystem";
import { type CentroCusto, useCentrosCusto, useExcluirCentroCusto, useSalvarCentroCusto } from "../api";

/** Aba "admin_areas" — Áreas de Inspeção / PCM (Centros de Custo). Ao contrário de setores,
 * equipamentos e desvios (listas simples em app_config), esta é uma tabela relacional de
 * verdade (`centros_custo`, já existente desde a Fase 1 para o módulo de PCM/manutenção). */
export function AreasAdminPanel() {
  const dialog = useAppDialog();
  const { data: areas, isLoading } = useCentrosCusto();
  const salvar = useSalvarCentroCusto();
  const excluir = useExcluirCentroCusto();

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<CentroCusto | null>(null);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");

  function abrirModal(area?: CentroCusto) {
    setEditando(area ?? null);
    setCodigo(area?.codigo ?? "");
    setNome(area?.nome ?? "");
    setModalAberto(true);
  }

  async function salvarArea() {
    if (!codigo.trim() || !nome.trim()) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Informe código e nome da área.", icone: "warning" });
      return;
    }
    try {
      await salvar.mutateAsync({ id: editando?.id ?? null, codigo: codigo.trim(), nome: nome.trim() });
      dialog.sucesso(editando ? "Área atualizada." : "Área cadastrada.");
      setModalAberto(false);
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar área");
    }
  }

  function confirmarExcluir(area: CentroCusto) {
    dialog.confirm({
      titulo: "Excluir área",
      mensagem: `Tem certeza que deseja excluir a área "${area.nome}" (${area.codigo})?`,
      icone: "error",
      aoConfirmar: () => {
        excluir.mutate(area.id, {
          onSuccess: () => dialog.sucesso("Área excluída."),
          onError: (erro) => dialog.erro(erro, "Falha ao excluir área"),
        });
      },
    });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Landmark className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-ink">Áreas e Custos</h2>
            <p className="text-sm text-muted-foreground">Centros de custo usados para vincular Ordens de Serviço do PCM.</p>
          </div>
        </div>
        <Button type="button" onClick={() => abrirModal()}>
          <Plus className="h-4 w-4" /> Nova Área
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-surface-soft">
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(areas ?? []).map((area) => (
              <tr key={area.id} className="border-t border-hairline">
                <td className="px-4 py-2 font-mono text-ink">{area.codigo}</td>
                <td className="px-4 py-2 font-bold text-ink">{area.nome}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="outline" size="sm" aria-label={`Editar ${area.nome}`} onClick={() => abrirModal(area)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Excluir ${area.nome}`}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => confirmarExcluir(area)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && (areas ?? []).length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma área cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalShell
          titulo={editando ? "Editar Área" : "Nova Área"}
          onClose={() => setModalAberto(false)}
          rodape={
            <>
              <Button type="button" variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={salvar.isPending} onClick={salvarArea}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-area">Código do Centro de Custo</Label>
              <Input id="codigo-area" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome-area">Nome da Área</Label>
              <Input id="nome-area" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
