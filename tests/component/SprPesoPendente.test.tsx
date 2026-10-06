import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
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
    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
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
    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
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

  it("pausas da linha: o inspetor informa os horários, o cálculo desconta o tempo parado e pede para recalcular as cargas", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    const painel = screen.getByTestId("cargas-calculadas");
    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
    await user.click(within(painel).getByRole("button", { name: /Usar estas cargas/ }));
    await waitFor(() => expect(lerValor()?.chegada).toBeTruthy());
    const antes = lerValor()!;
    expect(antes.paradas).toBeUndefined();
    expect(screen.queryByTestId("cargas-desatualizadas")).toBeNull();

    // pausa de 06:50 a 07:00 (Manaus), dentro da carga 2
    await user.click(screen.getByRole("button", { name: "Houve pausa" }));
    const secao = screen.getByTestId("paradas-linha");
    expect(within(secao).getByText("Nenhuma pausa informada.")).toBeInTheDocument();
    fireEvent.change(within(secao).getByLabelText("Início da pausa"), { target: { value: "06:50" } });
    fireEvent.change(within(secao).getByLabelText("Fim da pausa"), { target: { value: "07:00" } });
    await user.click(within(secao).getByRole("button", { name: /Informar pausa/ }));

    expect(await within(screen.getByTestId("paradas-linha")).findByText(/06:50 → 07:00/)).toBeInTheDocument();
    await waitFor(() => expect(lerValor()?.paradas).toHaveLength(1));
    // as cargas usadas foram calculadas sem a pausa: pede para recalcular
    expect(await screen.findByTestId("cargas-desatualizadas")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
    await user.click(within(screen.getByTestId("cargas-calculadas")).getByRole("button", { name: /Usar estas cargas/ }));
    await waitFor(() => expect(screen.queryByTestId("cargas-desatualizadas")).toBeNull());
    // o tempo parado muda a velocidade deduzida e, com ela, o cálculo
    expect(lerValor()?.chegada?.velocidadeAvesH).not.toBe(antes.chegada?.velocidadeAvesH);
  });

  it("pausa inválida é recusada com mensagem (fim antes do início; depois da hora do monitoramento)", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.click(screen.getByRole("button", { name: "Houve pausa" }));
    const secao = screen.getByTestId("paradas-linha");
    fireEvent.change(within(secao).getByLabelText("Início da pausa"), { target: { value: "07:00" } });
    fireEvent.change(within(secao).getByLabelText("Fim da pausa"), { target: { value: "06:50" } });
    await user.click(within(secao).getByRole("button", { name: /Informar pausa/ }));
    expect(await within(secao).findByRole("alert")).toHaveTextContent(/fim da pausa deve ser depois/i);

    fireEvent.change(within(secao).getByLabelText("Início da pausa"), { target: { value: "09:00" } }); // depois das 08:10
    fireEvent.change(within(secao).getByLabelText("Fim da pausa"), { target: { value: "09:10" } });
    await user.click(within(secao).getByRole("button", { name: /Informar pausa/ }));
    expect(await within(secao).findByRole("alert")).toHaveTextContent(/depois da hora do monitoramento/i);
    expect(lerValor()?.paradas).toBeUndefined();
  });

  it("1ª leitura do dia grava a base: as aves que já passaram não são contadas de novo no monitoramento seguinte", async () => {
    const user = userEvent.setup();
    // seis cargas de 5.000 aves, uma a cada ~43 min a partir das 06:00; todas com peso
    cargasDoDia = [0, 1, 2, 3, 4, 5].map((i) => {
      const total = 6 * 60 + Math.round(i * 43.1);
      const hh = String(Math.floor(total / 60)).padStart(2, "0");
      const mm = String(total % 60).padStart(2, "0");
      return carga(i + 1, `2026-10-06T${hh}:${mm}`, "2,900");
    });

    // 1º monitoramento às 08:00 (12:00Z): só leitura, sem cargas a apurar — mas a base é gravada sozinha
    const primeiro = render(<CampoComHora hora="2026-10-06T12:00:00Z" />);
    expect(screen.getByTestId("base-chegada")).toHaveTextContent(/já passaram/);
    await waitFor(() => expect(lerValor()?.chegada?.acumulado).toBeTruthy());
    const m1 = lerValor()!;
    const aves1 = Object.values(m1.chegada!.acumulado).reduce((a, b) => a + b, 0);
    expect(aves1).toBeGreaterThan(5000);
    primeiro.unmount();

    // 2º monitoramento às 10:00: parte da base do 1º
    render(<CampoComHora hora="2026-10-06T14:00:00Z" anterior={{ ...anterior, chegada: m1.chegada }} />);
    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
    await user.click(within(screen.getByTestId("cargas-calculadas")).getByRole("button", { name: /Usar estas cargas/ }));
    await waitFor(() => expect(lerValor()?.totalAvesBruto).toBeGreaterThan(0));
    const m2 = lerValor()!;
    // acumulado total às 10:00 (sem base) para comparar
    const totalAs10 = Object.values(m2.chegada!.acumulado).reduce((a, b) => a + b, 0);
    expect(m2.totalAvesBruto + aves1).toBe(totalAs10); // nenhuma ave contada duas vezes
    expect(m2.totalAvesBruto).toBeLessThan(totalAs10);
  });
});

function CampoComHora({ hora, anterior: ant }: { hora: string; anterior?: ChillerCarcacasValor }) {
  const [valor, setValor] = useState<ChillerCarcacasValor | undefined>();
  return (
    <div>
      <ChillerCarcacasField value={undefined} onChange={setValor} prevAppointment={ant} diaMonitoramento="2026-10-06" horaMonitoramento={hora} />
      <pre data-testid="valor">{JSON.stringify(valor ?? null)}</pre>
    </div>
  );
}

