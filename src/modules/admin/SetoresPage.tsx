import { useState, type FormEvent } from "react";
import { MapPin, Plus, Edit, Trash2, X, AlertTriangle } from "lucide-react";
import { useSetoresCadastrados, useSalvarSetores } from "./api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

/** Gestão de Setores: setor não é uma entidade com id, é a própria string dentro de
 * app_config.setores_cadastrados — editar substitui a ocorrência exata da string antiga pela
 * nova no array (ver aviso no modal sobre o que isso NÃO propaga). */
export function SetoresPage() {
  const { data: setores, isLoading } = useSetoresCadastrados();
  const salvar = useSalvarSetores();

  const [showModal, setShowModal] = useState(false);
  const [nome, setNome] = useState("");
  const [editandoOriginal, setEditandoOriginal] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  const setoresAtuais = setores ?? [];

  function abrirModal(setor?: string) {
    setEditandoOriginal(setor ?? null);
    setNome(setor ?? "");
    setShowModal(true);
  }

  function fecharModal() {
    setShowModal(false);
    setEditandoOriginal(null);
    setNome("");
  }

  async function handleSalvarSetor(e: FormEvent) {
    e.preventDefault();
    const nomeTrimado = nome.trim();
    if (!nomeTrimado) return;

    if (editandoOriginal && editandoOriginal === nomeTrimado) {
      fecharModal();
      return;
    }

    if (setoresAtuais.includes(nomeTrimado)) {
      setMensagem({ tipo: "error", texto: `O setor "${nomeTrimado}" já está cadastrado na lista.` });
      return;
    }

    const novosSetores = editandoOriginal
      ? setoresAtuais.map((s) => (s === editandoOriginal ? nomeTrimado : s))
      : [...setoresAtuais, nomeTrimado];

    try {
      await salvar.mutateAsync(novosSetores);
      setMensagem({ tipo: "success", texto: editandoOriginal ? "Setor renomeado com sucesso." : "Setor cadastrado com sucesso." });
      fecharModal();
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao salvar o setor." });
    }
  }

  async function handleExcluirSetor(setor: string) {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir permanentemente o setor "${setor}"? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    try {
      await salvar.mutateAsync(setoresAtuais.filter((s) => s !== setor));
      setMensagem({ tipo: "success", texto: `O setor "${setor}" foi excluído.` });
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao excluir o setor." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex items-start gap-3">
            <MapPin className="h-7 w-7 shrink-0 text-primary" />
            <div>
              <CardTitle className="text-xl">Gestão de Setores</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Cadastre, edite ou remova os setores operacionais da planta.</p>
            </div>
          </div>
          <Button onClick={() => abrirModal()}>
            <Plus className="h-4 w-4" />
            Novo Setor
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {mensagem && (
            <div
              className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
                mensagem.tipo === "success" ? "border-success bg-success/10 text-foreground" : "border-destructive bg-destructive/10 text-destructive"
              }`}
            >
              <span>{mensagem.texto}</span>
              <button type="button" onClick={() => setMensagem(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Fechar mensagem">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          <div className="overflow-x-auto rounded-lg border shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Nome do Setor</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {setoresAtuais.map((setor) => (
                  <tr key={setor} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2 font-bold">{setor}</td>
                    <td className="px-4 py-2">
                      <Badge variant="success">Ativo</Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => abrirModal(setor)} aria-label={`Editar ${setor}`}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => handleExcluirSetor(setor)}
                          aria-label={`Excluir ${setor}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && setoresAtuais.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhum setor cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-semibold">{editandoOriginal ? "Editar Setor" : "Novo Setor"}</h2>
              <button type="button" onClick={fecharModal} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSalvarSetor} className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="nomeSetor">Nome do Setor</Label>
                <Input
                  id="nomeSetor"
                  required
                  autoFocus
                  placeholder="Ex: Abate, Manutenção..."
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              {editandoOriginal && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Renomear só muda o nome usado daqui pra frente — fichas, monitoramentos, RNCs, ordens de serviço e
                  permissões de usuários que já referenciam "{editandoOriginal}" continuam com o nome antigo.
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={fecharModal}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvar.isPending}>
                  {salvar.isPending ? "Salvando..." : editandoOriginal ? "Salvar Alterações" : "Cadastrar Setor"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
