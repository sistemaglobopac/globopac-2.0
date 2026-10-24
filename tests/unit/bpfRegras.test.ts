import { describe, expect, it } from "vitest";
import {
  diasEntre,
  formatarData,
  hojeManaus,
  pendentesDeVerificacao,
  resultadosPermitidos,
  resumirAssinaturas,
  rotuloProgramacao,
  situacaoPrazo,
} from "@/modules/bpf/regras";
import { dataParaIso, lerCsvOrdens } from "@/modules/bpf/importacao";
import type { ItemRelatorio, Ordem } from "@/modules/bpf/tipos";

describe("resultadosPermitidos", () => {
  it("dentro do prazo (inclusive no dia do prazo): C, NP ou NC (executada sem sanar o desvio)", () => {
    expect(resultadosPermitidos("2026-10-25", "2026-10-21")).toEqual(["C", "NP", "NC"]);
    expect(resultadosPermitidos("2026-10-21", "2026-10-21")).toEqual(["C", "NP", "NC"]);
  });
  it("prazo vencido: C ou NC", () => {
    expect(resultadosPermitidos("2026-10-20", "2026-10-21")).toEqual(["C", "NC"]);
  });
});

describe("situacaoPrazo", () => {
  it("descreve vencido, hoje e futuro", () => {
    expect(situacaoPrazo("2026-10-18", "2026-10-21")).toMatchObject({ vencido: true, dias: 3, texto: "Vencido há 3 dias" });
    expect(situacaoPrazo("2026-10-20", "2026-10-21").texto).toBe("Vencido há 1 dia");
    expect(situacaoPrazo("2026-10-21", "2026-10-21")).toMatchObject({ vencido: false, texto: "Vence hoje" });
    expect(situacaoPrazo("2026-11-04", "2026-10-21").texto).toBe("Vence em 14 dias");
  });
});

describe("datas", () => {
  it("hoje em Manaus não vira o dia às 21h (UTC-4)", () => {
    expect(hojeManaus(new Date("2026-10-21T23:30:00-04:00"))).toBe("2026-10-21");
    expect(hojeManaus(new Date("2026-10-22T03:30:00Z"))).toBe("2026-10-21");
  });
  it("formata data pura sem deslocar por fuso", () => {
    expect(formatarData("2026-10-21")).toBe("21/10/2026");
    expect(formatarData(null)).toBe("—");
  });
  it("diasEntre atravessa mês e ano", () => {
    expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
  });
  it("rótulos de programação", () => {
    expect([0, 1, 2, 3].map(rotuloProgramacao)).toEqual(["Prog", "Rep. I", "Rep. II", "Rep. III"]);
  });
});

describe("pendentesDeVerificacao", () => {
  const base = { status: "PROGRAMADA", verificacoes: [] } as unknown as Ordem;
  it("só exige OS criadas antes do início do dia e ainda sem veredito", () => {
    const antiga = { ...base, id: "a", criado_em: "2026-10-20T10:00:00-04:00" } as Ordem;
    const nova = { ...base, id: "b", criado_em: "2026-10-21T08:00:00-04:00" } as Ordem;
    const feita = {
      ...base,
      id: "c",
      criado_em: "2026-10-19T10:00:00-04:00",
      verificacoes: [{ data_verificacao: "2026-10-21" }],
    } as unknown as Ordem;
    expect(pendentesDeVerificacao([antiga, nova, feita], "2026-10-21").map((o) => o.id)).toEqual(["a"]);
  });
});

