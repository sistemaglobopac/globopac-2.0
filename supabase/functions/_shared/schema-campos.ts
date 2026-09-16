// Fonte única de verdade de validação de fichas_templates.schema_campos (seção 5 e 7.1 do
// PROMPT MESTRE: "os mesmos schemas Zod reaproveitados nas Edge Functions e no cliente").
//
// Este arquivo é importado tanto pelo frontend (via caminho relativo, resolvendo `zod` do
// node_modules normalmente) quanto pelas Edge Functions em Deno (via o import map em
// supabase/functions/deno.json, que mapeia o especificador "zod" para "npm:zod"). Não
// importe nada específico de Node ou de Deno aqui — mantenha este módulo puro.
import { z } from "zod";

export type CampoTemplate =
  | {
      chave: string;
      tipo: "numero";
      obrigatorio: boolean;
      min?: number;
      max?: number;
      unidade?: string;
    }
  | { chave: string; tipo: "texto"; obrigatorio: boolean; maxLength?: number }
  | { chave: string; tipo: "booleano"; obrigatorio: boolean }
  | { chave: string; tipo: "selecao"; obrigatorio: boolean; opcoes: string[] };

/** Valida a própria definição de schema_campos (usado pelo builder de templates, Fase 1). */
export const campoTemplateSchema: z.ZodType<CampoTemplate> = z.discriminatedUnion("tipo", [
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("numero"),
    obrigatorio: z.boolean(),
    min: z.number().optional(),
    max: z.number().optional(),
    unidade: z.string().optional(),
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("texto"),
    obrigatorio: z.boolean(),
    maxLength: z.number().int().positive().optional(),
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("booleano"),
    obrigatorio: z.boolean(),
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("selecao"),
    obrigatorio: z.boolean(),
    opcoes: z.array(z.string().min(1)).min(1),
  }),
]);

export const schemaCamposSchema = z.array(campoTemplateSchema);

/**
 * Gera, em tempo real, o schema Zod de validação dos DADOS de uma ficha (dados_dinamicos) a
 * partir da definição declarativa de schema_campos. Ex.: um campo
 * { tipo: 'numero', min: 0, max: 45 } vira z.number().min(0).max(45) — usado tanto no
 * formulário (React Hook Form) quanto na Edge Function de gravação, para nunca haver duas
 * implementações de validação divergentes (débito técnico da v1: validação só no cliente).
 */
export function zodFromSchemaCampos(campos: CampoTemplate[]): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};

  for (const campo of campos) {
    let fieldSchema: z.ZodTypeAny;

    switch (campo.tipo) {
      case "numero": {
        let numero = z.number({ invalid_type_error: `${campo.chave} deve ser numérico` });
        if (campo.min !== undefined) numero = numero.min(campo.min);
        if (campo.max !== undefined) numero = numero.max(campo.max);
        fieldSchema = numero;
        break;
      }
      case "texto": {
        let texto = z.string();
        if (campo.maxLength !== undefined) texto = texto.max(campo.maxLength);
        fieldSchema = texto;
        break;
      }
      case "booleano":
        fieldSchema = z.boolean();
        break;
      case "selecao":
        fieldSchema = z.enum(campo.opcoes as [string, ...string[]]);
        break;
    }

    shape[campo.chave] = campo.obrigatorio ? fieldSchema : fieldSchema.optional();
  }

  return z.object(shape);
}

/** Valor inicial (vazio) para um formulário gerado a partir de schema_campos. */
export function valoresIniciaisDe(campos: CampoTemplate[]): Record<string, unknown> {
  const valores: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.tipo === "booleano") valores[campo.chave] = false;
    else valores[campo.chave] = "";
  }
  return valores;
}
