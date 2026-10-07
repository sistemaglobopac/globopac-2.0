import { describe, expect, it } from "vitest";
import { assinaturaDosDados, chavesDeConfirmacao, dadosJaRegistrados } from "@/modules/fichas/utils/dadosDuplicados";

const base = { campo_1: "12,5", campo_2: { itens: [{ a: 1, b: "x" }] }, hora_monitoramento: "2026-10-07T13:00:00.000Z" };

describe("trava de dados repetidos", () => {
  it("ignora a hora do monitoramento e a ordem das chaves", () => {
    const outro = { campo_2: { itens: [{ b: "x", a: 1 }] }, hora_monitoramento: "2026-10-07T15:00:00.000Z", campo_1: "12,5" };
    expect(dadosJaRegistrados(outro, [base])).toBe(true);
  });

  it("um único dado diferente já libera o registro", () => {
    expect(dadosJaRegistrados({ ...base, campo_1: "12,6" }, [base])).toBe(false);
    expect(dadosJaRegistrados({ ...base, campo_2: { itens: [{ a: 2, b: "x" }] } }, [base])).toBe(false);
  });

  it("ignora marcas de controle (adendos, continuação, aguardando peso)", () => {
    const registrado = { ...base, adendos: [{ id: "a1" }], continuacao_de: { registroId: "r" }, aguardando_peso: true };
    expect(dadosJaRegistrados(base, [registrado])).toBe(true);
  });

  it("campos indefinidos não contam como dado", () => {
    expect(assinaturaDosDados({ campo_1: "1", campo_3: undefined })).toBe(assinaturaDosDados({ campo_1: "1" }));
  });

  it("sem registros ou sem dados medidos não há repetição", () => {
    expect(dadosJaRegistrados(base, [])).toBe(false);
    expect(dadosJaRegistrados({ hora_monitoramento: "x" }, [{ hora_monitoramento: "y" }])).toBe(false);
    expect(dadosJaRegistrados(base, [null, undefined])).toBe(false);
  });
});

describe("campos de confirmação (boleanos, escolhas, checklists) não disparam a trava", () => {
  const caixas = { caixas: { todasVazias: true, caixasNaoVazias: "", acaoCorretiva: "", conformidade: true, detalhesRNC: null }, hora_monitoramento: "2026-10-07T13:00:00.000Z" };
  const campos = [{ chave: "caixas", tipo: "caixas_vazias" }];

  it("sem a exceção, a mesma resposta 'todas vazias' seria barrada (o problema)", () => {
    expect(dadosJaRegistrados(caixas, [caixas])).toBe(true);
  });

  it("ficha só de confirmação (caixas vazias antes do tanque de imersão): repetir é permitido", () => {
    const anterior = { ...caixas, hora_monitoramento: "2026-10-07T11:00:00.000Z" };
    expect(dadosJaRegistrados(caixas, [anterior], chavesDeConfirmacao(campos))).toBe(false);
  });

  it("reconhece os tipos de confirmação: booleano, escolha, pragas e os checklists", () => {
    const chaves = chavesDeConfirmacao([
      { chave: "a", tipo: "booleano" },
      { chave: "b", tipo: "selecao" },
      { chave: "c", tipo: "unica_escolha" },
      { chave: "d", tipo: "ocorrencia_pragas" },
      { chave: "e", tipo: "aguas_residuais" },
      { chave: "f", tipo: "higiene_operacional" },
      { chave: "g", tipo: "numero" },
      { chave: "h", tipo: "peso_caixa" },
    ]);
    expect([...chaves].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("ficha mista: a confirmação é ignorada, mas a leitura numérica repetida continua sendo barrada", () => {
    const tipos = chavesDeConfirmacao([{ chave: "ok", tipo: "booleano" }]);
    const anterior = { temperatura: "5,2", ok: true };
    expect(dadosJaRegistrados({ temperatura: "5,2", ok: false }, [anterior], tipos)).toBe(true);
    expect(dadosJaRegistrados({ temperatura: "5,3", ok: true }, [anterior], tipos)).toBe(false);
  });

  it("observação em branco não conta como dado medido", () => {
    const tipos = chavesDeConfirmacao([{ chave: "ok", tipo: "booleano" }]);
    expect(dadosJaRegistrados({ ok: true, observacoes: "" }, [{ ok: true, observacoes: "" }], tipos)).toBe(false);
    expect(dadosJaRegistrados({ ok: true, observacoes: "limpo" }, [{ ok: true, observacoes: "limpo" }], tipos)).toBe(true);
  });
});
