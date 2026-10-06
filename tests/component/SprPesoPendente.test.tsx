import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChillerCarcacasField } from "@/modules/fichas/fields/ChillerCarcacasField";
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

// Cargas do dia (pendura às 06:00, 06:43 e 07:26 de Manaus; 5.000 aves cada, ~6.960 aves/h). A carga 3 ainda não tem peso.
const carga = (n: number, pendura: string, peso: string | null) => ({
  carga_id: `c${n}`,
  gta: `GTA${n}`,
  integrado: "I",
  aviario: "A",
  nucleo: "",
  qtd_aves: 5000,
  placa: null,
  pendura_inicio_em: pendura,
  monitoramento_id: null,
  peso_medio_kg: peso,
});
let cargasDoDia = [carga(1, "2026-10-06T06:00", "2,900"), carga(2, "2026-10-06T06:43", "3,050"), carga(3, "2026-10-06T07:26", null)];

vi.mock("@/modules/recepcao/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recepcao/api")>()),
  useCargasRastreabilidade: () => ({ data: cargasDoDia }),
  useCargasJaMonitoradas: () => ({ data: new Set<string>() }),
}));

const t = (cur: string) => ({ prev: "", cur, ice: "0" });
const anterior = { tanques: { preChiller: t("100,000"), chiller1: t("50,000"), chiller2: t("30,000") } } as unknown as ChillerCarcacasValor;
const HORA = "2026-10-06T12:10:00Z"; // 08:10 em Manaus

function Campo({ inicial, completar }: { inicial?: ChillerCarcacasValor; completar?: boolean }) {
  const [valor, setValor] = useState<ChillerCarcacasValor | undefined>(inicial);
  return (
    <div>
      <ChillerCarcacasField
        value={inicial}
        onChange={setValor}
        prevAppointment={anterior}
        diaMonitoramento="2026-10-06"
        horaMonitoramento={HORA}
        modoCompletarPeso={completar}
      />
      <pre data-testid="valor">{JSON.stringify(valor ?? null)}</pre>
    </div>
  );
}

const lerValor = () => JSON.parse(screen.getByTestId("valor").textContent ?? "null") as ChillerCarcacasValor | null;
const hidr = () => screen.getAllByPlaceholderText("Ex: 3718,72"); // [prev, cur] de cada tanque

