import { describe, expect, it } from "vitest";
import { assinaturaDosDados, chavesDeConfirmacao, repeteOAnterior, type RegistroComHora } from "@/modules/fichas/utils/dadosDuplicados";

const base = { campo_1: "12,5", campo_2: { itens: [{ a: 1, b: "x" }] }, hora_monitoramento: "2026-10-07T13:00:00.000Z" };
// registro existente: dados + hora em que foi realizado
const reg = (dados: Record<string, unknown> | null | undefined, hora: string | null | undefined = "2026-10-07T13:00:00.000Z"): RegistroComHora => ({ dados, hora });

describe("trava de dados repetidos (só contra o monitoramento anterior)", () => {
  it("ignora a hora do monitoramento e a ordem das chaves", () => {
    const outro = { campo_2: { itens: [{ b: "x", a: 1 }] }, hora_monitoramento: "2026-10-07T15:00:00.000Z", campo_1: "12,5" };
    expect(repeteOAnterior(outro, [reg(base)])).toBe(true);
  });

  it("um único dado diferente já libera o registro", () => {
    expect(repeteOAnterior({ ...base, campo_1: "12,6" }, [reg(base)])).toBe(false);
    expect(repeteOAnterior({ ...base, campo_2: { itens: [{ a: 2, b: "x" }] } }, [reg(base)])).toBe(false);
  });

  it("ignora marcas de controle (adendos, continuação, aguardando peso)", () => {
    const registrado = { ...base, adendos: [{ id: "a1" }], continuacao_de: { registroId: "r" }, aguardando_peso: true };
    expect(repeteOAnterior(base, [reg(registrado)])).toBe(true);
  });

  it("campos indefinidos não contam como dado", () => {
    expect(assinaturaDosDados({ campo_1: "1", campo_3: undefined })).toBe(assinaturaDosDados({ campo_1: "1" }));
  });

  it("sem registros ou sem dados medidos não há repetição", () => {
    expect(repeteOAnterior(base, [])).toBe(false);
    expect(repeteOAnterior({ hora_monitoramento: "x" }, [reg({ hora_monitoramento: "y" })])).toBe(false);
    expect(repeteOAnterior(base, [reg(null), reg(undefined)])).toBe(false);
  });
});

describe("só o monitoramento IMEDIATAMENTE ANTERIOR trava", () => {
  const a = { temperatura: "5,0" };
  const b = { temperatura: "6,0" };

  it("igual ao anterior (o de hora mais recente): trava", () => {
    // 10h: 5,0 · 11h: 6,0 (anterior) → registrar 6,0 repete o anterior
    expect(repeteOAnterior(b, [reg(a, "2026-10-07T14:00:00Z"), reg(b, "2026-10-07T15:00:00Z")])).toBe(true);
  });

  it("igual a um registro mais antigo, com outro no meio: permitido (a leitura voltou ao valor)", () => {
    // 10h: 5,0 · 11h: 6,0 (anterior) → registrar 5,0 NÃO repete o anterior
    expect(repeteOAnterior(a, [reg(a, "2026-10-07T14:00:00Z"), reg(b, "2026-10-07T15:00:00Z")])).toBe(false);
  });

  it("a ordem em que os registros chegam não importa: vale a hora do monitoramento", () => {
    expect(repeteOAnterior(a, [reg(b, "2026-10-07T15:00:00Z"), reg(a, "2026-10-07T14:00:00Z")])).toBe(false);
    expect(repeteOAnterior(b, [reg(b, "2026-10-07T15:00:00Z"), reg(a, "2026-10-07T14:00:00Z")])).toBe(true);
  });

  it("registros de origens diferentes (servidor, fila, rascunho) entram na mesma linha do tempo", () => {
    const doServidor = reg(a, "2026-10-07T14:00:00Z");
    const rascunho = reg(b, "2026-10-07T16:00:00Z"); // o mais recente é um rascunho
    expect(repeteOAnterior(b, [doServidor, rascunho])).toBe(true);
    expect(repeteOAnterior(a, [doServidor, rascunho])).toBe(false);
  });

  it("dois registros na mesma hora (original e aditivo): vale qualquer um deles", () => {
    const original = reg({ temperatura: "5,0" }, "2026-10-07T15:00:00Z");
    const aditivo = reg({ temperatura: "5,2" }, "2026-10-07T15:00:00Z");
    expect(repeteOAnterior({ temperatura: "5,2" }, [original, aditivo])).toBe(true);
    expect(repeteOAnterior({ temperatura: "5,0" }, [original, aditivo])).toBe(true);
    expect(repeteOAnterior({ temperatura: "5,5" }, [original, aditivo])).toBe(false);
  });

  it("registro sem hora válida não conta como anterior", () => {
    expect(repeteOAnterior(a, [reg(a, null), reg(a, "não é data")])).toBe(false);
  });
});

describe("campos de confirmação (boleanos, escolhas, checklists) não disparam a trava", () => {
  const caixas = { caixas: { todasVazias: true, caixasNaoVazias: "", acaoCorretiva: "", conformidade: true, detalhesRNC: null }, hora_monitoramento: "2026-10-07T13:00:00.000Z" };
  const campos = [{ chave: "caixas", tipo: "caixas_vazias" }];

  it("sem a exceção, a mesma resposta 'todas vazias' seria barrada (o problema)", () => {
    expect(repeteOAnterior(caixas, [reg(caixas)])).toBe(true);
  });

  it("ficha só de confirmação (caixas vazias antes do tanque de imersão): repetir é permitido", () => {
    const anterior = { ...caixas, hora_monitoramento: "2026-10-07T11:00:00.000Z" };
    expect(repeteOAnterior(caixas, [reg(anterior)], chavesDeConfirmacao(campos))).toBe(false);
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
    expect(repeteOAnterior({ temperatura: "5,2", ok: false }, [reg(anterior)], tipos)).toBe(true);
    expect(repeteOAnterior({ temperatura: "5,3", ok: true }, [reg(anterior)], tipos)).toBe(false);
  });

  it("observação em branco não conta como dado medido", () => {
    const tipos = chavesDeConfirmacao([{ chave: "ok", tipo: "booleano" }]);
    expect(repeteOAnterior({ ok: true, observacoes: "" }, [reg({ ok: true, observacoes: "" })], tipos)).toBe(false);
    expect(repeteOAnterior({ ok: true, observacoes: "limpo" }, [reg({ ok: true, observacoes: "limpo" })], tipos)).toBe(true);
  });
});
