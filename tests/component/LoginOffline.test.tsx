import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { atualizarPerfilOnline, limparCredenciais, registrarLoginOnline } from "@/lib/credencialOffline";
import { LoginPage } from "@/modules/auth/LoginPage";
import { ReconectarModal } from "@/modules/auth/ReconectarModal";
import * as loginServidor from "@/modules/auth/loginServidor";
import { useSessionStore, type PerfilSessao } from "@/store/session";

const INSPETOR: PerfilSessao = { id: "user-1", nomeCompleto: "Joana Inspetora", nivelAcesso: "INSPETOR_QUALIDADE", setoresPermitidos: ["SALA_CORTES"] };

function definirOnline(valor: boolean) {
  Object.defineProperty(navigator, "onLine", { value: valor, configurable: true });
}

function telaDeLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("login sem internet (inspetor)", () => {
  beforeEach(async () => {
    await limparCredenciais();
    useSessionStore.setState({ perfil: null, acessoOffline: null });
  });

  afterEach(() => {
    definirOnline(true);
    vi.restoreAllMocks();
    useSessionStore.setState({ perfil: null, acessoOffline: null });
  });

  it("sem internet, quem já entrou neste aparelho com internet entra com matrícula e senha", async () => {
    await registrarLoginOnline({ userId: INSPETOR.id, matricula: "1234", senha: "segredo-123" });
    await atualizarPerfilOnline(INSPETOR);
    definirOnline(false);
    const servidor = vi.spyOn(loginServidor, "loginNoServidor");

    telaDeLogin();
    expect(screen.getByText(/Sem conexão: se você já entrou neste aparelho/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Matrícula"), "1234");
    await userEvent.type(screen.getByLabelText("Senha"), "segredo-123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(useSessionStore.getState().perfil?.id).toBe(INSPETOR.id));
    expect(useSessionStore.getState().acessoOffline?.matricula).toBe("1234");
    expect(servidor).not.toHaveBeenCalled();
  });

  it("sem internet e sem login prévio neste aparelho, explica o que fazer", async () => {
    definirOnline(false);
    telaDeLogin();
    await userEvent.type(screen.getByLabelText("Matrícula"), "1234");
    await userEvent.type(screen.getByLabelText("Senha"), "segredo-123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText(/Entre com internet pelo menos uma vez/)).toBeInTheDocument();
    expect(useSessionStore.getState().perfil).toBeNull();
  });

  it("'online' mas o servidor não responde: também cai no acesso offline", async () => {
    await registrarLoginOnline({ userId: INSPETOR.id, matricula: "1234", senha: "segredo-123" });
    await atualizarPerfilOnline(INSPETOR);
    vi.spyOn(loginServidor, "loginNoServidor").mockResolvedValue({ tipo: "sem_rede" });

    telaDeLogin();
    await userEvent.type(screen.getByLabelText("Matrícula"), "1234");
    await userEvent.type(screen.getByLabelText("Senha"), "segredo-123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(useSessionStore.getState().acessoOffline).not.toBeNull());
  });

  it("senha errada sem internet não abre o app", async () => {
    await registrarLoginOnline({ userId: INSPETOR.id, matricula: "1234", senha: "segredo-123" });
    await atualizarPerfilOnline(INSPETOR);
    definirOnline(false);

    telaDeLogin();
    await userEvent.type(screen.getByLabelText("Matrícula"), "1234");
    await userEvent.type(screen.getByLabelText("Senha"), "errada");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Matrícula ou senha inválidos.")).toBeInTheDocument();
    expect(useSessionStore.getState().perfil).toBeNull();
  });
});

describe("reconectar quando a rede volta", () => {
  afterEach(() => {
    definirOnline(true);
    vi.restoreAllMocks();
    useSessionStore.setState({ perfil: null, acessoOffline: null });
  });

  it("só aparece para quem entrou pelo acesso offline E com a rede de volta", () => {
    useSessionStore.setState({ perfil: INSPETOR, acessoOffline: { matricula: "1234", validoAte: "2026-10-14T12:00:00.000Z" } });
    definirOnline(false);
    const { unmount } = render(<ReconectarModal />);
    expect(screen.queryByTestId("modal-reconectar")).not.toBeInTheDocument();
    unmount();

    definirOnline(true);
    render(<ReconectarModal />);
    expect(screen.getByTestId("modal-reconectar")).toBeInTheDocument();
  });

  it("não aparece para quem tem sessão normal", () => {
    useSessionStore.setState({ perfil: INSPETOR, acessoOffline: null });
    render(<ReconectarModal />);
    expect(screen.queryByTestId("modal-reconectar")).not.toBeInTheDocument();
  });

  it("login que exige CAPTCHA manda para a tela de login sem perder os registros do aparelho", async () => {
    useSessionStore.setState({ perfil: INSPETOR, acessoOffline: { matricula: "1234", validoAte: "2026-10-14T12:00:00.000Z" } });
    vi.spyOn(loginServidor, "loginNoServidor").mockResolvedValue({ tipo: "captcha_necessario" });

    render(<ReconectarModal />);
    await userEvent.type(screen.getByLabelText("Sua senha"), "segredo-123");
    await userEvent.click(screen.getByRole("button", { name: "Reconectar" }));

    await userEvent.click(await screen.findByRole("button", { name: "Ir para a tela de login" }));
    expect(useSessionStore.getState().perfil).toBeNull();
    expect(useSessionStore.getState().acessoOffline).toBeNull();
  });
});
