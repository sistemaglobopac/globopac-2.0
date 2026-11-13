import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const cancelarAsync = vi.fn();
let jaComRecepcao = new Set<string>();

vi.mock("@/modules/recepcao/api", () => ({
  useCancelarCarga: () => ({ mutateAsync: cancelarAsync, isPending: false }),
  useCargasJaMonitoradas: () => ({ data: jaComRecepcao }),
}));

import { CancelarCargaAves } from "@/modules/recepcao/CancelarCargaAves";

const CARGAS = [
  { id: "c1", data_abate: "2026-11-13", integrado: "Avícola Norte", aviario: "3", nucleo: "A", gta: "1001", qtd_aves: 5000 },
  { id: "c2", data_abate: "2026-11-13", integrado: "Granja Sul", aviario: "7", nucleo: "", gta: "1002", qtd_aves: 4200 },
];

describe("cancelar carga (recepção de aves / bem-estar animal)", () => {
  beforeEach(() => {
    cancelarAsync.mockReset();
    jaComRecepcao = new Set();
  });

  it("exige a GTA e um motivo antes de liberar o botão, cancela e avisa quem chamou", async () => {
    cancelarAsync.mockResolvedValue(undefined);
    const aoCancelar = vi.fn();
    render(<CancelarCargaAves cargas={CARGAS} aoCancelar={aoCancelar} />);

    await userEvent.click(screen.getByTestId("abrir-cancelar-carga"));
    const confirmar = screen.getByTestId("confirmar-cancelar-carga");
    expect(confirmar).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Carga (GTA)"), "c2");
    await userEvent.type(screen.getByLabelText(/Motivo do cancelamento/), "abc");
    expect(confirmar).toBeDisabled(); // motivo curto demais
    await userEvent.type(screen.getByLabelText(/Motivo do cancelamento/), "def ghi");
    expect(confirmar).toBeEnabled();

    await userEvent.click(confirmar);
    await waitFor(() => expect(cancelarAsync).toHaveBeenCalledWith({ cargaId: "c2", motivo: "abcdef ghi" }));
    await waitFor(() => expect(aoCancelar).toHaveBeenCalledWith("c2"));
    expect(screen.queryByTestId("modal-cancelar-carga")).not.toBeInTheDocument();
    expect(screen.getByTestId("carga-cancelada-aviso")).toHaveTextContent("GTA 1002 marcada como cancelada");
  });

  it("não oferece carga que já teve a recepção monitorada", async () => {
    jaComRecepcao = new Set(["c1"]);
    render(<CancelarCargaAves cargas={CARGAS} />);
    await userEvent.click(screen.getByTestId("abrir-cancelar-carga"));
    const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opcoes.some((t) => t?.includes("GTA 1001"))).toBe(false);
    expect(opcoes.some((t) => t?.includes("GTA 1002"))).toBe(true);
  });

  it("mostra o erro do servidor e mantém o modal aberto", async () => {
    cancelarAsync.mockRejectedValue(new Error("Esta carga já está cancelada."));
    render(<CancelarCargaAves cargas={CARGAS} />);
    await userEvent.click(screen.getByTestId("abrir-cancelar-carga"));
    await userEvent.selectOptions(screen.getByLabelText("Carga (GTA)"), "c1");
    await userEvent.type(screen.getByLabelText(/Motivo do cancelamento/), "carga cancelada pela integração");
    await userEvent.click(screen.getByTestId("confirmar-cancelar-carga"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta carga já está cancelada.");
    expect(screen.getByTestId("modal-cancelar-carga")).toBeInTheDocument();
  });

  it("avisa quando não há carga disponível", async () => {
    render(<CancelarCargaAves cargas={[]} />);
    await userEvent.click(screen.getByTestId("abrir-cancelar-carga"));
    expect(screen.getByTestId("sem-cargas-para-cancelar")).toBeInTheDocument();
    expect(screen.queryByTestId("confirmar-cancelar-carga")).not.toBeInTheDocument();
  });
});
