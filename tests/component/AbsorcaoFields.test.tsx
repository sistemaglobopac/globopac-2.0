import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AbsorcaoAguaField } from "@/modules/fichas/fields/AbsorcaoAguaField";
import { DrippingTestField } from "@/modules/fichas/fields/DrippingTestField";
import type { AbsorcaoAguaValor, DrippingTestValor } from "@/modules/fichas/fields/tiposCompostos";

beforeEach(() => {
  const memoria = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
    clear: () => memoria.clear(),
  });
});

let ultimoA: AbsorcaoAguaValor | undefined;
let ultimoB: DrippingTestValor | undefined;

function HarnessA({ inicial }: { inicial?: AbsorcaoAguaValor }) {
  const [valor, setValor] = useState<AbsorcaoAguaValor | undefined>(inicial);
  return (
    <AbsorcaoAguaField
      value={valor}
      onChange={(v) => {
        ultimoA = v;
        setValor(v);
      }}
    />
  );
}

function HarnessB({ inicial, ...extras }: { inicial?: DrippingTestValor } & Partial<ComponentProps<typeof DrippingTestField>>) {
  const [valor, setValor] = useState<DrippingTestValor | undefined>(inicial);
  return (
    <DrippingTestField
      {...extras}
      value={valor}
      onChange={(v) => {
        ultimoB = v;
        setValor(v);
      }}
    />
  );
}

const digitar = (el: HTMLElement, valor: string) => fireEvent.change(el, { target: { value: valor } });

describe("A) Teste de Absorção de Água — tela", () => {
  it("10 linhas, sem herança/travas; painel só com linhas válidas", () => {
    ultimoA = undefined;
    render(<HarnessA />);
    expect(screen.getAllByPlaceholderText("ABC")).toHaveLength(10);
    expect(screen.queryByText(/MÉDIA DE ABSORÇÃO/)).toBeNull();
    screen.getAllByPlaceholderText("0.000").forEach((el) => expect(el).not.toBeDisabled());
    expect(screen.queryByText(/Primeiro monitoramento/)).toBeNull();
  });

  it("exemplo por SOMA: 7,00% CONFORME em verde, com o título e a saída completa", () => {
    ultimoA = undefined;
    render(<HarnessA />);
    const pesos = screen.getAllByPlaceholderText("0.000");
    digitar(pesos[0]!, "1.000");
    digitar(pesos[1]!, "1.150");
    digitar(pesos[2]!, "4.000");
    digitar(pesos[3]!, "4.200");
    expect(screen.getByText("MÉDIA DE ABSORÇÃO C/ 2 AMOS. VÁLIDAS")).toBeInTheDocument();
    expect(screen.getByTestId("media-absorcao")).toHaveTextContent("7,00%");
    expect(screen.queryByText(/ACIMA DO LIMITE/)).toBeNull();
    expect(Object.keys(ultimoA!).sort()).toEqual(["averagePercentage", "items", "status", "sumFinal", "sumInitial", "validCount"]);
    expect(ultimoA!.items).toHaveLength(10);
    expect(Object.keys(ultimoA!.items[0]!).sort()).toEqual(["final", "id", "initial", "seal"]);
    expect(ultimoA!.status).toBe("conforme");
  });

  it("mostra o percentual de absorção de cada carcaça, além da média", () => {
    ultimoA = undefined;
    render(<HarnessA />);
    // sem pesos, nenhuma carcaça tem percentual
    expect(screen.getByTestId("absorcao-individual-1")).toHaveTextContent("—");
    const pesos = screen.getAllByPlaceholderText("0.000");
    digitar(pesos[0]!, "1.000");
    digitar(pesos[1]!, "1.150");
    digitar(pesos[2]!, "4.000");
    digitar(pesos[3]!, "4.200");
    expect(screen.getByTestId("absorcao-individual-1")).toHaveTextContent("15,00%");
    expect(screen.getByTestId("absorcao-individual-2")).toHaveTextContent("5,00%");
    expect(screen.getByTestId("absorcao-individual-3")).toHaveTextContent("—");
  });

  it("acima de 8% mostra o selo em vermelho; 8,00% exato não", () => {
    render(<HarnessA />);
    const pesos = screen.getAllByPlaceholderText("0.000");
    digitar(pesos[0]!, "10");
    digitar(pesos[1]!, "10.8");
    expect(screen.getByTestId("media-absorcao")).toHaveTextContent("8,00%");
    expect(screen.queryByText(/ACIMA DO LIMITE/)).toBeNull();
    digitar(pesos[1]!, "10.9");
    expect(screen.getByText("⚠️ ACIMA DO LIMITE (8%)")).toBeInTheDocument();
    expect(ultimoA!.status).toBe("nao-conforme");
  });

  it("modo edição: o estado acompanha o valor vindo do pai", () => {
    const inicial = { items: Array.from({ length: 10 }, (_, i) => ({ id: i, seal: "", initial: i === 0 ? "2.000" : "", final: i === 0 ? "2.100" : "" })), status: "conforme", averagePercentage: 5, validCount: 1, sumInitial: 2, sumFinal: 2.1 } as AbsorcaoAguaValor;
    render(<HarnessA inicial={inicial} />);
    expect((screen.getAllByPlaceholderText("0.000")[0] as HTMLInputElement).value).toBe("2.000");
    expect(screen.getByTestId("media-absorcao")).toHaveTextContent("5,00%");
  });
});

