import { describe, expect, it } from "vitest";
import {
  devolucaoAoPcm,
  diasEntre,
  formatarData,
  hojeManaus,
  itensComReprogramacao,
  observacoesParaCienciaDoPcm,
  ordensNaVerificacaoDiaria,
  pendentesDeVerificacao,
  relatoriosOsDoArquivo,
  resultadosPermitidos,
  resumirAssinaturas,
  rotuloProgramacao,
  situacaoPrazo,
  ultimaObservacaoDoInspetor,
} from "@/modules/bpf/regras";
import { dataParaIso, lerCsvOrdens } from "@/modules/bpf/importacao";
import type { ItemRelatorio, Ordem, Relatorio } from "@/modules/bpf/tipos";

describe("resultadosPermitidos", () => {
  it("dentro do prazo (inclusive no dia do prazo): C, NP ou NC (executada sem sanar o desvio)", () => {
    expect(resultadosPermitidos("2026-10-25", "2026-10-21")).toEqual(["C", "NP", "NC"]);
    expect(resultadosPermitidos("2026-10-21", "2026-10-21")).toEqual(["C", "NP", "NC"]);
  });
  it("prazo vencido: C ou NC", () => {
    expect(resultadosPermitidos("2026-10-20", "2026-10-21")).toEqual(["C", "NC"]);
  });
});

describe("devolucaoAoPcm", () => {
  const nc = { id: "v1", ordem_id: "o1", data_verificacao: "2026-10-24", hora_verificacao: "10:00:00", resultado: "NC" as const, prazo_vigente: "2026-11-05", observacao: "Desvio continua", inspetor_nome: "Ana" };
  const prog = (sequencia: number, criado_em: string) => ({ sequencia, prazo: "2026-11-05", acao_corretiva: null, responsavel: null, justificativa: null, importada: false, programado_por_nome: null, hash_assinatura: null, criado_em });
  const ordem = (extra: Partial<Parameters<typeof devolucaoAoPcm>[0]>) => ({ status: "PROGRAMADA" as const, verificacoes: [nc], programacoes: [prog(0, "2026-10-20T12:00:00Z")], ...extra });

  it("devolve a OS cuja última verificação é NC e que não foi reprogramada depois", () => {
    expect(devolucaoAoPcm(ordem({}))).toEqual(nc);
  });
  it("sai da lista quando o PCM reprograma depois da verificação", () => {
    expect(devolucaoAoPcm(ordem({ programacoes: [prog(0, "2026-10-20T12:00:00Z"), prog(1, "2026-10-24T15:00:00Z")] }))).toBeNull();
  });
  it("uma reprogramação anterior à verificação não limpa a devolução", () => {
    expect(devolucaoAoPcm(ordem({ programacoes: [prog(0, "2026-10-20T12:00:00Z"), prog(1, "2026-10-24T13:00:00Z")] }))).toEqual(nc);
  });
  it("não devolve OS sem verificação, com NP/C como última ou já concluída", () => {
    expect(devolucaoAoPcm(ordem({ verificacoes: [] }))).toBeNull();
    expect(devolucaoAoPcm(ordem({ verificacoes: [{ ...nc, resultado: "NP" }] }))).toBeNull();
    expect(devolucaoAoPcm(ordem({ status: "CONCLUIDA" }))).toBeNull();
  });
});

