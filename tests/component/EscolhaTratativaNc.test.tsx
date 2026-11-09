import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EscolhaTratativaNc } from "@/modules/autocorrecao/EscolhaTratativaNc";

describe("escolha da tratativa da não conformidade", () => {
  it("destaca a autocorreção imediata como recomendada e dispara cada ação", () => {
    const onAutocorrigir = vi.fn();
    const onRnc = vi.fn();
    const onDepois = vi.fn();
    render(<EscolhaTratativaNc onAutocorrigir={onAutocorrigir} onRnc={onRnc} onDepois={onDepois} />);
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("nc-autocorrecao-imediata"));
    fireEvent.click(screen.getByTestId("nc-emitir-rnc"));
    fireEvent.click(screen.getByText("Depois"));
    expect(onAutocorrigir).toHaveBeenCalledTimes(1);
    expect(onRnc).toHaveBeenCalledTimes(1);
    expect(onDepois).toHaveBeenCalledTimes(1);
  });

  it("sem conexão desabilita a autocorreção e a RNC, mas deixa fechar", () => {
    const onDepois = vi.fn();
    render(<EscolhaTratativaNc desabilitado onAutocorrigir={() => undefined} onRnc={() => undefined} onDepois={onDepois} />);
    expect(screen.getByTestId("nc-autocorrecao-imediata")).toBeDisabled();
    expect(screen.getByTestId("nc-emitir-rnc")).toBeDisabled();
    fireEvent.click(screen.getByText("Depois"));
    expect(onDepois).toHaveBeenCalledTimes(1);
  });
});
