import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";

// Regressão: a senha/matrícula digitada na assinatura caía no campo "Temperatura da água" que estava em foco por baixo do modal
// (chiller 2 gravado como 1539 ºC). O teclado tem de ficar preso no modal.
function Pagina() {
  const [aberto, setAberto] = useState(false);
  const [temp, setTemp] = useState("");
  return (
    <div>
      <label>
        Temperatura
        <input aria-label="Temperatura" value={temp} onChange={(e) => setTemp(e.target.value)} />
      </label>
      <button type="button" onClick={() => setAberto(true)}>
        Assinar
      </button>
      {aberto && <ModalAssinaturaSenha descricao="Confirme." onAssinar={vi.fn()} onCancelar={() => setAberto(false)} />}
    </div>
  );
}

describe("foco preso no modal de assinatura", () => {
  it("ao abrir, tira o foco do campo da ficha e leva para a senha; digitar não altera a temperatura", async () => {
    render(<Pagina />);
    const temperatura = screen.getByLabelText("Temperatura");
    await userEvent.type(temperatura, "4");
    // O tablet não move o foco ao tocar no botão: o campo continua em foco quando o modal abre.
    temperatura.focus();
    await userEvent.click(screen.getByRole("button", { name: "Assinar" }), { pointerEventsCheck: 0 });
    temperatura.focus(); // tentativa de o foco voltar para o campo de baixo

    const senha = await screen.findByLabelText(/Sua senha/);
    expect(senha).toHaveFocus();
    await userEvent.keyboard("1539");
    expect(senha).toHaveValue("1539");
    expect(temperatura).toHaveValue("4");
  });
});