describe("SPR Carcaças: cargas pela chegada ao pré-resfriamento e peso pendente", () => {
  it("mostra as cargas calculadas, com a parte da última e o peso pendente, e as usa no monitoramento", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const painel = screen.getByTestId("cargas-calculadas");
    expect(within(painel).getByText(/GTA1/)).toBeInTheDocument();
    expect(within(painel).getByText(/GTA3/)).toBeInTheDocument();
    expect(within(painel).getByText(/parte da carga/)).toBeInTheDocument();
    expect(within(painel).getByText(/aguardando o peso da balança/)).toBeInTheDocument();
    expect(within(painel).getByText(/velocidade deduzida/)).toBeInTheDocument();

    await user.click(within(painel).getByRole("button", { name: /Usar estas cargas/ }));
    await waitFor(() => expect(lerValor()?.cargas.filter((c) => c.cargaId)).toHaveLength(3));
    const v = lerValor()!;
    expect(v.cargas.map((c) => c.gta)).toEqual(["GTA1", "GTA2", "GTA3"]);
    expect(v.cargas[0]!.avgLiveWeight).toBe("2.900");
    expect(v.cargas[2]!.avgLiveWeight).toBe(""); // aguardando a balança — nunca peso estimado
    expect(v.cargas[2]!.parcial).toBe(true);
    expect(v.totalAvesBruto).toBeGreaterThan(13500);
    expect(v.chegada?.origemVelocidade).toBe("observada");
    expect(v.chegada?.acumulado).toHaveProperty("c1", 5000);
    // peso pendente: não há peso médio nem meta fechada
    expect(v.pesoMedioCarcaca).toBe(0);
    expect(screen.getAllByText("Meta: depende do peso das cargas").length).toBeGreaterThan(0);
  });

  it("renovação abaixo da meta da faixa mais branda: NÃO CONFORME em qualquer peso, sem esperar a balança", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.click(within(screen.getByTestId("cargas-calculadas")).getByRole("button", { name: /Usar estas cargas/ }));
    // pré-chiller: (110 − 100) m³ + 1.995 kg de gelo ≈ 0,88 L/ave (< 1,5)
    await user.type(hidr()[1]!, "110");
    const painel = await screen.findByTestId("veredito-antecipado");
    expect(painel).toHaveTextContent("NÃO CONFORME em qualquer peso");
    await waitFor(() => expect(lerValor()?.conformidade).toBe(false));
    expect(lerValor()?.detalhesRNC).toContain("qualquer faixa de peso");
  });

  it("renovação no meio das metas: depende do peso e informa o corte exato", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.click(within(screen.getByTestId("cargas-calculadas")).getByRole("button", { name: /Usar estas cargas/ }));
    // pré-chiller: (119,5 − 100) m³ + 1.995 ≈ 1,58 L/ave (entre 1,5 e 1,7)
    await user.type(hidr()[1]!, "119,5");
    const painel = await screen.findByTestId("veredito-antecipado");
    expect(painel).toHaveTextContent("Depende do peso das cargas");
    expect(painel).toHaveTextContent(/até 2,5 kg/);
    expect(painel).toHaveTextContent(/até 2,976 kg/);
    expect(screen.getByText("AGUARDANDO O PESO DA BALANÇA")).toBeInTheDocument();
    expect(lerValor()?.conformidade).toBe(true); // ainda não há o que condenar: o peso decide
  });

  it("etapa 2: o peso da balança entra sozinho, as leituras ficam travadas e a meta é fechada com o peso real", async () => {
    const inicial: ChillerCarcacasValor = {
      cargas: [
        { id: "l1", quantity: "5000", avgLiveWeight: "2.900", cargaId: "c1", gta: "GTA1" },
        { id: "l2", quantity: "5000", avgLiveWeight: "3.050", cargaId: "c2", gta: "GTA2" },
        { id: "l3", quantity: "3567", avgLiveWeight: "", cargaId: "c3", gta: "GTA3", parcial: true },
      ],
      tanques: {
        preChiller: { prev: "100,000", cur: "119,500", ice: "1995" },
        chiller1: { prev: "50,000", cur: "70,000", ice: "2394" },
        chiller2: { prev: "30,000", cur: "50,000", ice: "1596" },
      },
      condenasParcial: "0",
      condenasTotal: "0",
      totalAves: 13567,
      totalAvesBruto: 13567,
      pesoMedioCarcaca: 0,
      conformidade: true,
      detalhesRNC: null,
    };
    // a balança passou o peso da carga 3
    cargasDoDia = [carga(1, "2026-10-06T06:00", "2,900"), carga(2, "2026-10-06T06:43", "3,050"), carga(3, "2026-10-06T07:26", "2,950")];
    render(<Campo inicial={inicial} completar />);

    await waitFor(() => expect(lerValor()?.cargas[2]?.avgLiveWeight).toBe("2.950"));
    const v = lerValor()!;
    // peso médio vivo ponderado ≈ 2,969 kg → carcaça ≈ 2,494 kg (faixa ≤ 2,5 kg): meta do pré-chiller 1,5 L/ave, e 1,58 ≥ 1,5
    expect(v.pesoMedioCarcaca).toBeGreaterThan(2.48);
    expect(v.pesoMedioCarcaca).toBeLessThan(2.5);
    expect(v.conformidade).toBe(true);
    // o que foi assinado na etapa 1 não muda
    expect(v.totalAves).toBe(13567);
    expect(v.tanques.preChiller.cur).toBe("119,500");
    // leituras travadas
    for (const input of hidr()) expect(input).toBeDisabled();
    expect(screen.queryByTestId("cargas-calculadas")).toBeNull();
    expect(screen.queryByTestId("veredito-antecipado")).toBeNull();
  });
});
