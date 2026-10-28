import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DadosRelatorio } from "@/modules/fichas/api";
import type { JustificativaHorario } from "@/modules/fichas/utils/justificativaHorario";

vi.mock("@/modules/fichas/utils/hashDocumento", async (original) => ({
  ...(await original<typeof import("@/modules/fichas/utils/hashDocumento")>()),
  computarHashMonitoramento: async () => "a".repeat(64),
}));

import { RelatorioMonitoramento } from "@/modules/fichas/components/relatorio/RelatorioMonitoramento";

const registro = {
  id: "m1",
  ficha_template_id: "t1",
  versao_template: 1,
  user_id: "u1",
  setor: "Pré-resfriamento",
  dados_dinamicos: {},
  conformidade: true,
  verificado_por: null,
  verificado_em: null,
  liberado_sif: false,
  origem_versao: "v2",
  aditivo_de: null,
  criado_em: "2026-10-28T13:00:00Z", // 09:00 em Manaus, 1º turno
  hora_monitoramento: "2026-10-28T13:00:00Z",
  capturado_em: null,
  status_ficha: "FINALIZADO",
  finalizado_em: null,
};

const just = (horarioManaus: string, motivo: string, extra: Partial<JustificativaHorario> = {}): JustificativaHorario => ({
  ficha_codigo: "RAC 003/011",
  setor: "Pré-resfriamento",
  horario_devido: new Date(`${horarioManaus}:00-04:00`).toISOString(),
  motivo,
  detalhes: null,
  registrado_por: "u1",
  registrado_em: "2026-10-28T20:00:00Z",
  ...extra,
});

function dados(justificativas?: JustificativaHorario[]): DadosRelatorio {
  return {
    monitoramentos: [registro],
    assinaturas: [],
    rncs: [],
    autocorrecoes: [],
    templatesPorId: new Map([["t1", { id: "t1", codigo: "RAC 003/011", nome: "Monitoramento de Absorção - Dados do Processo", pac_correspondente: "PAC 11", schema_campos: [] }]]),
    nomesPorId: new Map([["u1", "Ana Inspetora"]]),
    justificativas,
  } as unknown as DadosRelatorio;
}

describe("relatório: monitoramentos não realizados (justificativas)", () => {
  it("lista as justificativas do dia e do turno da ficha, com horário, motivo, detalhes e quem registrou", () => {
    render(
      <RelatorioMonitoramento
        ids={["m1"]}
        dados={dados([
          just("2026-10-28T10:00", "Processo parado"),
          just("2026-10-28T11:00", "Outro", { detalhes: "Queda do gerador" }),
          just("2026-10-28T19:00", "Intervenção do SIF"), // 2º turno do mesmo dia
          just("2026-10-27T10:00", "Intervenção do SIF"), // outro dia
          just("2026-10-28T10:30", "Intervenção do SIF", { ficha_codigo: "RAC 004/011" }), // outra ficha
          just("2026-10-28T12:00", "Intervenção do SIF", { setor: "Outro setor" }), // outro setor
        ])}
        turnoDe={() => "1º Turno"}
      />
    );
    const secao = screen.getByTestId("justificativas-nao-realizadas");
    expect(secao).toHaveTextContent("Monitoramentos não realizados — justificativas");
    const linhas = within(secao).getAllByRole("row").slice(1); // sem o cabeçalho
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent("10:00");
    expect(linhas[0]).toHaveTextContent("Processo parado");
    expect(linhas[0]).toHaveTextContent("Ana Inspetora");
    expect(linhas[1]).toHaveTextContent("11:00");
    expect(linhas[1]).toHaveTextContent("Queda do gerador");
    expect(secao).not.toHaveTextContent("Intervenção do SIF");
  });

  it("sem justificativas (ou sem a tabela no banco) o relatório sai como antes, sem a seção", () => {
    const { unmount } = render(<RelatorioMonitoramento ids={["m1"]} dados={dados([])} turnoDe={() => "1º Turno"} />);
    expect(screen.queryByTestId("justificativas-nao-realizadas")).toBeNull();
    unmount();
    render(<RelatorioMonitoramento ids={["m1"]} dados={dados(undefined)} turnoDe={() => "1º Turno"} />);
    expect(screen.queryByTestId("justificativas-nao-realizadas")).toBeNull();
  });
});
