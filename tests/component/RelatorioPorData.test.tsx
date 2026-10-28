import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelatorioDoDia } from "@/modules/bpf/tipos";

const gerarMutate = vi.fn();
let resposta: RelatorioDoDia;

vi.mock("@/modules/bpf/api", () => ({
  useGerarRelatorioDoDia: () => ({
    mutate: (dia: string, opcoes: { onSuccess: (r: RelatorioDoDia) => void }) => {
      gerarMutate(dia);
      opcoes.onSuccess(resposta);
    },
    isPending: false,
  }),
}));
vi.mock("@/modules/bpf/RelatorioBpf", () => ({
  RelatorioBpf: ({ relatorio }: { relatorio: { data_referencia: string } }) => <div data-testid="corpo">RELATORIO {relatorio.data_referencia}</div>,
}));

import { DialogProvider } from "@/modules/gestao/dialogSystem";
import { RelatorioPorData } from "@/modules/bpf/RelatorioPorData";

const provisorio = (data: string): RelatorioDoDia => ({
  provisorio: true,
  setor: "MANUTENÇÕES DIVERSAS",
  data_referencia: data,
  gerado_em: "2026-10-28T15:00:00Z",
  itens: [],
  itens_posteriores: [],
  reprogramacoes_posteriores: [],
  qtd_nc: 0,
  qtd_np: 0,
  qtd_conformes: 0,
  qtd_nc_reprogramadas: 0,
  sem_verificacao_pendentes: 0,
});

const montar = () =>
  render(
    <DialogProvider>
      <RelatorioPorData />
    </DialogProvider>
  );

describe("RelatorioPorData", () => {
  beforeEach(() => {
    gerarMutate.mockClear();
    resposta = provisorio("2026-10-27");
  });

  it("não mostra relatório pronto: sem data escolhida o botão fica desligado e nada é gerado", () => {
    montar();
    expect(screen.queryByTestId("corpo")).toBeNull();
    expect(screen.getByRole("button", { name: "Gerar relatório" })).toBeDisabled();
    expect(gerarMutate).not.toHaveBeenCalled();
  });

  it("gera o relatório da data escolhida, ao clicar em Gerar, e avisa que foi gerado na hora", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Data do relatório"), { target: { value: "2026-10-27" } });
    expect(screen.queryByTestId("corpo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(gerarMutate).toHaveBeenCalledWith("2026-10-27");
    expect(screen.getByTestId("corpo")).toHaveTextContent("RELATORIO 2026-10-27");
    expect(screen.getByText(/gerado na hora/)).toBeInTheDocument();
  });

  it("trocar a data tira da tela o relatório da data anterior", () => {
    montar();
    fireEvent.change(screen.getByLabelText("Data do relatório"), { target: { value: "2026-10-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(screen.getByTestId("corpo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Data do relatório"), { target: { value: "2026-10-26" } });
    expect(screen.queryByTestId("corpo")).toBeNull();
  });

  it("data com relatório emitido mostra o status do emitido, não o aviso de gerado na hora", () => {
    resposta = { ...provisorio("2026-10-27"), provisorio: false, id: "r1", status: "verificado" } as unknown as RelatorioDoDia;
    montar();
    fireEvent.change(screen.getByLabelText("Data do relatório"), { target: { value: "2026-10-27" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(screen.getByText("verificado, aguardando liberação ao SIF")).toBeInTheDocument();
    expect(screen.queryByText(/gerado na hora/)).toBeNull();
  });
});
