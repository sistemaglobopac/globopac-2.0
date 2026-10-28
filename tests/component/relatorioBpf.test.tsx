import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelatorioBpf } from "@/modules/bpf/RelatorioBpf";
import type { ItemRelatorio, Relatorio } from "@/modules/bpf/tipos";

const hash = (c: string) => c.repeat(64);

const itemV2: ItemRelatorio = {
  numero_os: "900001",
  solicitacao_numero: 12,
  anomalia: "Luminária sem emitir luz",
  categoria: "Iluminação",
  local_detalhe: null,
  setor_area: "Sangria",
  centro_custo_codigo: "SANGRIA",
  acao_corretiva: "Trocar luminária",
  responsavel: "Cláudia",
  constatado_em: "2026-10-15T14:00:00-04:00",
  constatado_por: "Inspetor Um",
  aprovada_por: "Ana Admin",
  aprovada_em: "2026-10-15T16:00:00-04:00",
  aprovada_hash: hash("a"),
  origem: "v2",
  prazo_vigente: "2026-10-20",
  reprogramacoes: 0,
  programacao: [{ sequencia: 0, prazo: "2026-10-20", justificativa: null, por: "Paulo PCM", em: "2026-10-16T09:00:00-04:00", hash: hash("b") }],
  resultado: "NC",
  data_verificacao: "2026-10-21",
  hora_verificacao: "08:15:00",
  inspetor: "Inspetor Um",
  observacao: null,
};

const itemImportado: ItemRelatorio = {
  ...itemV2,
  numero_os: "463597",
  solicitacao_numero: null,
  anomalia: "Porta da sangria não está fechando corretamente",
  aprovada_por: null,
  aprovada_em: null,
  aprovada_hash: null,
  origem: "importada",
  reprogramacoes: 1,
  programacao: [
    { sequencia: 0, prazo: "2026-09-22", justificativa: null, por: null, em: "2026-10-21T07:00:00-04:00", hash: null },
    { sequencia: 1, prazo: "2026-10-20", justificativa: null, por: null, em: "2026-10-21T07:00:00-04:00", hash: null },
  ],
};

const base: Relatorio = {
  id: "r1",
  setor: "MANUTENÇÕES DIVERSAS",
  data_referencia: "2026-10-21",
  status: "emitido",
  itens: [itemV2, itemImportado],
  qtd_nc: 2,
  qtd_np: 0,
  qtd_conformes: 1,
  emitido_por: "u1",
  emitido_por_nome: "Inspetor Um",
  emitido_em: "2026-10-21T17:00:00-04:00",
  hash_emissao: hash("e"),
  verificado_por: null,
  verificado_por_nome: null,
  verificado_em: null,
  hash_verificacao: null,
  liberado_por: null,
  liberado_por_nome: null,
  liberado_em: null,
  hash_liberacao: null,
};

describe("RelatorioBpf", () => {
  it("mostra as linhas no formato do formulário, com rótulos de programação e reprogramação", () => {
    render(<RelatorioBpf relatorio={base} />);
    expect(screen.getByText("Monitoramento de Infraestrutura e Equipamentos")).toBeTruthy();
    expect(screen.getByTestId("codigo-ficha-bpf")).toHaveTextContent("RAC 002/001");
    expect(screen.getByText("OS: 463597")).toBeTruthy();
    expect(screen.getByText(/Rep\. I: 20\/10\/2026/)).toBeTruthy();
    expect(screen.getByText(/Prog: 22\/09\/2026/)).toBeTruthy();
  });

  it("traz as quatro assinaturas: inspetor, administrador, PCM e Verificador", () => {
    render(<RelatorioBpf relatorio={base} />);
    const assinaturas = within(screen.getByLabelText("Assinaturas"));
    expect(assinaturas.getByText("Inspetor Um")).toBeTruthy();
    expect(assinaturas.getByText("Ana Admin")).toBeTruthy();
    expect(assinaturas.getByText("Paulo PCM")).toBeTruthy();
    expect(assinaturas.getByText(/Aguardando verificação do Verificador/)).toBeTruthy();
  });

  it("usa o selo de assinatura e o atestado de validade jurídica dos relatórios de monitoramento", () => {
    render(<RelatorioBpf relatorio={base} />);
    const assinaturas = within(screen.getByLabelText("Assinaturas"));
    expect(assinaturas.getAllByText("SISTEMA GLOBOPAC").length).toBe(3); // inspetor, administrador e PCM; o Verificador ainda não assinou
    expect(assinaturas.getAllByText(/LEI 14\.063\/2020/).length).toBe(3);
    expect(assinaturas.getByText(/SHA-256: EEEEEEEEEEEEEEEEEEEE/)).toBeTruthy();
    expect(screen.getByText(/Atestado de Validade Jurídica e Compliance Tecnológico/)).toBeTruthy();
    expect(screen.getByText("GS-20261021-R1-BPF")).toBeTruthy();
    expect(screen.getByText(/Sistema GloboPac · Kaefer Agro Industrial LTDA\. · SIF 1606/)).toBeTruthy();
  });

  it("depois da verificação mostra o Verificador (e nenhum selo de liberação) e avisa das OS importadas sem assinatura no sistema", () => {
    render(
      <RelatorioBpf
        relatorio={{ ...base, status: "liberado", verificado_por: "u2", verificado_por_nome: "Vera Verificadora", verificado_em: "2026-10-21T18:00:00-04:00", hash_verificacao: hash("f"), liberado_por: "u3", liberado_por_nome: "Admin Que Libera", liberado_em: "2026-10-22T09:00:00-04:00" }}
      />
    );
    expect(within(screen.getByLabelText("Assinaturas")).getByText("Vera Verificadora")).toBeTruthy();
    // Liberar ao SIF não é assinatura do administrador: quem liberou não aparece nos selos.
    expect(within(screen.getByLabelText("Assinaturas")).queryByText("Admin Que Libera")).toBeNull();
    expect(screen.getByText(/1 OS deste relatório foram importadas/)).toBeTruthy();
  });
});