/** Fixa o relógio em 08:00 de Manaus (12:00 UTC) para a hora da Retirada (preenchida ao focar) ser previsível. */
function iniciarTesteAs0800() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
}

describe("B) Dripping Test — tela", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const linha = (i: number) => ({
    m0: screen.getAllByPlaceholderText("M0")[i]!,
    m1: screen.getAllByPlaceholderText("M1")[i]!,
    m3: screen.getAllByPlaceholderText("M3")[i]!,
    m2: screen.getAllByPlaceholderText("M2")[i]!,
    retirada: document.querySelectorAll<HTMLInputElement>('input[type="time"]:not([data-testid="hora-inicio-dripping"])')[i]!,
  });
  const horaInicioInput = () => screen.getByTestId("hora-inicio-dripping") as HTMLInputElement;

  it("6 linhas, cabeçalho e fórmula com os textos pedidos", () => {
    render(<HarnessB />);
    expect(screen.getAllByPlaceholderText("M0")).toHaveLength(6);
    expect(screen.getByText("Dripping Test (Portaria 210/1998) — Amostragem: 6 Carcaças. Limite de Absorção: 6,00%")).toBeInTheDocument();
    expect(screen.getByText("Fórmula: (M0 − M1 − M2) / (M0 − M1 − M3) × 100%")).toBeInTheDocument();
    expect(screen.queryByText(/Média Oficial/)).toBeNull();
  });

  it("média aritmética 6,49% → 'ACIMA DE 6%' e saída com as chaves listadas", () => {
    ultimoB = undefined;
    render(<HarnessB />);
    for (const [i, m2] of [[0, "943"], [1, "915"]] as const) {
      const l = linha(i);
      digitar(l.m0, "1000");
      digitar(l.m1, "10");
      digitar(l.m3, "50");
      digitar(l.m2, m2);
    }
    expect(screen.getByText("Média Oficial (2/6 válidas)")).toBeInTheDocument();
    expect(screen.getAllByText("6,49%").length).toBeGreaterThan(0);
    expect(screen.getByText("ACIMA DE 6%")).toBeInTheDocument();
    expect(screen.getByText("5,00%")).toBeInTheDocument();
    expect(screen.getByText("7,98%")).toBeInTheDocument();
    expect(Object.keys(ultimoB!).sort()).toEqual(["averagePercentage", "horaInicio", "items", "lote", "status", "timeNonConformity", "validCount"]);
    expect(ultimoB!.items).toHaveLength(6);
    expect(Object.keys(ultimoB!.items[0]!).sort()).toEqual(["horaRetirada", "id", "m0", "m1", "m2", "m3", "seal", "timeNc"]);
  });

  it("mostra o tempo exigido (78min) sob o M0 e marca a Retirada em vermelho quando abaixo", () => {
    iniciarTesteAs0800();
    render(<HarnessB />);
    digitar(horaInicioInput(), "08:00");
    const l = linha(0);
    digitar(l.m0, "1000");
    expect(screen.getByText("78min")).toBeInTheDocument();
    digitar(l.retirada, "09:10");
    expect(linha(0).retirada.className).toContain("border-destructive");
    digitar(linha(0).retirada, "09:20");
    expect(linha(0).retirada.className).not.toContain("border-destructive");
  });

  it("tempo reprova mesmo sem linha válida (Fase 2 sem M2): status nao-conforme, painel oculto", () => {
    ultimoB = undefined;
    iniciarTesteAs0800();
    render(<HarnessB />);
    digitar(horaInicioInput(), "08:00");
    const l = linha(0);
    digitar(l.m0, "1000");
    digitar(l.retirada, "09:10");
    expect(ultimoB!.validCount).toBe(0);
    expect(ultimoB!.timeNonConformity).toBe(true);
    expect(ultimoB!.status).toBe("nao-conforme");
    expect(screen.queryByText(/Média Oficial/)).toBeNull();
  });

  it("selo 'TEMPO INFERIOR À META' quando só o tempo reprova", () => {
    iniciarTesteAs0800();
    render(<HarnessB />);
    digitar(horaInicioInput(), "08:00");
    const l = linha(0);
    digitar(l.m0, "1000");
    digitar(l.m1, "10");
    digitar(l.m3, "50");
    digitar(l.m2, "943");
    digitar(linha(0).retirada, "09:10");
    expect(screen.getByText("TEMPO INFERIOR À META")).toBeInTheDocument();
  });

  it("Hora Início é digitada pelo inspetor: nunca é preenchida sozinha e vale para o tempo de drenagem", () => {
    iniciarTesteAs0800();
    render(<HarnessB />);
    expect(horaInicioInput().value).toBe("");
    digitar(linha(0).m0, "1000");
    digitar(screen.getByPlaceholderText("Lote do teste"), "L-1");
    expect(ultimoB?.horaInicio).toBe(""); // preencher o teste não registra a hora
    digitar(horaInicioInput(), "07:30");
    expect(ultimoB?.horaInicio).toBe("07:30");
    digitar(linha(0).retirada, "08:40"); // 70 min < 78 min exigidos para M0 1000 g
    expect(ultimoB?.timeNonConformity).toBe(true);
    digitar(linha(0).retirada, "08:50"); // 80 min
    expect(ultimoB?.timeNonConformity).toBe(false);
  });

  it("sem Hora Início o tempo de drenagem não é avaliado e não há hora de retirada prevista", () => {
    iniciarTesteAs0800();
    render(<HarnessB />);
    digitar(linha(0).m0, "1000");
    digitar(linha(0).retirada, "08:10");
    expect(ultimoB?.timeNonConformity).toBe(false);
    expect(screen.queryByTestId("retirada-prevista-0")).toBeNull();
  });

  it("informa a hora exata de retirada de cada carcaça (início + tempo da tabela do M0)", () => {
    render(<HarnessB />);
    digitar(horaInicioInput(), "08:00");
    digitar(linha(0).m0, "1000"); // 78 min
    digitar(linha(1).m0, "2400"); // 168 + 7 = 175 min
    expect(screen.getByTestId("retirada-prevista-0").textContent).toContain("09:18");
    expect(screen.getByTestId("retirada-prevista-1").textContent).toContain("10:55");
    expect(screen.queryByTestId("retirada-prevista-2")).toBeNull(); // sem M0
    digitar(horaInicioInput(), "23:00"); // vira a meia-noite
    expect(screen.getByTestId("retirada-prevista-0").textContent).toContain("00:18");
  });

  it("Retirada: clicar no campo vazio registra a hora atual, e ela continua editável", () => {
    iniciarTesteAs0800();
    render(<HarnessB />);
    const retirada = linha(0).retirada;
    fireEvent.focus(retirada);
    expect(linha(0).retirada.value).toBe("08:00");
    expect(ultimoB?.items[0]?.horaRetirada).toBe("08:00");
    // outra linha continua vazia
    expect(linha(1).retirada.value).toBe("");
    // editável depois
    digitar(linha(0).retirada, "09:20");
    expect(linha(0).retirada.value).toBe("09:20");
    // focar de novo não sobrescreve a hora já editada
    fireEvent.focus(linha(0).retirada);
    expect(linha(0).retirada.value).toBe("09:20");
  });

  it("valor vindo do pai (edição) alimenta o campo", () => {
    const doPai = { items: Array.from({ length: 6 }, (_, i) => ({ id: i, seal: "", m0: "", m1: "", m3: "", horaRetirada: "", m2: "" })), lote: "DO-PAI", horaInicio: "", status: "conforme", averagePercentage: 0, validCount: 0, timeNonConformity: false } as DrippingTestValor;
    render(<HarnessB inicial={doPai} />);
    expect((screen.getByPlaceholderText("Lote do teste") as HTMLInputElement).value).toBe("DO-PAI");
  });

  it("nada é guardado no aparelho: a 1ª etapa é entregue a quem usa o campo (que grava no servidor)", () => {
    const aoSalvar = vi.fn();
    render(<HarnessB aoSalvarPrimeiraEtapa={aoSalvar} />);
    digitar(screen.getByPlaceholderText("Lote do teste"), "L-77");
    digitar(horaInicioInput(), "08:15");
    digitar(screen.getAllByPlaceholderText("Lacre")[0]!, "0001");
    digitar(linha(0).m0, "1000");
    act(() => {
      fireEvent.click(screen.getByText("Salvar 1ª etapa do teste"));
    });
    expect(aoSalvar).toHaveBeenCalledTimes(1);
    expect(ultimoB?.lote).toBe("L-77");
    expect(ultimoB?.horaInicio).toBe("08:15");
    expect(localStorage.getItem("@globopac:dripping_test_draft")).toBeNull();
  });

  it("1ª etapa: só há o botão de salvar a 1ª etapa (exige hora início + lacre + M0); com Retirada/M3/M2 vira 2ª etapa", () => {
    const aoSalvar = vi.fn();
    render(<HarnessB aoSalvarPrimeiraEtapa={aoSalvar} />);
    fireEvent.click(screen.getByText("Salvar 1ª etapa do teste"));
    expect(screen.getByText("Informe a hora de início da drenagem (banho-maria) antes de salvar a 1ª etapa.")).toBeInTheDocument();
    digitar(horaInicioInput(), "08:00");
    fireEvent.click(screen.getByText("Salvar 1ª etapa do teste"));
    expect(screen.getByText("Preencha ao menos 1 carcaça com lacre e M0 antes de salvar a 1ª etapa.")).toBeInTheDocument();
    expect(aoSalvar).not.toHaveBeenCalled();
    digitar(linha(0).retirada, "09:20");
    expect(screen.queryByText("Salvar 1ª etapa do teste")).toBeNull();
    expect(screen.getByText(/2ª etapa em preenchimento/)).toBeInTheDocument();
  });

  it("Salvar 1ª etapa mantém a hora de início digitada (não troca pela hora do salvamento)", () => {
    iniciarTesteAs0800();
    render(<HarnessB aoSalvarPrimeiraEtapa={vi.fn()} />);
    digitar(horaInicioInput(), "08:20");
    digitar(screen.getAllByPlaceholderText("Lacre")[0]!, "0001");
    digitar(linha(0).m0, "1000");
    vi.setSystemTime(new Date("2026-09-30T13:05:00Z")); // 09:05 em Manaus: hora do salvamento
    fireEvent.click(screen.getByText("Salvar 1ª etapa do teste"));
    expect(ultimoB?.primeiraEtapaSalvaEm).toBe("2026-09-30T13:05:00.000Z");
    expect(ultimoB?.horaInicio).toBe("08:20");
  });

  it("preencher só o M3 também leva o teste para a 2ª etapa", () => {
    render(<HarnessB />);
    digitar(linha(0).m3, "50");
    expect(screen.queryByText("Salvar 1ª etapa do teste")).toBeNull();
    expect(screen.getByText(/2ª etapa em preenchimento/)).toBeInTheDocument();
  });

  it("1ª etapa da ficha nova: só Lacre, M0 e M1 (e lote/hora início) aceitam valor; Retirada, M3 e M2 ficam bloqueados", () => {
    render(<HarnessB somentePrimeiraEtapa aoSalvarPrimeiraEtapa={vi.fn()} />);
    expect((screen.getByPlaceholderText("Lote do teste") as HTMLInputElement).disabled).toBe(false);
    expect(horaInicioInput().disabled).toBe(false);
    expect((screen.getAllByPlaceholderText("Lacre")[0] as HTMLInputElement).disabled).toBe(false);
    for (let i = 0; i < 6; i++) {
      const l = linha(i);
      expect(l.m0.disabled).toBe(false);
      expect(l.m1.disabled).toBe(false);
      expect(l.m3.disabled).toBe(true);
      expect(l.m2.disabled).toBe(true);
      expect(l.retirada.disabled).toBe(true);
    }
    // continua sendo a 1ª etapa: o botão de salvar existe
    expect(screen.getByText("Salvar 1ª etapa do teste")).toBeInTheDocument();
  });

  it("2ª etapa (registro em andamento reaberto): dados da 1ª etapa travados; Retirada, M3 e M2 editáveis; sem botões do rodapé", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: i, seal: "", m0: "", m1: "", m3: "", horaRetirada: "", m2: "" }));
    items[0] = { ...items[0]!, seal: "0001", m0: "1000", m1: "10" };
    const etapa1 = { items, lote: "L-9", horaInicio: "08:00", primeiraEtapaSalvaEm: "2026-09-30T12:00:00.000Z", status: "conforme", averagePercentage: 0, validCount: 0, timeNonConformity: false } as DrippingTestValor;
    render(<HarnessB inicial={etapa1} primeiraEtapaTravada semAcoes />);

    expect(screen.getByTestId("primeira-etapa-travada")).toBeInTheDocument();
    expect(screen.queryByText("Salvar 1ª etapa do teste")).toBeNull();
    expect(screen.queryByTitle("Descartar Teste")).toBeNull();
    expect((screen.getByPlaceholderText("Lote do teste") as HTMLInputElement).disabled).toBe(true);
    expect(horaInicioInput().disabled).toBe(true);
    expect((screen.getAllByPlaceholderText("Lacre")[0] as HTMLInputElement).disabled).toBe(true);
    const l = linha(0);
    expect(l.m0.disabled).toBe(true);
    expect(l.m1.disabled).toBe(true);
    expect(l.m3.disabled).toBe(false);
    expect(l.m2.disabled).toBe(false);
    expect(l.retirada.disabled).toBe(false);
    digitar(l.m3, "50");
    digitar(l.m2, "940");
    digitar(l.retirada, "09:30");
    expect(ultimoB?.items[0]?.m3).toBe("50");
    expect(ultimoB?.items[0]?.m2).toBe("940");
    expect(ultimoB?.items[0]?.m0).toBe("1000"); // a 1ª etapa não mudou
    expect(ultimoB?.lote).toBe("L-9");
    expect(ultimoB?.primeiraEtapaSalvaEm).toBe("2026-09-30T12:00:00.000Z");
  });

  it("Descartar Teste pede confirmação e só então apaga tudo", () => {
    render(<HarnessB aoSalvarPrimeiraEtapa={vi.fn()} />);
    digitar(screen.getByPlaceholderText("Lote do teste"), "L-1");
    digitar(horaInicioInput(), "08:00");
    digitar(screen.getAllByPlaceholderText("Lacre")[0]!, "0001");
    digitar(linha(0).m0, "1000");

    const confirmar = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByTitle("Descartar Teste"));
    expect(confirmar).toHaveBeenCalledWith("Tem certeza que deseja apagar os dados parciais desta ficha?");
    expect((screen.getByPlaceholderText("Lote do teste") as HTMLInputElement).value).toBe("L-1");

    confirmar.mockReturnValueOnce(true);
    fireEvent.click(screen.getByTitle("Descartar Teste"));
    expect((screen.getByPlaceholderText("Lote do teste") as HTMLInputElement).value).toBe("");
    expect((screen.getAllByPlaceholderText("M0")[0] as HTMLInputElement).value).toBe("");
    expect(ultimoB!.lote).toBe("");
  });
});

