import { useState } from "react";
import { ModalShell } from "../ModalShell";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAppDialog } from "../dialogSystem";
import { useRedefinirSenhaGestao } from "../api";

export function ModalRedefinirSenha({ userId, nomeCompleto, onClose }: { userId: string; nomeCompleto: string; onClose: () => void }) {
  const dialog = useAppDialog();
  const redefinir = useRedefinirSenhaGestao();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  async function salvar() {
    if (novaSenha.length < 6) {
      dialog.alert({ titulo: "Senha inválida", mensagem: "A nova senha precisa ter pelo menos 6 caracteres.", icone: "warning" });
      return;
    }
    if (novaSenha !== confirmar) {
      dialog.alert({ titulo: "Senhas não conferem", mensagem: "A confirmação precisa ser igual à nova senha.", icone: "warning" });
      return;
    }
    try {
      await redefinir.mutateAsync({ userId, novaSenha });
      dialog.sucesso(`Senha de ${nomeCompleto} redefinida com sucesso.`);
      onClose();
    } catch (erro) {
      dialog.erro(erro, "Falha ao redefinir a senha");
    }
  }

  return (
    <ModalShell
      titulo={`Redefinir Senha — ${nomeCompleto}`}
      onClose={onClose}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" style={{ background: "#6a5fc1", color: "#fff" }} disabled={redefinir.isPending} onClick={salvar}>
            {redefinir.isPending ? "Salvando…" : "Redefinir"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nova-senha">Nova senha</Label>
          <Input id="nova-senha" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmar-senha">Confirmar senha</Label>
          <Input id="confirmar-senha" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        </div>
      </div>
    </ModalShell>
  );
}
