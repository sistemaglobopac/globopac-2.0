import { useState } from "react";
import { Bug, Edit, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { ModalShell } from "../ModalShell";
import { useAppDialog } from "../dialogSystem";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { type RegistroControlePraga, useRegistrosControlePragas, useSalvarControlePragas } from "../api";

/** Aba "controle_pragas" — módulo externo simples (registro de ocorrências e ações de
 * controle de pragas), lista em app_config (controle_pragas_registros). Sem título "Painel de
 * Gestão" no cabeçalho: tem título próprio aqui mesmo. */
export function ControlePragasPanel() {
  const dialog = useAppDialog();
  const { data: registros, isLoading } = useRegistrosControlePragas();
  const { data: setores } = useSetoresCadastrados();
  const salvar = useSalvarControlePragas();

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RegistroControlePraga | null>(null);
  const [data, setData] = useState("");
  const [setor, setSetor] = useState("");
  const [tipoPraga, setTipoPraga] = useState("");
  const [acaoTomada, setAcaoTomada] = useState("");
  const [responsavel, setResponsavel] = useState("");

  function abrirModal(item?: RegistroControlePraga) {
    setEditando(item ?? null);
    setData(item?.data ?? new Date().toISOString().slice(0, 10));
    setSetor(item?.setor ?? "");
    setTipoPraga(item?.tipoPraga ?? "");
    setAcaoTomada(item?.acaoTomada ?? "");
    setResponsavel(item?.responsavel ?? "");
    setModalAberto(true);
  }

  async function salvarItem() {
    if (!setor || !tipoPraga.trim() || !acaoTomada.trim()) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Informe setor, tipo de praga e ação tomada.", icone: "warning" });
      return;
    }
    const lista = registros ?? [];
    const novoItem: RegistroControlePraga = {
      id: editando?.id ?? crypto.randomUUID(),
      data,
      setor,
      tipoPraga: tipoPraga.trim(),
      acaoTomada: acaoTomada.trim(),
      responsavel: responsavel.trim(),
    };
    const novaLista = editando ? lista.map((r) => (r.id === editando.id ? novoItem : r)) : [novoItem, ...lista];
    try {
      await salvar.mutateAsync(novaLista);
      dialog.sucesso(editando ? "Registro atualizado." : "Registro cadastrado.");
      setModalAberto(false);
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar registro");
    }
  }

  function confirmarExcluir(item: RegistroControlePraga) {
    dialog.confirm({
      titulo: "Excluir registro",
      mensagem: "Tem certeza que deseja excluir este registro de controle de pragas?",
      icone: "error",
      aoConfirmar: async () => {
        try {
          await salvar.mutateAsync((registros ?? []).filter((r) => r.id !== item.id));
          dialog.sucesso("Registro excluído.");
        } catch (erro) {
          dialog.erro(erro, "Falha ao excluir registro");
        }
      },
    });
  }

  const ordenados = [...(registros ?? [])].sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="rounded-2xl border border-hairline bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Bug className="h-7 w-7 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-ink">Controle de Pragas</h2>
            <p className="text-sm text-muted-foreground">Registro de ocorrências e ações de controle integrado de pragas.</p>
          </div>
        </div>
        <Button type="button" onClick={() => abrirModal()}>
          <Plus className="h-4 w-4" /> Novo Registro
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-surface-soft">
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">Setor</th>
              <th className="px-4 py-2">Tipo de Praga</th>
              <th className="px-4 py-2">Ação Tomada</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((item) => (
              <tr key={item.id} className="border-t border-hairline">
                <td className="px-4 py-2 text-ink">{new Date(`${item.data}T00:00:00`).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2 text-ink">{item.setor}</td>
                <td className="px-4 py-2 text-ink">{item.tipoPraga}</td>
                <td className="px-4 py-2 text-ink">{item.acaoTomada}</td>
                <td className="px-4 py-2 text-ink">{item.responsavel || "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="outline" size="sm" aria-label="Editar registro" onClick={() => abrirModal(item)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label="Excluir registro"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => confirmarExcluir(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && ordenados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhum registro cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalShell
          titulo={editando ? "Editar Registro" : "Novo Registro"}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="data-praga">Data</Label>
              <Input id="data-praga" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setor-praga">Setor</Label>
              <Select id="setor-praga" value={setor} onChange={(e) => setSetor(e.target.value)}>
                <option value="">Selecione…</option>
                {(setores ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tipo-praga">Tipo de Praga</Label>
              <Input id="tipo-praga" value={tipoPraga} onChange={(e) => setTipoPraga(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acao-praga">Ação Tomada</Label>
              <Input id="acao-praga" value={acaoTomada} onChange={(e) => setAcaoTomada(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="responsavel-praga">Responsável</Label>
              <Input id="responsavel-praga" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
