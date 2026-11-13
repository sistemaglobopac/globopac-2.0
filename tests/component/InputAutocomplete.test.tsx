import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/shared/ui/input";

// O Chrome preenche a matrícula salva no campo de texto logo antes de um campo de senha: nada da ficha pode aceitar isso.
describe("Input — sem autopreenchimento do navegador", () => {
  it("campo de texto fica com autocomplete off", () => {
    render(<Input aria-label="temperatura" />);
    expect(screen.getByLabelText("temperatura")).toHaveAttribute("autocomplete", "off");
  });

  it("campo de senha usa new-password (sem credencial salva) e avisa os gerenciadores de senha", () => {
    render(<Input aria-label="senha" type="password" />);
    const senha = screen.getByLabelText("senha");
    expect(senha).toHaveAttribute("autocomplete", "new-password");
    expect(senha).toHaveAttribute("data-1p-ignore");
    expect(senha).toHaveAttribute("data-lpignore", "true");
  });

  it("a tela de login continua podendo pedir o autopreenchimento de usuário e senha", () => {
    render(
      <>
        <Input aria-label="matricula" autoComplete="username" />
        <Input aria-label="senha" type="password" autoComplete="current-password" />
      </>
    );
    expect(screen.getByLabelText("matricula")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("senha")).toHaveAttribute("autocomplete", "current-password");
  });
});
