import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardPage } from "@/modules/bi/DashboardPage";
import { ConsumoAguaTab } from "@/modules/bi/consumoAgua/ConsumoAguaTab";
import type { DadosConsumoAgua } from "@/modules/bi/consumoAgua/api";
import type { RegistroAgua, TemplateAgua } from "@/modules/bi/consumoAgua/calculo";
import { useSessionStore } from "@/store/session";

const baixarCsv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csv", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/csv")>()), baixarCsv }));

const resultadoApi = vi.hoisted(() => ({ atual: { dados: undefined as unknown, carregando: false, erro: null as Error | null } }));
vi.mock("@/modules/bi/consumoAgua/api", () => ({ useRegistrosAgua: () => resultadoApi.atual }));
vi.mock("@/modules/bi/api", () => ({
  useMonitoramentosResumo: () => ({ data: [], isLoading: false }),
  useRncResumo: () => ({ data: [], isLoading: false }),
  useOsResumo: () => ({ data: [], isLoading: false }),
}));
// recharts não mede tamanho no jsdom; os dados dos gráficos já são cobertos pelos testes do cálculo.
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return { ...original, ResponsiveContainer: ({ children }: { children: never }) => <div data-testid="grafico">{children}</div> };
});

const template: TemplateAgua = {
  id: "t1",
  codigo: "RAC-001/006 V2",
  schema_campos: [
    { chave: "carcacas", tipo: "chiller_carcacas" },
    { chave: "chuveiro", tipo: "lavagem_final" },
  ],
};

const iso = (dataHora: string) => new Date(`${dataHora}:00-04:00`).toISOString();
let n = 0;
function registro(hora: string, pre: [string, string, string], chuveiro: [string, string]): RegistroAgua {
  n += 1;
  return {
    id: `r${n}`,
    ficha_template_id: "t1",
    setor: "Pré-resfriamento",
    criado_em: iso(hora),
    hora_monitoramento: iso(hora),
    aditivo_de: null,
    dados_dinamicos: {
      carcacas: { tanques: { preChiller: { prev: pre[0], cur: pre[1], ice: pre[2] }, chiller1: { prev: "", cur: "", ice: "" }, chiller2: { prev: "", cur: "", ice: "" } } },
      chuveiro: { chuveiro: { prev: chuveiro[0], cur: chuveiro[1] } },
    },
  };
}

const dados: DadosConsumoAgua = {
  templates: new Map([["t1", template]]),
  registros: [
    registro("2026-10-06 08:00", ["", "500", "1995"], ["", "50"]),
    // 4,635 m³ de água no pré-chiller (com o gelo seriam 6,630) e 2 m³ no chuveiro.
    registro("2026-10-06 10:00", ["500", "504.635", "1995"], ["50", "52"]),
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T15:00:00Z")); // 11h em Manaus
  baixarCsv.mockClear();
  resultadoApi.atual = { dados, carregando: false, erro: null };
  useSessionStore.setState({ perfil: { id: "u1", nomeCompleto: "Admin", nivelAcesso: "ADMIN_MASTER", setoresPermitidos: [] } });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const user = () => userEvent.setup({ advanceTimers: () => undefined });

describe("Painel de BI — aba Consumo de água", () => {
  it("mostra o consumo só de água (sem gelo): chillers somados, chuveiro à parte e total geral", () => {
    render(<ConsumoAguaTab />);
    // 4,635 m³ aparece no KPI dos chillers e no cartão do SPR Carcaças; 2,000 m³ no KPI e no cartão do Chuveiro Final.
    expect(screen.getByText("Total dos chillers somados")).toBeTruthy();
    expect(screen.getAllByText("4,635 m³")).toHaveLength(2);
    expect(screen.getAllByText("2,000 m³")).toHaveLength(2);
    expect(screen.getAllByText("6,635 m³")).toHaveLength(2); // total geral (chillers + chuveiro) e a média do único dia com consumo
  });

  it("tabela por dia: linha do dia, coluna de cada chiller e linha de total", () => {
    render(<ConsumoAguaTab />);
    const tabela = screen.getByRole("table");
    const linhaDia = within(tabela).getByRole("row", { name: /06\/10\/2026/ });
    expect(within(linhaDia).getAllByText("4,635").length).toBeGreaterThan(0); // pré-chiller e total dos chillers
    expect(within(tabela).getByRole("columnheader", { name: "Pré-chiller" })).toBeTruthy();
    expect(within(tabela).getByRole("columnheader", { name: "Total chillers" })).toBeTruthy();
    expect(within(tabela).getByRole("row", { name: /^Total/ })).toBeTruthy();
  });

  it("troca a unidade para litros e o agrupamento para hora (o volume é dividido entre as horas do intervalo)", async () => {
    render(<ConsumoAguaTab />);
    await user().click(screen.getByRole("button", { name: "Litros" }));
    expect(screen.getAllByText("6.635 L").length).toBeGreaterThan(0);

    await user().click(screen.getByRole("button", { name: "Hora" }));
    const tabela = screen.getByRole("table");
    expect(within(tabela).getByRole("row", { name: /06\/10\/2026 08h/ })).toBeTruthy();
    expect(within(tabela).getByRole("row", { name: /06\/10\/2026 09h/ })).toBeTruthy();
  });

  it("exporta CSV com o período e os totais", async () => {
    render(<ConsumoAguaTab />);
    await user().click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(baixarCsv).toHaveBeenCalledTimes(1);
    const [nome, conteudo] = baixarCsv.mock.calls[0] as [string, string];
    expect(nome).toBe("consumo-agua-dia-2026-10-01-a-2026-10-07.csv");
    expect(conteudo).toContain("Total chillers (m³)");
    expect(conteudo).toContain("TOTAL");
    expect(conteudo).toContain("6,635");
  });

  it("sem leituras no período avisa em vez de mostrar tabela vazia", () => {
    resultadoApi.atual = { dados: { templates: dados.templates, registros: [] }, carregando: false, erro: null };
    render(<ConsumoAguaTab />);
    expect(screen.getByText("Sem leituras de hidrômetro apuradas no período.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("hora a hora em período longo pede um período menor", async () => {
    render(<ConsumoAguaTab />);
    await user().click(screen.getByRole("button", { name: "Hora" }));
    expect(screen.getByRole("table")).toBeTruthy(); // 7 dias: cabe
    await user().click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("De"), { target: { value: "2026-08-01" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/até 31 dias/)).toBeTruthy();
  });
});

describe("Painel de BI — abas", () => {
  it("Administrador vê a aba Consumo de água e abre o conteúdo dela", async () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Painel de BI" })).toBeTruthy();
    expect(screen.getByText("Monitoramentos (30 dias)")).toBeTruthy();
    await user().click(screen.getByRole("tab", { name: "Consumo de água" }));
    expect(screen.getByRole("tab", { name: "Consumo de água", selected: true })).toBeTruthy();
    expect(screen.getByText("Total dos chillers somados")).toBeTruthy();
    expect(screen.queryByText("Monitoramentos (30 dias)")).toBeNull();
  });

  it("Inspetor PCM só vê a visão geral (sem abas)", () => {
    useSessionStore.setState({ perfil: { id: "u2", nomeCompleto: "PCM", nivelAcesso: "INSPETOR_PCM", setoresPermitidos: [] } });
    render(<DashboardPage />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Monitoramentos (30 dias)")).toBeTruthy();
  });
});
