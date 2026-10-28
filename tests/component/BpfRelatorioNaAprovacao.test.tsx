import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mutacao = { mutate: vi.fn(), isPending: false };

vi.mock("@/modules/bpf/api", () => ({
  useSolicitacoes: () => ({ data: [], isLoading: false }),
  useAprovarSolicitacao: () => mutacao,
  useEditarSolicitacao: () => mutacao,
  useReprovarSolicitacao: () => mutacao,
  useOrdensParaVerificar: () => ({ data: [], isLoading: false, isError: false }),
  useRelatorios: () => ({ data: [] }),
  useEmitirRelatorio: () => mutacao,
  useRegistrarVerificacao: () => mutacao,
}));
vi.mock("@/modules/bpf/RelatorioPorData", () => ({ RelatorioPorData: () => <div data-testid="relatorio-por-data">ESCOLHA A DATA E GERE</div> }));

import { AprovacoesPage } from "@/modules/bpf/AprovacoesPage";
import { VerificacaoDiariaPage } from "@/modules/bpf/VerificacaoDiariaPage";

const montar = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("relatório diário de OS na aprovação de solicitações", () => {
  it("abre nas solicitações, sem relatório pronto na tela", () => {
    montar(<AprovacoesPage />);
    expect(screen.getByRole("heading", { name: "Painel de Infraestrutura e Equipamentos" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Solicitações" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Aguardando sua assinatura/)).toBeInTheDocument();
    expect(screen.queryByTestId("relatorio-por-data")).toBeNull();
  });

  it("a aba Relatório mostra a escolha de data e geração, com o nome, o código de ficha e o PAC", () => {
    montar(<AprovacoesPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Relatório" }));
    expect(screen.getByTestId("relatorio-por-data")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monitoramento de Infraestrutura e Equipamentos" })).toBeInTheDocument();
    expect(screen.getByText(/RAC 002\/001 · PAC 1/)).toBeInTheDocument();
    expect(screen.queryByText(/Aguardando sua assinatura/)).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Solicitações" }));
    expect(screen.getByText(/Aguardando sua assinatura/)).toBeInTheDocument();
    expect(screen.queryByTestId("relatorio-por-data")).toBeNull();
  });
});

describe("verificação diária é só do inspetor", () => {
  it("não tem aba nem opção de gerar relatório", () => {
    montar(<VerificacaoDiariaPage />);
    expect(screen.getByRole("heading", { name: "Verificação de Infraestrutura e Equipamentos" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByTestId("relatorio-por-data")).toBeNull();
    expect(screen.queryByText(/Gerar relatório/)).toBeNull();
    // o inspetor continua encerrando o dia (emissão), que não é "gerar relatório"
    expect(screen.queryByText(/Encerrar o dia e emitir relatório/)).toBeNull(); // sem OS na lista, o botão nem aparece
  });
});
