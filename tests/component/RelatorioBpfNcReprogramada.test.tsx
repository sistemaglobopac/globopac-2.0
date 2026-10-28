import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelatorioBpf } from "@/modules/bpf/RelatorioBpf";
import type { ItemRelatorio, Relatorio, RelatorioProvisorio } from "@/modules/bpf/tipos";

function item(numero: string, extra: Partial<ItemRelatorio> = {}): ItemRelatorio {
  return {
    numero_os: numero,
    solicitacao_numero: 7,
    anomalia: `Anomalia da ${numero}`,
    categoria: "Piso",
    local_detalhe: null,
    setor_area: "Escaldagem",
    centro_custo_codigo: "CC1",
    acao_corretiva: "Trocar o piso",
    responsavel: null,
    constatado_em: "2026-10-20T12:00:00Z",
    constatado_por: "Ana",
    aprovada_por: "Admin",
    aprovada_em: "2026-10-20T13:00:00Z",
    aprovada_hash: "a".repeat(64),
    origem: "v2",
    prazo_vigente: "2026-10-25",
    reprogramacoes: 0,
    programacao: [],
    resultado: "NC",
    data_verificacao: "2026-10-28",
    hora_verificacao: "09:30:00",
    inspetor: "Ana",
    observacao: null,
    ...extra,
  };
}

const reprogramada = { sequencia: 1, prazo: "2026-11-05", justificativa: "Sem material", por: "Paulo PCM", em: "2026-10-28T18:00:00Z", hash: "c".repeat(64) };

function emitido(extra: Partial<Relatorio> = {}): Relatorio {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    setor: "MANUTENÇÕES DIVERSAS",
    data_referencia: "2026-10-28",
    status: "emitido",
    itens: [item("OS-1"), item("OS-2")],
    itens_posteriores: [],
    reprogramacoes_posteriores: [],
    qtd_nc: 2,
    qtd_np: 0,
    qtd_conformes: 0,
    qtd_nc_reprogramadas: 0,
    emitido_por: "insp",
    emitido_por_nome: "Inspetora Ana",
    emitido_em: "2026-10-28T17:00:00Z",
    hash_emissao: "d".repeat(64),
    verificado_por: null,
    verificado_por_nome: null,
    verificado_em: null,
    hash_verificacao: null,
    liberado_por: null,
    liberado_por_nome: null,
    liberado_em: null,
    hash_liberacao: null,
    ...extra,
  };
}

describe("RelatorioBpf: NC reprogramada no mesmo dia", () => {
  it("NC que o PCM reprogramou consta como reprogramada, com o novo prazo, e fica fora da contagem de NC", () => {
    render(<RelatorioBpf relatorio={emitido({ itens: [item("OS-1", { reprogramada }), item("OS-2")], qtd_nc: 1, qtd_nc_reprogramadas: 1 })} />);
    const nota = screen.getByTestId("nc-reprogramada-OS-1");
    expect(nota).toHaveTextContent(/reprogramada pelo PCM/);
    expect(nota).toHaveTextContent("05/11/2026");
    expect(nota).toHaveTextContent("Paulo PCM");
    expect(screen.queryByTestId("nc-reprogramada-OS-2")).toBeNull();
    expect(screen.getByText(/1 não conforme\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 NC reprogramada\(s\) pelo PCM/)).toBeInTheDocument();
  });

  it("reprogramação feita depois da emissão aparece no item sem alterar os itens gravados", () => {
    const rel = emitido({ qtd_nc: 1, qtd_nc_reprogramadas: 1, reprogramacoes_posteriores: [{ numero_os: "OS-2", reprogramada }] });
    render(<RelatorioBpf relatorio={rel} />);
    expect(screen.getByTestId("nc-reprogramada-OS-2")).toBeInTheDocument();
    expect(screen.queryByTestId("nc-reprogramada-OS-1")).toBeNull();
    expect(rel.itens[1]!.reprogramada).toBeUndefined();
  });

  it("sem reprogramação nada muda: sem nota e sem a contagem de reprogramadas", () => {
    render(<RelatorioBpf relatorio={emitido()} />);
    expect(screen.queryByTestId("nc-reprogramada-OS-1")).toBeNull();
    expect(screen.queryByText(/NC reprogramada/)).toBeNull();
  });
});

describe("RelatorioBpf: gerado na hora (provisório)", () => {
  const provisorio: RelatorioProvisorio = {
    provisorio: true,
    setor: "MANUTENÇÕES DIVERSAS",
    data_referencia: "2026-10-28",
    gerado_em: "2026-10-28T15:00:00Z",
    itens: [item("OS-9", { resultado: "NP", sem_verificacao: true, data_verificacao: null, hora_verificacao: null, inspetor: null, programada_em: "2026-10-28T14:00:00Z" })],
    itens_posteriores: [],
    reprogramacoes_posteriores: [],
    qtd_nc: 0,
    qtd_np: 1,
    qtd_conformes: 0,
    qtd_nc_reprogramadas: 0,
    sem_verificacao_pendentes: 2,
  };

  it("avisa que não foi emitido, não traz selo de emissão nem atestado e conta as OS sem veredito", () => {
    render(<RelatorioBpf relatorio={provisorio} />);
    const aviso = screen.getByTestId("aviso-provisorio");
    expect(aviso).toHaveTextContent(/Ainda não foi emitido e assinado/);
    expect(aviso).toHaveTextContent(/2 OS em aberto no dia/);
    expect(screen.getByText("Dia ainda não encerrado pelo inspetor")).toBeInTheDocument();
    expect(screen.queryByText(/Identificador único do documento/)).toBeNull();
    expect(screen.getByText("Programada pelo PCM")).toBeInTheDocument();
  });

  it("o relatório emitido não mostra o aviso de provisório", () => {
    render(<RelatorioBpf relatorio={emitido()} />);
    expect(screen.queryByTestId("aviso-provisorio")).toBeNull();
    expect(screen.getByText(/Identificador único do documento/)).toBeInTheDocument();
  });
});