describe("a pausa da linha é respondida ANTES de usar as cargas", () => {
  it("sem resposta o botão 'Usar estas cargas' fica bloqueado e a pergunta aparece acima do painel de cargas", async () => {
    const user = userEvent.setup();
    cargasDoDia = [carga(1, "2026-10-06T06:00", "2,900"), carga(2, "2026-10-06T06:43", "3,050"), carga(3, "2026-10-06T07:26", null)];
    render(<Campo />);
    const pergunta = screen.getByTestId("paradas-linha");
    const painel = screen.getByTestId("cargas-calculadas");
    // a pergunta vem antes das cargas na tela
    expect(pergunta.compareDocumentPosition(painel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(pergunta).getByText(/Houve pausa da linha neste período\?/)).toBeInTheDocument();

    const usar = within(painel).getByRole("button", { name: /Usar estas cargas/ });
    expect(usar).toBeDisabled();
    expect(screen.getByTestId("falta-pausa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Não houve pausa" }));
    expect(usar).toBeEnabled();
    expect(screen.queryByTestId("falta-pausa")).toBeNull();
    await user.click(usar);
    await waitFor(() => expect(lerValor()?.pausaInformada).toBe("nao"));
    expect(lerValor()?.cargas.filter((c) => c.cargaId)).toHaveLength(3);
  });

  it("'Houve pausa' libera o formulário de horários; informar uma pausa mantém a resposta 'sim' e trava o 'Não houve'", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    expect(screen.queryByLabelText("Início da pausa")).toBeNull(); // sem resposta, nada de formulário
    await user.click(screen.getByRole("button", { name: "Houve pausa" }));
    const secao = screen.getByTestId("paradas-linha");
    fireEvent.change(within(secao).getByLabelText("Início da pausa"), { target: { value: "06:50" } });
    fireEvent.change(within(secao).getByLabelText("Fim da pausa"), { target: { value: "07:00" } });
    await user.click(within(secao).getByRole("button", { name: /Informar pausa/ }));
    await waitFor(() => expect(lerValor()?.pausaInformada).toBe("sim"));
    expect(screen.getByRole("button", { name: "Não houve pausa" })).toBeDisabled();
    expect(within(screen.getByTestId("cargas-calculadas")).getByRole("button", { name: /Usar estas cargas/ })).toBeEnabled();
  });
});

describe("digitar o peso vivo do lote (carga ainda sem peso da balança)", () => {
  const lotesSemPeso = (): ChillerCarcacasValor => ({
    cargas: [
      { id: "l1", quantity: "5000", avgLiveWeight: "2.900", cargaId: "c1", gta: "GTA1" },
      { id: "l2", quantity: "5000", avgLiveWeight: "", cargaId: "c2", gta: "GTA2" },
    ],
    tanques: {
      preChiller: { prev: "100,000", cur: "119,500", ice: "1995" },
      chiller1: { prev: "50,000", cur: "70,000", ice: "2394" },
      chiller2: { prev: "30,000", cur: "50,000", ice: "1596" },
    },
    condenasParcial: "0",
    condenasTotal: "0",
    totalAves: 10000,
    totalAvesBruto: 10000,
    pesoMedioCarcaca: 0,
    conformidade: true,
    detalhesRNC: null,
  });

  it("o campo não trava no primeiro dígito: dá para digitar o peso inteiro e só então ele vale", async () => {
    const user = userEvent.setup();
    cargasDoDia = [carga(1, "2026-10-06T06:00", "2,900"), carga(2, "2026-10-06T06:43", null)]; // a balança ainda não passou o peso da carga 2
    render(<Campo inicial={lotesSemPeso()} />);
    const campos = () => screen.getAllByPlaceholderText("Ex: 2,850");
    const peso = () => campos()[1]!; // lote 2 (o lote 1 tem o peso herdado da balança e fica travado)
    expect(campos()[0]).toBeDisabled();
    expect(peso()).toBeEnabled();

    await user.type(peso(), "2");
    expect(peso()).toBeEnabled(); // ainda dá para continuar digitando (antes travava aqui)
    // peso pela metade ("0,002", "0,028", "0,285") não vale: segue aguardando e a meta não é avaliada
    expect(lerValor()?.pesoMedioCarcaca).toBe(0);
    expect(screen.getByText("digite o peso completo (ex.: 2,850)")).toBeInTheDocument();
    await user.type(peso(), "85");
    expect(peso()).toBeEnabled();
    expect(lerValor()?.pesoMedioCarcaca).toBe(0);

    await user.type(peso(), "0");
    expect(peso()).toHaveValue("2,850");
    await waitFor(() => expect(lerValor()?.cargas[1]?.avgLiveWeight).toBe("2.850"));
    // agora o peso está completo: a meta é avaliada com o peso real (2,900 e 2,850 → carcaça ≈ 2,4 kg)
    expect(lerValor()!.pesoMedioCarcaca).toBeGreaterThan(2.3);
    expect(lerValor()!.pesoMedioCarcaca).toBeLessThan(2.5);
    expect(screen.queryByText("digite o peso completo (ex.: 2,850)")).toBeNull();
  });

  it("peso com um dígito a mais (28,500 kg) também não vale: continua pendente até corrigir", async () => {
    const user = userEvent.setup();
    cargasDoDia = [carga(1, "2026-10-06T06:00", "2,900"), carga(2, "2026-10-06T06:43", null)];
    render(<Campo inicial={lotesSemPeso()} />);
    const peso = screen.getAllByPlaceholderText("Ex: 2,850")[1]!;
    await user.type(peso, "28500");
    expect(peso).toHaveValue("28,500");
    expect(lerValor()?.pesoMedioCarcaca).toBe(0);
  });
});

