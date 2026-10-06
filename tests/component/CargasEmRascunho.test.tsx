import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PesoCaixaField } from "@/modules/fichas/fields/PesoCaixaField";
import { RecepcaoAvesField } from "@/modules/fichas/fields/RecepcaoAvesField";
import type { CargasEmRascunhoPorTipo } from "@/modules/fichas/utils/rascunhosAnterior";

const carga = (id: string, gta: string) => ({ id, gta, integrado: "I", aviario: "A", nucleo: "", qtd_aves: 5000, data_abate: "2026-10-06" });
vi.mock("@/modules/recepcao/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recepcao/api")>()),
  useCargasDoDia: () => ({ data: [carga("c1", "GTA-1"), carga("c2", "GTA-2")] }),
  useCargasJaMonitoradas: () => ({ data: new Set<string>() }),
  useVeiculos: () => ({ data: [] }),
  useCriarVeiculo: () => ({ mutateAsync: async () => ({}), isPending: false }),
}));

const vazio: CargasEmRascunhoPorTipo = { recepcao: new Set(), peso: new Set(), doa: [] };
const textoDasOpcoes = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent ?? "");

describe("carga já monitorada em rascunho não volta à lista", () => {
  it("peso por caixa: a carga do rascunho some do seletor; a outra continua", () => {
    const { rerender } = render(<PesoCaixaField value={undefined} onChange={() => undefined} cargasUsadasEmRascunho={vazio} />);
    const antes = textoDasOpcoes(screen.getByLabelText("Carga (GTA)"));
    expect(antes.some((t) => t.includes("GTA-1"))).toBe(true);
    expect(antes.some((t) => t.includes("GTA-2"))).toBe(true);

    rerender(<PesoCaixaField value={undefined} onChange={() => undefined} cargasUsadasEmRascunho={{ ...vazio, peso: new Set(["c1"]) }} />);
    const depois = textoDasOpcoes(screen.getByLabelText("Carga (GTA)"));
    expect(depois.some((t) => t.includes("GTA-1"))).toBe(false);
    expect(depois.some((t) => t.includes("GTA-2"))).toBe(true);
  });

  it("recepção de aves: idem", () => {
    const { rerender } = render(<RecepcaoAvesField value={undefined} onChange={() => undefined} cargasUsadasEmRascunho={vazio} />);
    const select = () => screen.getAllByRole("combobox").find((s) => within(s).queryAllByRole("option").some((o) => (o.textContent ?? "").includes("GTA")))!;
    expect(textoDasOpcoes(select()).some((t) => t.includes("GTA-1"))).toBe(true);

    rerender(<RecepcaoAvesField value={undefined} onChange={() => undefined} cargasUsadasEmRascunho={{ ...vazio, recepcao: new Set(["c1"]) }} />);
    const depois = textoDasOpcoes(select());
    expect(depois.some((t) => t.includes("GTA-1"))).toBe(false);
    expect(depois.some((t) => t.includes("GTA-2"))).toBe(true);
  });

  it("a carga já escolhida nesta própria ficha continua visível", () => {
    render(
      <PesoCaixaField
        value={{ cargas: [{ cargaId: "c1", gta: "GTA-1", integrado: "I", aviario: "A", nucleo: "", qtdAves: 5000, avesPorCaixa: "10", pesoMedioKg: "" }], conformidade: true, detalhesRNC: null }}
        onChange={() => undefined}
        cargasUsadasEmRascunho={{ ...vazio, peso: new Set(["c1"]) }}
      />
    );
    expect(textoDasOpcoes(screen.getByLabelText("Carga (GTA)")).some((t) => t.includes("GTA-1"))).toBe(true);
  });
});
