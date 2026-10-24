import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "@/store/session";
import type { Relatorio } from "@/modules/bpf/tipos";

const verificarMutate = vi.fn();
let relatorios: Relatorio[] = [];

vi.mock("@/modules/bpf/api", () => ({
  useRelatorios: () => ({ data: relatorios }),
  useVerificarRelatorio: () => ({ mutate: verificarMutate, isPending: false }),
}));
vi.mock("@/modules/bpf/RelatorioBpf", () => ({ RelatorioBpf: () => <div>CORPO DO RELATORIO</div> }));

import { RelatoriosOsParaVerificar } from "@/modules/bpf/RelatoriosOsParaVerificar";
import { RelatoriosOsArquivo } from "@/modules/bpf/RelatoriosOsArquivo";
import { relatoriosOsDoArquivo } from "@/modules/bpf/regras";

function relatorio(id: string, data: string, status: Relatorio["status"], extra: Partial<Relatorio> = {}): Relatorio {
  return {
    id,
    setor: "MANUTENÇÕES DIVERSAS",
    data_referencia: data,
    status,
    itens: [],
    qtd_nc: 2,
    qtd_np: 3,
    qtd_conformes: 0,
    emitido_por: "insp",
    emitido_por_nome: "Inspetor BPF",
    emitido_em: "2026-10-24T12:00:00Z",
    hash_emissao: "a".repeat(64),
    verificado_por: status === "emitido" ? null : "ver",
    verificado_por_nome: status === "emitido" ? null : "Vera Verificadora",
    verificado_em: status === "emitido" ? null : "2026-10-24T13:00:00Z",
    hash_verificacao: status === "emitido" ? null : "b".repeat(64),
    liberado_por: null,
    liberado_por_nome: null,
    liberado_em: null,
    hash_liberacao: null,
    ...extra,
  };
}

// Sem DialogProvider em volta: nos painéis de Verificação e de Arquivo não existe um (foi a causa da tela branca).
const comDialogo = (ui: React.ReactElement) => render(ui);

describe("Relatório de OS (BPF): verificação no Painel de Verificação e liberação no Painel de Arquivo", () => {
  beforeEach(() => {
    verificarMutate.mockClear();
    relatorios = [relatorio("r-emitido", "2026-10-24", "emitido"), relatorio("r-verificado", "2026-10-23", "verificado"), relatorio("r-liberado", "2026-10-22", "liberado", { liberado_por_nome: "Admin" })];
    useSessionStore.setState({ perfil: { id: "ver", nomeCompleto: "Vera Verificadora", nivelAcesso: "VERIFICADOR", setoresPermitidos: ["Todos"] } });
  });
  afterEach(() => useSessionStore.setState({ perfil: null }));

  it("Painel de Verificação: lista só os emitidos e o botão VERIFICA (não libera ao SIF)", async () => {
    comDialogo(<RelatoriosOsParaVerificar />);
    expect(screen.getByText(/aguardando sua verificação \(1\)/)).toBeInTheDocument();
    expect(screen.getByTestId("relatorio-os-2026-10-24")).toBeInTheDocument();
    expect(screen.queryByTestId("relatorio-os-2026-10-23")).toBeNull();
    expect(screen.queryByText(/liberar ao SIF/i)).toBeNull();

    fireEvent.click(screen.getByText("Verificar relatório"));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar|sim|ok/i }));
    await waitFor(() => expect(verificarMutate).toHaveBeenCalledWith("r-emitido", expect.anything()));
  });

  it("Painel de Verificação: some quando não há relatório emitido", () => {
    relatorios = [relatorio("r-verificado", "2026-10-23", "verificado")];
    comDialogo(<RelatoriosOsParaVerificar />);
    expect(screen.queryByTestId("relatorios-os-para-verificar")).toBeNull();
  });

  it("Painel de Verificação: quem emitiu o relatório não vê o botão de verificar", () => {
    useSessionStore.setState({ perfil: { id: "insp", nomeCompleto: "Inspetor BPF", nivelAcesso: "ADMIN_MASTER", setoresPermitidos: [] } });
    comDialogo(<RelatoriosOsParaVerificar />);
    expect(screen.queryByText("Verificar relatório")).toBeNull();
    expect(screen.getByText(/Você emitiu este relatório/)).toBeInTheDocument();
  });

  it("Painel de Arquivo: o relatório verificado aparece para seleção (como as fichas); a liberação é pelo botão do painel", () => {
    const alternar = vi.fn();
    comDialogo(<RelatoriosOsArquivo liberacao="pendentes" podeLiberar selecionados={new Set()} aoAlternar={alternar} />);
    expect(screen.queryByTestId("arquivo-relatorio-os-2026-10-24")).toBeNull(); // ainda não verificado
    expect(screen.queryByTestId("arquivo-relatorio-os-2026-10-22")).toBeNull(); // já liberado: fora do filtro "pendentes"
    expect(screen.queryByText(/Liberar relatórios de OS/)).toBeNull(); // sem botão próprio: é o botão do painel

    fireEvent.click(screen.getByLabelText(/Selecionar relatório de OS de 23\/10\/2026/));
    expect(alternar).toHaveBeenCalledWith("r-verificado");
  });

  it("Painel de Arquivo: sem permissão de liberar (Verificador) não há seleção", () => {
    comDialogo(<RelatoriosOsArquivo liberacao="todas" podeLiberar={false} selecionados={new Set()} aoAlternar={vi.fn()} />);
    expect(screen.getByTestId("arquivo-relatorio-os-2026-10-23")).toBeInTheDocument();
    expect(screen.getByTestId("arquivo-relatorio-os-2026-10-22")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("relatoriosOsDoArquivo respeita o filtro de liberação do painel", () => {
    expect(relatoriosOsDoArquivo(relatorios, "pendentes").map((r) => r.id)).toEqual(["r-verificado"]);
    expect(relatoriosOsDoArquivo(relatorios, "liberadas").map((r) => r.id)).toEqual(["r-liberado"]);
    expect(relatoriosOsDoArquivo(relatorios, "todas").map((r) => r.id)).toEqual(["r-verificado", "r-liberado"]);
  });
});
