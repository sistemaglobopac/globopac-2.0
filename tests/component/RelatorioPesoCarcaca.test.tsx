import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChillerCarcacasRelatorio } from "@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio";
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

const t = (prev: string, cur: string) => ({ prev, cur, ice: "0" });
const valor = (over: Partial<ChillerCarcacasValor> = {}): ChillerCarcacasValor => ({
  cargas: [{ id: "1", quantity: "5000", avgLiveWeight: "2.905" }],
  tanques: { preChiller: t("10", "20"), chiller1: t("30", "40"), chiller2: t("50", "60") },
  condenasParcial: "0",
  condenasTotal: "0",
  totalAves: 5000,
  totalAvesBruto: 5000,
  pesoMedioCarcaca: 2.905 * 0.84,
  conformidade: true,
  detalhesRNC: null,
  ...over,
});

describe("relatório da vazão: peso médio da carcaça deixa claro a que se refere o percentual", () => {
  it("mostra que o peso da carcaça é 84% do peso vivo médio e quanto é esse peso vivo", () => {
    render(<ChillerCarcacasRelatorio valor={valor()} />);
    expect(screen.getByText("Peso médio da carcaça")).toBeInTheDocument();
    expect(screen.getByText("2.440 kg")).toBeInTheDocument();
    expect(screen.getByTestId("relatorio-peso-carcaca-base")).toHaveTextContent("84% do peso vivo médio de 2.905 kg");
  });

  it("explica o cálculo na lógica do relatório", () => {
    render(<ChillerCarcacasRelatorio valor={valor()} />);
    expect(screen.getByText(/Peso médio da carcaça = 84% do peso vivo médio/)).toBeInTheDocument();
  });

  it("peso ainda pendente: não mostra 0,000 kg, avisa que aguarda o peso das cargas", () => {
    render(<ChillerCarcacasRelatorio valor={valor({ pesoMedioCarcaca: 0 })} />);
    expect(screen.queryByText("0.000 kg")).not.toBeInTheDocument();
    expect(screen.getByTestId("relatorio-peso-carcaca-base")).toHaveTextContent("84% do peso vivo médio (aguardando o peso das cargas)");
  });
});
