// Correção de um monitoramento pelo próprio inspetor (antes da verificação). O formulário refaz os cálculos ao vivo (cada widget
// recalcula os próprios derivados); aqui só se compara o registro antes x depois para gravar o que mudou como adendo (caminho →
// antigo/novo), o mesmo formato do adendo pedido pelo Verificador — assim as propagações (hidrômetro, DOA) valem igual.
// Funções puras, testadas em tests/unit/correcaoInspetor.test.ts.

import type { CampoTemplate } from "@/shared/schema-campos";
import { alvosDoCampo, DERIVADOS } from "./adendoCampos";

export interface CorrecaoCampo {
  old: unknown;
  new: unknown;
  rotulo?: string;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Vazio, "" e NaN (campo numérico apagado) contam como a mesma coisa: não é uma correção. */
function normalizado(v: unknown): unknown {
  if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) return null;
  return v;
}

function iguais(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizado(a)) === JSON.stringify(normalizado(b));
}

function comparar(antes: unknown, depois: unknown, caminho: string, saida: Record<string, CorrecaoCampo>): void {
  if (ehObjeto(antes) && ehObjeto(depois)) {
    for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
      // Dados calculados (%, totais, status, conformidade) não são "corrigidos": mudam sozinhos quando o valor de origem muda.
      if (DERIVADOS.test(chave)) continue;
      comparar(antes[chave], depois[chave], `${caminho}.${chave}`, saida);
    }
    return;
  }
  if (Array.isArray(antes) && Array.isArray(depois)) {
    for (let i = 0; i < Math.max(antes.length, depois.length); i++) comparar(antes[i], depois[i], `${caminho}.${i}`, saida);
    return;
  }
  if (!iguais(antes, depois)) saida[caminho] = { old: normalizado(antes), new: normalizado(depois) };
}

/** O que o inspetor mudou nos campos da ficha (só os campos do template; hora, adendos e marcas do sistema ficam como estão). */
export function diffCorrecoes(campos: CampoTemplate[], antes: Record<string, unknown>, depois: Record<string, unknown>): Record<string, CorrecaoCampo> {
  const saida: Record<string, CorrecaoCampo> = {};
  for (const campo of campos) {
    const parcial: Record<string, CorrecaoCampo> = {};
    comparar(antes[campo.chave], depois[campo.chave], campo.chave, parcial);
    const rotulos = new Map(alvosDoCampo(campo, depois[campo.chave] ?? antes[campo.chave]).map((a) => [a.caminho, a.rotulo]));
    for (const [caminho, correcao] of Object.entries(parcial)) {
      const resto = caminho === campo.chave ? "" : ` › ${caminho.slice(campo.chave.length + 1).replace(/\./g, " › ")}`;
      saida[caminho] = { ...correcao, rotulo: rotulos.get(caminho) ?? `${campo.label ?? campo.chave}${resto}` };
    }
  }
  return saida;
}

export const MOTIVO_CORRECAO_MIN_CARACTERES = 10;

export interface RegistroDaCadeia {
  id: string;
  user_id: string;
  verificado_por: string | null;
  status_ficha?: string | null;
  dados_dinamicos?: Record<string, unknown> | null;
}

export type ResultadoPodeCorrigir = { pode: true } | { pode: false; motivo: string };

/** O inspetor (dono) pode corrigir enquanto NENHUMA versão do monitoramento (original e aditivos) foi verificada e o registro está
 * finalizado. Depois da verificação, a correção é só por adendo pedido pelo Verificador. `quemCorrige` = quem está logado. */
export function podeCorrigirMonitoramento(cadeia: RegistroDaCadeia[], quemCorrige: { id: string; nivelAcesso: string }): ResultadoPodeCorrigir {
  const primeiro = cadeia[0];
  if (!primeiro) return { pode: false, motivo: "Monitoramento não encontrado." };
  const ehDono = quemCorrige.nivelAcesso === "INSPETOR_QUALIDADE" && quemCorrige.id === primeiro.user_id;
  if (quemCorrige.nivelAcesso !== "ADMIN_MASTER" && !ehDono) return { pode: false, motivo: "Só o inspetor que fez o monitoramento pode corrigi-lo." };
  if (cadeia.some((r) => r.verificado_por)) return { pode: false, motivo: "Este monitoramento já foi verificado: a correção agora é por adendo pedido pelo Verificador." };
  // Em andamento: etapa 1 salva (peso por caixa / chiller 2 ainda por informar) ou fase inicial de absorção/dripping.
  const vigente = cadeia[cadeia.length - 1]!;
  const aguardandoEtapa2 = vigente.dados_dinamicos?.aguardando_peso === true || vigente.dados_dinamicos?.aguardando_chiller2 === true;
  if (aguardandoEtapa2 || cadeia.some((r) => r.status_ficha === "EM_ANDAMENTO")) return { pode: false, motivo: "Este monitoramento ainda está em andamento: finalize-o antes de corrigir." };
  return { pode: true };
}
