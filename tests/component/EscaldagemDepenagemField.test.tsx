import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EscaldagemDepenagemField } from "@/modules/fichas/fields/EscaldagemDepenagemField";
import type { EscaldagemDepenagemValor } from "@/modules/fichas/fields/tiposCompostos";

function montar() {
  const onChange = vi.fn();
  render(<EscaldagemDepenagemField value={undefined} onChange={onChange} />);
  return { ultimo: () => onChange.mock.calls.at(-1)![0] as EscaldagemDepenagemValor, user: userEvent.setup() };
}

describe("EscaldagemDepenagemField", () => {
  it("mostra os quatro parâmetros do processo e os 18 defeitos com o máximo de cada um", () => {
    montar();
    expect(screen.getByLabelText(/Velocidade da nórea — PSO 15/)).toBeTruthy();
    expect(screen.getByLabelText(/Tempo de escaldagem/)).toBeTruthy();
    expect(screen.getByLabelText(/Temperatura do depilador de patas/)).toBeTruthy();
    expect(screen.getByLabelText(/Temperatura do tanque de escaldagem/)).toBeTruthy();
    expect(screen.getByLabelText("Quantidade de aves avaliadas")).toBeTruthy();
    expect(screen.getAllByTestId(/^defeito-/)).toHaveLength(18);
    expect(screen.getByTestId("defeito-pesMalDepilados").textContent).toContain("máx. 2%");
    expect(screen.getByTestId("defeito-corteIrregularPes").textContent).toContain("máx. 15%");
  });

  it("devolve o percentual de cada defeito e marca CONFORME dentro do máximo", async () => {
    const { user, ultimo } = montar();
    await user.type(screen.getByLabelText("Quantidade de aves avaliadas"), "200");
    await user.type(screen.getByLabelText("Penas nas asas — PSO 06: quantidade de aves"), "6");
    expect(screen.getByTestId("pct-penasAsas").textContent).toBe("3%");
    expect(ultimo().conformidade).toBe(true);
  });

  it("acima do máximo: mostra NÃO CONFORME e grava o motivo para a RNC", async () => {
    const { user, ultimo } = montar();
    await user.type(screen.getByLabelText("Quantidade de aves avaliadas"), "100");
    await user.type(screen.getByLabelText("Pés mal depilados — PSO 07: quantidade de aves"), "3");
    expect(screen.getByTestId("pct-pesMalDepilados").textContent).toBe("3%");
    expect(screen.getByTestId("escaldagem-depenagem").textContent).toContain("NÃO CONFORME");
    expect(ultimo().conformidade).toBe(false);
    expect(ultimo().detalhesRNC).toContain("Pés mal depilados — PSO 07: 3% (máx. 2%)");
  });

  it("aceita vírgula nos decimais e só dígitos nas contagens", async () => {
    const { user, ultimo } = montar();
    await user.type(screen.getByLabelText(/Temperatura do tanque de escaldagem/), "57,5");
    expect(ultimo().temperaturaTanqueEscaldagemC).toBe("57,5");
    const campo = screen.getByLabelText("Quantidade de aves avaliadas") as HTMLInputElement;
    await user.type(campo, "1a,2");
    expect(campo.value).toBe("12");
  });
});