describe("importação CSV", () => {
  it("converte datas brasileiras e rejeita datas impossíveis", () => {
    expect(dataParaIso("02/09/2026")).toBe("2026-09-02");
    expect(dataParaIso("31/02/2026")).toBeNull();
    expect(dataParaIso("lixo")).toBeNull();
  });

  it("lê OS com reprogramações; o prazo vigente é o último", () => {
    const csv =
      "numero_os;anomalia;setor;acao_corretiva;responsavel;data_abertura;prazo_programado;reprogramacoes\r\n" +
      '463597;"Porta da sangria; não fecha";Sangria;Regular porta;Katiuscia;02/09/2026;22/09/2026;20/10/2026\r\n' +
      "467367;Solda não sanitária;Escaldagem/Depenagem;Corrigir a solda;Leidiane;25/08/2026;19/09/2026;10/10/2026|15/11/2026\r\n";
    const { itens, erros } = lerCsvOrdens(csv);
    expect(erros).toEqual([]);
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ numero_os: "463597", descricao: "Porta da sangria; não fecha", prazos: ["2026-09-22", "2026-10-20"] });
    expect(itens[1]!.prazos).toEqual(["2026-09-19", "2026-10-10", "2026-11-15"]);
  });

  it("aponta a linha com problema sem descartar as boas", () => {
    const csv =
      "numero_os;anomalia;setor;prazo_programado\n" +
      "1;Algo quebrado;Sangria;99/99/2026\n" +
      "2;Outra coisa;Sangria;10/11/2026\n" +
      "2;Repetida;Sangria;10/11/2026\n";
    const { itens, erros } = lerCsvOrdens(csv);
    expect(itens.map((i) => i.numero_os)).toEqual(["2"]);
    expect(erros).toHaveLength(2);
    expect(erros[0]).toContain("Linha 2");
    expect(erros[1]).toContain("repetida");
  });

  it("exige as colunas obrigatórias", () => {
    expect(lerCsvOrdens("numero_os;anomalia\n1;x").erros[0]).toContain("setor");
  });
});

describe("resumirAssinaturas", () => {
  const item = (o: Partial<ItemRelatorio>): ItemRelatorio =>
    ({ numero_os: "1", solicitacao_numero: null, aprovada_por: null, aprovada_em: null, aprovada_hash: null, programacao: [], ...o }) as ItemRelatorio;

  it("agrupa administradores e usuários do PCM e ignora programações sem hash (importadas)", () => {
    const itens = [
      item({
        numero_os: "10",
        solicitacao_numero: 3,
        aprovada_por: "Ana Admin",
        aprovada_em: "2026-10-20T10:00:00Z",
        aprovada_hash: "a".repeat(64),
        programacao: [{ sequencia: 0, prazo: "2026-11-01", justificativa: null, por: "Paulo PCM", em: "2026-10-20T11:00:00Z", hash: "b".repeat(64) }],
      }),
      item({
        numero_os: "11",
        solicitacao_numero: 4,
        aprovada_por: "Ana Admin",
        aprovada_em: "2026-10-20T10:05:00Z",
        aprovada_hash: "c".repeat(64),
        programacao: [{ sequencia: 0, prazo: "2026-11-02", justificativa: null, por: "Paulo PCM", em: "2026-10-20T11:05:00Z", hash: "d".repeat(64) }],
      }),
      item({
        numero_os: "463597",
        programacao: [
          { sequencia: 0, prazo: "2026-09-22", justificativa: null, por: null, em: "2026-10-21T08:00:00Z", hash: null },
          { sequencia: 1, prazo: "2026-10-20", justificativa: null, por: null, em: "2026-10-21T08:00:00Z", hash: null },
          { sequencia: 2, prazo: "2026-11-15", justificativa: "Falta de peça", por: "Carla PCM", em: "2026-10-21T09:00:00Z", hash: "e".repeat(64) },
        ],
      }),
    ];
    const r = resumirAssinaturas(itens);
    expect(r.administradores).toHaveLength(1);
    expect(r.administradores[0]!.solicitacoes.map((s) => s.numero)).toEqual([3, 4]);
    expect(r.pcm.map((p) => p.nome)).toEqual(["Carla PCM", "Paulo PCM"]);
    expect(r.pcm[0]!.programacoes[0]).toMatchObject({ numeroOs: "463597", rotulo: "Rep. II" });
    expect(r.semAprovacaoNoSistema).toBe(1);
  });
});