describe("Relatório impresso e dossiê", () => {
  const valorA = {
    items: [
      { id: 0, seal: "L1", initial: "1.000", final: "1.150" },
      { id: 1, seal: "", initial: "4.000", final: "4.200" },
      { id: 2, seal: "", initial: "", final: "" },
      { id: 3, seal: "SÓ-LACRE", initial: "", final: "" },
    ],
    status: "conforme",
    averagePercentage: 7,
    validCount: 2,
    sumInitial: 5,
    sumFinal: 5.35,
  } as unknown as AbsorcaoAguaValor;

  it("A: só linhas com lacre/inicial/final; % individual só informativo; cabeçalho pela média por SOMA", async () => {
    const { AbsorcaoAguaRelatorio } = await import("@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio");
    render(<AbsorcaoAguaRelatorio valor={valorA} />);
    expect(screen.getByText(/Média de Absorção: 7,00% \(2 de 4 carcaças válidas\)/)).toBeInTheDocument();
    expect(screen.getByText("15,00%")).toBeInTheDocument();
    expect(screen.getByText("5,00%")).toBeInTheDocument();
    expect(screen.getByText("SÓ-LACRE")).toBeInTheDocument();
    expect(screen.queryByText(/ALERTA/)).toBeNull();
  });

  it("Dripping: o relatório mostra o % de absorção de CADA carcaça (M0−M1−M2)/(M0−M1−M3)", async () => {
    const { DrippingTestRelatorio } = await import("@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio");
    const item = (id: number, seal: string, m0: string, m1: string, m3: string, m2: string) => ({ id, seal, m0, m1, m3, m2, horaRetirada: "12:39" });
    const valor = {
      items: [item(0, "0001", "1000", "10", "50", "943"), item(1, "0002", "1000", "10", "50", "900"), item(2, "0003", "", "", "", "")],
      lote: "L1",
      horaInicio: "11:00",
      status: "conforme",
      averagePercentage: 7.5,
      validCount: 2,
      timeNonConformity: false,
    } as unknown as DrippingTestValor;
    render(<DrippingTestRelatorio valor={valor} />);
    expect(screen.getByText("Absorção (%)")).toBeInTheDocument();
    // linha 1: (1000-10-943)/(1000-10-50) = 47/940 = 5,00%; linha 2: 90/940 = 9,57% (acima de 6% → vermelho)
    expect(screen.getByTestId("dripping-absorcao-0").textContent).toBe("5,00%");
    expect(screen.getByTestId("dripping-absorcao-1").textContent).toBe("9,57%");
    expect(screen.getByTestId("dripping-absorcao-1").className).toContain("text-down");
    expect(screen.getByTestId("dripping-absorcao-2").textContent).toBe("—");
  });

  it("Dripping: o relatório mostra a hora inicial informada pelo inspetor e a hora final (assinatura)", async () => {
    const { DrippingTestRelatorio } = await import("@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio");
    const valor = {
      items: [],
      lote: "L1",
      horaInicio: "08:00",
      primeiraEtapaSalvaEm: "2026-09-30T12:00:00Z",
      status: "conforme",
      averagePercentage: 0,
      validCount: 0,
      timeNonConformity: false,
    } as unknown as DrippingTestValor;
    render(<DrippingTestRelatorio valor={valor} assinadoEm="2026-09-30T14:30:00Z" />);
    expect(screen.getByTestId("dripping-hora-inicial").textContent).toContain("08:00"); // a digitada pelo inspetor, não a do salvamento
    expect(screen.getByTestId("dripping-hora-final").textContent).toMatch(/30\/09\/2026,? 10:30:00/);
  });

  it("Dripping: sem assinatura a hora final aparece como —; teste de uma vez usa a hora de início digitada", async () => {
    const { DrippingTestRelatorio } = await import("@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio");
    const valor = { items: [], lote: "", horaInicio: "07:45", status: "conforme", averagePercentage: 0, validCount: 0, timeNonConformity: false } as unknown as DrippingTestValor;
    render(<DrippingTestRelatorio valor={valor} />);
    expect(screen.getByTestId("dripping-hora-inicial").textContent).toContain("07:45");
    expect(screen.getByTestId("dripping-hora-final").textContent).toContain("—");
  });

  it("A: não conforme mostra ⚠️ ALERTA: > 8%", async () => {
    const { AbsorcaoAguaRelatorio } = await import("@/modules/fichas/components/relatorio/CamposEspeciaisRelatorio");
    render(<AbsorcaoAguaRelatorio valor={{ ...valorA, status: "nao-conforme", averagePercentage: 9 }} />);
    expect(screen.getByText(/ALERTA: > 8%/)).toBeInTheDocument();
  });

  it("dossiê: valor com `itens` (registro antigo) em campo sem tipo composto usa o detalhe de absorção", async () => {
    const { DadosColetados } = await import("@/modules/fichas/components/DadosColetadosFicha");
    render(
      <DadosColetados
        campos={[{ chave: "legado", tipo: "texto", obrigatorio: false, label: "Absorção antiga" }] as never}
        dadosDinamicos={{ legado: { itens: [{ id: 0, seal: "X1", initial: "2", final: "2.1" }], status: "conforme", averagePercentage: 5, validCount: 1 } }}
      />
    );
    expect(screen.getByText("X1")).toBeInTheDocument();
    expect(screen.getByText(/Média de Absorção: 5,00%/)).toBeInTheDocument();
  });
});
