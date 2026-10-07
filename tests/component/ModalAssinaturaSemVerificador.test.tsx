import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { atualizarPerfilOnline, limparCredenciais } from "@/lib/credencialOffline";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { useSessionStore, type PerfilSessao } from "@/store/session";

const INSPETOR: PerfilSessao = { id: "user-antigo", nomeCompleto: "Ana", nivelAcesso: "INSPETOR_QUALIDADE", setoresPermitidos: ["SALA_CORTES"], matricula: "777" };

function definirOnline(valor: boolean) {
  Object.defineProperty(navigator, "onLine", { value: valor, configurable: true });
}

describe("confirmação sem internet em aparelho sem o verificador da senha", () => {
  beforeEach(async () => {
    await limparCredenciais();
    await atualizarPerfilOnline(INSPETOR); // só o perfil: nunca houve login que guardasse o verificador
    useSessionStore.setState({ perfil: INSPETOR });
    definirOnline(false);
  });
  afterEach(() => {
    definirOnline(true);
    useSessionStore.setState({ perfil: null });
  });

  it("avisa, não pede senha e deixa salvar na fila (a ficha não se perde)", async () => {
    const onAssinar = vi.fn().mockResolvedValue(undefined);
    render(<ModalAssinaturaSenha descricao="Confirme." onAssinar={onAssinar} onCancelar={() => undefined} />);

    expect(await screen.findByTestId("aviso-sem-verificador")).toHaveTextContent("sem a confirmação com senha");
    expect(screen.queryByLabelText(/Sua senha/)).not.toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "Salvar na fila" });
    expect(botao).toBeEnabled();

    await userEvent.click(botao);
    await waitFor(() => expect(onAssinar).toHaveBeenCalledWith({ modo: "sem_verificador" }));
  });
});
