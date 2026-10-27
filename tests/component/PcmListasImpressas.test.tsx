import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ordem, Solicitacao } from "@/modules/bpf/tipos";
import { useSessionStore } from "@/store/session";

let solicitacoes: Solicitacao[] = [];
let ordens: Ordem[] = [];

vi.mock("@/modules/bpf/api", () => ({
  useSolicitacoes: () => ({ data: solicitacoes, isLoading: false }),
  useOrdensProgramadas: () => ({ data: ordens, isLoading: false }),
  useProgramarSolicitacao: () => ({ mutate: vi.fn(), isPending: false }),
  useReprogramarOrdem: () => ({ mutate: vi.fn(), isPending: false }),
  useFotosSolicitacao: () => ({ data: [] }),
}));

import { PcmPage } from "@/modules/bpf/PcmPage";

const ss = (numero: number, descricao: string): Solicitacao => ({
  id: `ss-${numero}`,
  numero,
  setor: "MANUTENÇÕES DIVERSAS",
  centro_custo_id: "cc",
  centro: { id: "cc", codigo: "SANG", nome: "Sangria" },
  categoria: "Iluminação",
  descricao,
  local_detalhe: "Lado esquerdo",
  constatado_em: "2026-10-20T12:00:00Z",
  aberta_por: "insp",
  aberta_por_nome: "Inspetor Um",
  status: "APROVADA",
  aprovada_por_nome: "Ana Admin",
  aprovada_em: "2026-10-21T12:00:00Z",
  hash_aprovacao: "a".repeat(64),
  reprovada_por_nome: null,
  reprovada_em: null,
  motivo_reprovacao: null,
  criado_em: "2026-10-20T12:00:00Z",
});

const os = (numero: string, descricao: string, prazo: string, devolvida: boolean): Ordem =>
  ({
    id: `os-${numero}`,
    numero_os: numero,
    status: "PROGRAMADA",
    setor: "MANUTENÇÕES DIVERSAS",
    centro: { id: "cc", codigo: "SANG", nome: "Sangria" },
    descricao,
    acao_corretiva: "Trocar a peça",
    responsavel: "Paulo",
    constatado_em: "2026-10-01T12:00:00Z",
    prazo_atual: prazo,
    reprogramacoes: 0,
    origem: "v2",
    programacoes: [{ sequencia: 0, prazo, acao_corretiva: null, responsavel: null, justificativa: null, importada: false, programado_por_nome: "Paulo PCM", hash_assinatura: null, criado_em: "2026-10-02T12:00:00Z" }],
    verificacoes: devolvida
      ? [{ id: "v", ordem_id: `os-${numero}`, data_verificacao: "2026-10-23", hora_verificacao: "08:00:00", resultado: "NC", prazo_vigente: prazo, observacao: "Continua sem reparo", inspetor_nome: "Inspetor Um" }]
      : [],
  }) as unknown as Ordem;

describe("PCM — listas imprimíveis", () => {
  beforeEach(() => {
    solicitacoes = [ss(7, "Luminária apagada"), ss(8, "Porta quebrada")];
    ordens = [os("1001", "Porta com prazo vencido", "2026-10-30", true), os("1002", "Luminária no prazo", "2026-12-30", false)];
    useSessionStore.setState({ perfil: { id: "pcm", nomeCompleto: "Paulo PCM", nivelAcesso: "INSPETOR_PCM", setoresPermitidos: [] } });
    vi.spyOn(window, "print").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useSessionStore.setState({ perfil: null });
  });

  it("a aba 'A programar' imprime a lista das solicitações aprovadas", () => {
    render(<PcmPage />);
    const lista = within(screen.getByTestId("lista-impressa-pcm"));
    expect(lista.getByText("Lista de OS a programar")).toBeInTheDocument();
    expect(lista.getByText("Luminária apagada")).toBeInTheDocument();
    expect(lista.getByText("Porta quebrada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Imprimir lista/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("a aba 'Devolvidas pelo inspetor' imprime só as OS devolvidas, com a observação do inspetor", () => {
    render(<PcmPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Devolvidas pelo inspetor/ }));
    const lista = within(screen.getByTestId("lista-impressa-pcm"));
    expect(lista.getByText("Lista de OS devolvidas pelo inspetor")).toBeInTheDocument();
    expect(lista.getByText("Porta com prazo vencido")).toBeInTheDocument();
    expect(lista.getByText("Continua sem reparo")).toBeInTheDocument();
    expect(lista.queryByText("Luminária no prazo")).toBeNull();
  });

  it("a aba 'OS programadas' imprime todas as OS e respeita a busca", () => {
    render(<PcmPage />);
    fireEvent.click(screen.getByRole("tab", { name: /OS programadas/ }));
    let lista = within(screen.getByTestId("lista-impressa-pcm"));
    expect(lista.getByText("Lista de OS programadas")).toBeInTheDocument();
    expect(lista.getByText("Porta com prazo vencido")).toBeInTheDocument();
    expect(lista.getByText("Luminária no prazo")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscar OS"), { target: { value: "1002" } });
    lista = within(screen.getByTestId("lista-impressa-pcm"));
    expect(lista.queryByText("Porta com prazo vencido")).toBeNull();
    expect(lista.getByText("Luminária no prazo")).toBeInTheDocument();
    expect(screen.getByTestId("lista-impressa-pcm").textContent).toContain("filtro: “1002”");
  });

  it("a folha de impressão fica oculta na tela (só aparece ao imprimir) e é a que o CSS de impressão destaca", () => {
    render(<PcmPage />);
    const folha = screen.getByTestId("lista-impressa-pcm");
    expect(folha.id).toBe("relatorio-impressao");
    expect(folha.className).toContain("hidden");
    expect(folha.className).toContain("print:block");
  });

  it("sem itens na aba, o botão de imprimir fica desabilitado", () => {
    solicitacoes = [];
    render(<PcmPage />);
    expect(screen.getByRole("button", { name: /Imprimir lista/ })).toBeDisabled();
  });
});