describe("ultimaObservacaoDoInspetor", () => {
  const ver = (id: string, data: string, resultado: "C" | "NP" | "NC", observacao: string | null) => ({
    id, ordem_id: "o1", data_verificacao: data, hora_verificacao: "10:00:00", resultado, prazo_vigente: "2026-11-05", observacao, inspetor_nome: "Ana",
  });

  it("devolve a observação mais recente, mesmo de uma OS dentro do prazo (NP)", () => {
    const antiga = ver("v1", "2026-10-22", "NP", "Fiação solta");
    const nova = ver("v2", "2026-10-24", "NP", "Chuveiro instalado, fiação continua solta");
    expect(ultimaObservacaoDoInspetor({ verificacoes: [antiga, nova] })).toEqual(nova);
  });
  it("uma verificação mais nova sem texto não apaga a observação anterior", () => {
    const comTexto = ver("v1", "2026-10-22", "NC", "Falta a fiação");
    const semTexto = ver("v2", "2026-10-24", "NP", null);
    expect(ultimaObservacaoDoInspetor({ verificacoes: [semTexto, comTexto] })).toEqual(comTexto);
  });
  it("ignora observação vazia ou só com espaços", () => {
    expect(ultimaObservacaoDoInspetor({ verificacoes: [ver("v1", "2026-10-22", "NP", "   ")] })).toBeNull();
    expect(ultimaObservacaoDoInspetor({ verificacoes: [] })).toBeNull();
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

describe("ordensNaVerificacaoDiaria", () => {
  const os = (id: string, centro: string, marcada = false) =>
    ({ id, centro: { id: centro }, verificacoes: marcada ? [{ data_verificacao: "2026-10-21" }] : [] }) as unknown as Ordem;
  const lista = [os("a", "c1"), os("b", "c1", true), os("c", "c2"), os("d", "c2", true)];
  const ids = (o: Ordem[]) => o.map((x) => x.id);

  it("a OS some da lista assim que recebe C, NP ou NC hoje", () => {
    expect(ids(ordensNaVerificacaoDiaria(lista, "2026-10-21"))).toEqual(["a", "c"]);
  });
  it("verificação de outro dia não tira a OS da lista de hoje", () => {
    const ontem = { id: "e", centro: { id: "c1" }, verificacoes: [{ data_verificacao: "2026-10-20" }] } as unknown as Ordem;
    expect(ids(ordensNaVerificacaoDiaria([ontem], "2026-10-21"))).toEqual(["e"]);
  });
  it("as retidas (NC aguardando observação) continuam à vista", () => {
    expect(ids(ordensNaVerificacaoDiaria(lista, "2026-10-21", { retidas: new Set(["b"]) }))).toEqual(["a", "b", "c"]);
  });
  it("pode trazer de volta as já verificadas, para corrigir uma marcação", () => {
    expect(ids(ordensNaVerificacaoDiaria(lista, "2026-10-21", { incluirVerificadas: true }))).toEqual(["a", "b", "c", "d"]);
  });
  it("filtra por setor junto com o resto", () => {
    expect(ids(ordensNaVerificacaoDiaria(lista, "2026-10-21", { centroId: "c2" }))).toEqual(["c"]);
    expect(ids(ordensNaVerificacaoDiaria(lista, "2026-10-21", { centroId: "c2", incluirVerificadas: true }))).toEqual(["c", "d"]);
  });
});

describe("itensComReprogramacao", () => {
  const item = (numero_os: string, resultado: "NC" | "NP") => ({ numero_os, resultado }) as unknown as ItemRelatorio;
  const repro = { sequencia: 1, prazo: "2026-11-05", justificativa: null, por: "Paulo", em: "2026-10-28T18:00:00Z", hash: null };

  it("aplica a reprogramação feita depois da emissão só à OS que consta como NC, sem mutar os itens gravados", () => {
    const itens = [item("A", "NC"), item("B", "NC"), item("C", "NP")];
    const r = itensComReprogramacao({ itens, reprogramacoes_posteriores: [{ numero_os: "A", reprogramada: repro }, { numero_os: "C", reprogramada: repro }] });
    expect(r[0]!.reprogramada).toEqual(repro);
    expect(r[1]!.reprogramada).toBeUndefined();
    expect(r[2]!.reprogramada).toBeUndefined(); // NP não vira "NC reprogramada"
    expect(itens[0]!.reprogramada).toBeUndefined();
  });
  it("mantém a reprogramação que já vinha no item e aceita relatório sem reprogramações posteriores", () => {
    const ja = { ...item("A", "NC"), reprogramada: repro } as ItemRelatorio;
    expect(itensComReprogramacao({ itens: [ja] })[0]!.reprogramada).toEqual(repro);
  });
});

describe("relatoriosOsDoArquivo com os recortes do Painel de Arquivo", () => {
  const rel = (id: string, data: string, extra: Record<string, unknown> = {}) =>
    ({ id, data_referencia: data, status: "verificado", setor: "MANUTENÇÕES DIVERSAS", emitido_por: "u1", qtd_nc: 2, ...extra }) as unknown as Relatorio;
  const lista = [rel("a", "2026-10-20"), rel("b", "2026-10-25"), rel("c", "2026-10-28", { qtd_nc: 0, emitido_por: "u2" })];
  const vazio = { de: "", ate: "", pac: "", setor: "", turno: "", ficha: "", situacao: "", inspetor: "" };
  const ids = (f: Partial<typeof vazio>) => relatoriosOsDoArquivo(lista, "todas", { ...vazio, ...f }).map((r) => r.id);

  it("sem recortes traz todos os verificados/liberados", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
  });
  it("busca por data (inclusive nas pontas)", () => {
    expect(ids({ de: "2026-10-25" })).toEqual(["b", "c"]);
    expect(ids({ ate: "2026-10-25" })).toEqual(["a", "b"]);
    expect(ids({ de: "2026-10-21", ate: "2026-10-27" })).toEqual(["b"]);
  });
  it("busca por PAC: o relatório de OS é do PAC 1 e some nos outros PACs", () => {
    expect(ids({ pac: "PAC 1" })).toEqual(["a", "b", "c"]);
    expect(ids({ pac: "PAC 8" })).toEqual([]);
  });
  it("PAC 1 e data juntos", () => {
    expect(ids({ pac: "PAC 1", de: "2026-10-26" })).toEqual(["c"]);
  });
  it("ficha RAC 002/001, setor, inspetor e situação valem como nas demais fichas; turno não se aplica", () => {
    expect(ids({ ficha: "RAC 002/001" })).toEqual(["a", "b", "c"]);
    expect(ids({ ficha: "RAC 001/003" })).toEqual([]);
    expect(ids({ setor: "MANUTENÇÕES DIVERSAS" })).toEqual(["a", "b", "c"]);
    expect(ids({ setor: "OUTRO" })).toEqual([]);
    expect(ids({ inspetor: "u2" })).toEqual(["c"]);
    expect(ids({ situacao: "NAO_CONFORME" })).toEqual(["a", "b"]);
    expect(ids({ situacao: "CONFORME" })).toEqual(["c"]);
    expect(ids({ situacao: "TRATADO" })).toEqual([]);
    expect(ids({ turno: "1º Turno" })).toEqual([]);
  });
  it("continua respeitando a liberação e nunca traz o relatório só emitido", () => {
    const l = [rel("e", "2026-10-28", { status: "emitido" }), rel("v", "2026-10-27"), rel("l", "2026-10-26", { status: "liberado" })];
    expect(relatoriosOsDoArquivo(l, "todas", { ...vazio, pac: "PAC 1" }).map((r) => r.id)).toEqual(["v", "l"]);
    expect(relatoriosOsDoArquivo(l, "pendentes", { ...vazio, de: "2026-10-01" }).map((r) => r.id)).toEqual(["v"]);
  });
});

describe("observacoesParaCienciaDoPcm", () => {
  const prog = (criado_em: string, sequencia = 0) => ({ sequencia, prazo: "2026-11-30", criado_em });
  const ver = (id: string, data: string, hora: string, observacao: string | null) => ({ id, data_verificacao: data, hora_verificacao: hora, resultado: "NP", observacao, inspetor_nome: "Ana" });
  const os = (id: string, verificacoes: unknown[], extra: Record<string, unknown> = {}) =>
    ({ id, status: "PROGRAMADA", programacoes: [prog("2026-10-20T12:00:00Z")], verificacoes, ...extra }) as unknown as Ordem;
  const ids = (l: ReturnType<typeof observacoesParaCienciaDoPcm>) => l.map((i) => i.ordem.id);

  it("traz a OS programada cuja última observação do inspetor ainda não teve ciência", () => {
    const l = observacoesParaCienciaDoPcm([os("a", [ver("v1", "2026-10-27", "08:00:00", "Chuveiro instalado, fiação solta")])], new Set());
    expect(ids(l)).toEqual(["a"]);
    expect(l[0]!.verificacao.id).toBe("v1");
  });
  it("ignora OS sem observação (vazia ou só espaços) e OS já concluída", () => {
    expect(observacoesParaCienciaDoPcm([os("a", [ver("v1", "2026-10-27", "08:00:00", null)]), os("b", [ver("v2", "2026-10-27", "08:00:00", "   ")]), os("c", [ver("v3", "2026-10-27", "08:00:00", "ok")], { status: "CONCLUIDA" })], new Set())).toEqual([]);
  });
  it("não traz o que o PCM já leu, mas traz a observação nova da mesma OS", () => {
    const o = os("a", [ver("v1", "2026-10-26", "08:00:00", "primeira"), ver("v2", "2026-10-27", "08:00:00", "segunda")]);
    expect(observacoesParaCienciaDoPcm([o], new Set(["v1"])).map((i) => i.verificacao.id)).toEqual(["v2"]);
    expect(observacoesParaCienciaDoPcm([o], new Set(["v2"]))).toEqual([]);
  });
  it("OS que o PCM reprogramou depois da observação já foi tratada; reprogramada antes dela ainda conta", () => {
    const depois = os("a", [ver("v1", "2026-10-27", "08:00:00", "x")], { programacoes: [prog("2026-10-20T12:00:00Z"), prog("2026-10-28T12:00:00Z", 1)] });
    const antes = os("b", [ver("v2", "2026-10-27", "08:00:00", "y")], { programacoes: [prog("2026-10-20T12:00:00Z"), prog("2026-10-26T12:00:00Z", 1)] });
    expect(ids(observacoesParaCienciaDoPcm([depois, antes], new Set()))).toEqual(["b"]);
  });
  it("ordena da observação mais recente para a mais antiga", () => {
    const l = observacoesParaCienciaDoPcm(
      [os("velha", [ver("v1", "2026-10-25", "08:00:00", "a")]), os("nova", [ver("v2", "2026-10-28", "08:00:00", "b")]), os("meio", [ver("v3", "2026-10-27", "08:00:00", "c")])],
      new Set()
    );
    expect(ids(l)).toEqual(["nova", "meio", "velha"]);
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
