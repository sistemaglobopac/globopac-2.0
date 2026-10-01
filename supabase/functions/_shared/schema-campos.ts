// Fonte única de verdade de validação de fichas_templates.schema_campos (seção 5 e 7.1 do
// PROMPT MESTRE: "os mesmos schemas Zod reaproveitados nas Edge Functions e no cliente").
//
// Este arquivo é importado tanto pelo frontend (via caminho relativo, resolvendo `zod` do
// node_modules normalmente) quanto pelas Edge Functions em Deno (via o import map em
// supabase/functions/deno.json, que mapeia o especificador "zod" para "npm:zod"). Não
// importe nada específico de Node ou de Deno aqui — mantenha este módulo puro.
import { z } from "zod";

/** Visibilidade condicional (porte do v1: NovoRegistro.jsx) — o campo só aparece na tela de
 * preenchimento quando `campo` (a `chave` de outro campo da mesma ficha) tiver exatamente
 * `valor`. Comum a qualquer tipo de campo, por isso fica fora do discriminated union por
 * `tipo`. */
export interface DependeDe {
  campo: string;
  valor: string;
}

export type CampoTemplate =
  | {
      chave: string;
      tipo: "numero";
      obrigatorio: boolean;
      label?: string;
      min?: number;
      max?: number;
      unidade?: string;
      dependeDe?: DependeDe;
    }
  | { chave: string; tipo: "texto"; obrigatorio: boolean; label?: string; maxLength?: number; dependeDe?: DependeDe }
  | { chave: string; tipo: "booleano"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "selecao"; obrigatorio: boolean; label?: string; opcoes: string[]; dependeDe?: DependeDe }
  // Tipos abaixo: catálogo do Construtor de Fichas (painel administrativo). "simples" e
  // "unica_escolha" coexistem com "booleano"/"selecao" (mesma semântica, nomes do novo
  // catálogo) — os antigos continuam existindo para não invalidar templates já versionados.
  | { chave: string; tipo: "simples"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "inteiro"; obrigatorio: boolean; label?: string; valorMinimo?: number; valorMaximo?: number; dependeDe?: DependeDe }
  | { chave: string; tipo: "decimal"; obrigatorio: boolean; label?: string; valorMinimo?: number; valorMaximo?: number; dependeDe?: DependeDe }
  | { chave: string; tipo: "unica_escolha"; obrigatorio: boolean; label?: string; opcoes: string[]; dependeDe?: DependeDe }
  | { chave: string; tipo: "hora"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "texto_longo"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "foto"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "assinatura"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  // Widgets compostos "Especial SIF": o construtor só lista o tipo — a renderização e a
  // validação de cada um vivem na tela de preenchimento do inspetor, fora deste módulo.
  | { chave: string; tipo: "chiller_carcacas"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "chiller_partes"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "mini_chillers"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "lavagem_final"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "absorcao_agua"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "dripping_test"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe }
  | { chave: string; tipo: "parada_equipamento"; obrigatorio: boolean; label?: string; dependeDe?: DependeDe };

const dependeDeSchema = z.object({ campo: z.string().min(1), valor: z.string() }).optional();

/** Valida a própria definição de schema_campos (usado pelo builder de templates, Fase 1, e
 * pelo Construtor de Fichas). */
export const campoTemplateSchema: z.ZodType<CampoTemplate> = z.discriminatedUnion("tipo", [
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("numero"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    unidade: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("texto"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    maxLength: z.number().int().positive().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("booleano"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("selecao"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    opcoes: z.array(z.string().min(1)).min(1),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("simples"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("inteiro"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    valorMinimo: z.number().optional(),
    valorMaximo: z.number().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("decimal"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    valorMinimo: z.number().optional(),
    valorMaximo: z.number().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("unica_escolha"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    opcoes: z.array(z.string().min(1)).min(1),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("hora"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("texto_longo"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("foto"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("assinatura"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("chiller_carcacas"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("chiller_partes"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("mini_chillers"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("lavagem_final"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("absorcao_agua"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("dripping_test"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
  }),
  z.object({
    chave: z.string().min(1),
    tipo: z.literal("parada_equipamento"),
    obrigatorio: z.boolean(),
    label: z.string().optional(),
    dependeDe: dependeDeSchema,
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
export function zodFromSchemaCampos(campos: CampoTemplate[]): z.ZodEffects<z.ZodObject<z.ZodRawShape>> {
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
      case "simples":
        fieldSchema = z.boolean();
        break;
      case "selecao":
      case "unica_escolha":
        fieldSchema = z.enum(campo.opcoes as [string, ...string[]]);
        break;
      case "inteiro":
        // valorMinimo/valorMaximo são um limiar de negócio (fora da faixa vira Desvio/RNC
        // automaticamente na tela de preenchimento), não uma regra de rejeição de entrada —
        // por isso não são aplicados aqui como .min()/.max().
        fieldSchema = z.number().int();
        break;
      case "decimal":
        fieldSchema = z.number();
        break;
      case "hora":
        fieldSchema = z.string();
        break;
      case "texto_longo":
        fieldSchema = z.string();
        break;
      // Foto, assinatura e os widgets "Especial SIF" são preenchidos e validados na tela do
      // inspetor (fora do escopo do construtor e desta validação genérica de dados_dinamicos).
      case "foto":
      case "assinatura":
      case "chiller_carcacas":
      case "chiller_partes":
      case "mini_chillers":
      case "lavagem_final":
      case "absorcao_agua":
      case "dripping_test":
      case "parada_equipamento":
        fieldSchema = z.unknown();
        break;
    }

    // Campo com `dependeDe` é sempre opcional na forma base — ele nem aparece na tela quando
    // a dependência não está satisfeita, então o zod não pode exigi-lo incondicionalmente. A
    // obrigatoriedade "só quando visível" é reforçada abaixo, no superRefine.
    shape[campo.chave] = campo.obrigatorio && !campo.dependeDe ? fieldSchema : fieldSchema.optional();
  }

  return z.object(shape).superRefine((dados, ctx) => {
    for (const campo of campos) {
      if (!campo.dependeDe || !campo.obrigatorio) continue;
      const condicaoAtendida = dados[campo.dependeDe.campo] === campo.dependeDe.valor;
      if (!condicaoAtendida) continue;
      const valor = dados[campo.chave];
      if (valor === undefined || valor === null || valor === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo.chave], message: "Campo obrigatório" });
      }
    }
  });
}

/** Valor inicial (vazio) para um formulário gerado a partir de schema_campos. */
export function valoresIniciaisDe(campos: CampoTemplate[]): Record<string, unknown> {
  const valores: Record<string, unknown> = {};
  for (const campo of campos) {
    if (campo.tipo === "booleano" || campo.tipo === "simples") valores[campo.chave] = false;
    else if (
      campo.tipo === "foto" ||
      campo.tipo === "assinatura" ||
      campo.tipo === "chiller_carcacas" ||
      campo.tipo === "chiller_partes" ||
      campo.tipo === "mini_chillers" ||
      campo.tipo === "lavagem_final" ||
      campo.tipo === "absorcao_agua" ||
      campo.tipo === "dripping_test" ||
      campo.tipo === "parada_equipamento"
    )
      valores[campo.chave] = null;
    else valores[campo.chave] = "";
  }
  return valores;
}
