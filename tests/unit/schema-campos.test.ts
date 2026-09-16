import { describe, expect, it } from "vitest";
import {
  campoTemplateSchema,
  schemaCamposSchema,
  valoresIniciaisDe,
  zodFromSchemaCampos,
  type CampoTemplate,
} from "@/shared/schema-campos";

// Cobertura do módulo mais crítico juridicamente depois da assinatura em si: se a validação
// gerada aqui divergir entre formulário e Edge Function, um dado inválido pode ser persistido
// e depois assinado como se fosse íntegro. Seção 10 do PROMPT MESTRE pede cobertura próxima
// de 100% para este módulo.

describe("zodFromSchemaCampos", () => {
  it("gera validação de min/max para campo numérico", () => {
    const campos: CampoTemplate[] = [
      { chave: "temperatura_celsius", tipo: "numero", obrigatorio: true, min: 0, max: 45 },
    ];
    const schema = zodFromSchemaCampos(campos);

    expect(schema.safeParse({ temperatura_celsius: 20 }).success).toBe(true);
    expect(schema.safeParse({ temperatura_celsius: -1 }).success).toBe(false);
    expect(schema.safeParse({ temperatura_celsius: 46 }).success).toBe(false);
  });

  it("campo numérico sem min/max aceita qualquer número", () => {
    const schema = zodFromSchemaCampos([{ chave: "peso", tipo: "numero", obrigatorio: true }]);
    expect(schema.safeParse({ peso: -500 }).success).toBe(true);
    expect(schema.safeParse({ peso: 999999 }).success).toBe(true);
  });

  it("campo obrigatório rejeita ausência; campo opcional aceita", () => {
    const campos: CampoTemplate[] = [
      { chave: "obs_obrigatoria", tipo: "texto", obrigatorio: true },
      { chave: "obs_opcional", tipo: "texto", obrigatorio: false },
    ];
    const schema = zodFromSchemaCampos(campos);

    expect(schema.safeParse({ obs_obrigatoria: "x", obs_opcional: undefined }).success).toBe(true);
    expect(schema.safeParse({ obs_opcional: "x" }).success).toBe(false);
  });

  it("campo de seleção só aceita uma das opções declaradas", () => {
    const schema = zodFromSchemaCampos([
      { chave: "causa", tipo: "selecao", obrigatorio: true, opcoes: ["ARTRITE", "AEROSSACULITE"] },
    ]);
    expect(schema.safeParse({ causa: "ARTRITE" }).success).toBe(true);
    expect(schema.safeParse({ causa: "OUTRA_COISA" }).success).toBe(false);
  });

  it("campo booleano valida tipo estrito", () => {
    const schema = zodFromSchemaCampos([{ chave: "conforme", tipo: "booleano", obrigatorio: true }]);
    expect(schema.safeParse({ conforme: true }).success).toBe(true);
    expect(schema.safeParse({ conforme: "true" }).success).toBe(false);
  });

  it("respeita maxLength de campo texto", () => {
    const schema = zodFromSchemaCampos([
      { chave: "obs", tipo: "texto", obrigatorio: true, maxLength: 5 },
    ]);
    expect(schema.safeParse({ obs: "abc" }).success).toBe(true);
    expect(schema.safeParse({ obs: "abcdefgh" }).success).toBe(false);
  });
});

describe("valoresIniciaisDe", () => {
  it("inicializa booleano como false e os demais tipos como string vazia", () => {
    const campos: CampoTemplate[] = [
      { chave: "a", tipo: "numero", obrigatorio: true },
      { chave: "b", tipo: "texto", obrigatorio: true },
      { chave: "c", tipo: "booleano", obrigatorio: true },
      { chave: "d", tipo: "selecao", obrigatorio: true, opcoes: ["X"] },
    ];
    expect(valoresIniciaisDe(campos)).toEqual({ a: "", b: "", c: false, d: "" });
  });
});

describe("campoTemplateSchema / schemaCamposSchema", () => {
  it("rejeita um campo de seleção sem opções", () => {
    const resultado = campoTemplateSchema.safeParse({ chave: "x", tipo: "selecao", obrigatorio: true, opcoes: [] });
    expect(resultado.success).toBe(false);
  });

  it("aceita uma lista válida de campos heterogênea", () => {
    const resultado = schemaCamposSchema.safeParse([
      { chave: "a", tipo: "numero", obrigatorio: true, min: 0, max: 10 },
      { chave: "b", tipo: "booleano", obrigatorio: false },
    ]);
    expect(resultado.success).toBe(true);
  });
});
