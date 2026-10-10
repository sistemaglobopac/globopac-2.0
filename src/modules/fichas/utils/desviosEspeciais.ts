// Validação central dos campos de absorção (A: absorcao_agua, B: dripping_test): se o status do
// campo é 'nao-conforme', a ficha é NÃO CONFORME e o inspetor vê um aviso de desvio ANTES de
// assinar. Função pura, testada em tests/unit/desviosEspeciais.test.ts.
import type { CampoTemplate } from "@/shared/schema-campos";
import { acimaDoLimite, LIMITE_ABSORCAO_AGUA, LIMITE_DRIPPING } from "../fields/calculosAbsorcao";

export function mensagemDesvioAbsorcao(label: string, media: number, limite: number = LIMITE_ABSORCAO_AGUA): string {
  return `O campo "${label}" ultrapassou o limite máximo tolerado de ${limite}% (Média: ${media.toFixed(2)}%).`;
}

export function mensagemDesvioDripping(
  label: string,
  valor: { averagePercentage: number; timeNonConformity: boolean },
  limite: number = LIMITE_DRIPPING
): string {
  if (valor.timeNonConformity && !acimaDoLimite(valor.averagePercentage, limite)) {
    return `O tempo de drenagem no campo "${label}" está abaixo do mínimo exigido pela Portaria 210/1998.`;
  }
  return `A média de gotejamento no campo "${label}" ultrapassou o limite de ${limite}% (Portaria 210/1998) (Média: ${valor.averagePercentage.toFixed(2)}%).`;
}

/** `valorMaximo` configurado no campo vale só como <limite> na MENSAGEM; sem ele, o padrão é 8 (A)
 * e 6 (B). O status do campo em si continua usando os limites fixos da norma. */
function limiteConfigurado(campo: CampoTemplate): number | undefined {
  const maximo = (campo as { valorMaximo?: unknown }).valorMaximo;
  return typeof maximo === "number" ? maximo : undefined;
}

// Widgets que gravam `conformidade` + `detalhesRNC` no próprio valor (vazão de água e recepção de aves).
export const TIPOS_VAZAO = ["chiller_carcacas", "chiller_partes", "mini_chillers", "lavagem_final", "recepcao_aves", "espera_aves", "pendura_aves", "eletronarcose_aves", "caixas_vazias", "peso_caixa", "temperatura_resfriamento", "potabilidade_agua", "potabilidade_pontos", "qualidade_miudos", "controle_absorcao", "aguas_residuais", "ventilacao", "higiene_habitos", "pso", "higiene_operacional", "higiene_colaboradores"];

/** Desvios que tornam a ficha NÃO CONFORME já no preenchimento: absorção/dripping fora do limite,
 * vazão de água abaixo da meta (o widget grava `conformidade: false` + `detalhesRNC`). Ocorrência
 * de pragas NÃO entra: não gera não conformidade nem RNC. Usado para pedir a confirmação do
 * inspetor antes da assinatura. */
export function desviosEspeciais(campos: CampoTemplate[], dados: Record<string, unknown>): string[] {
  const avisos: string[] = [];
  for (const campo of campos) {
    const bruto = dados[campo.chave] as { conformidade?: boolean; detalhesRNC?: string | null } | null | undefined;
    if (bruto && typeof bruto === "object") {
      if (TIPOS_VAZAO.includes(campo.tipo) && bruto.conformidade === false) {
        avisos.push(
          campo.tipo === "recepcao_aves"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "desvio na recepção das aves"}.`
            : campo.tipo === "peso_caixa"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "peso vivo por caixa acima de 25 kg"}.`
            : campo.tipo === "caixas_vazias"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "caixas de transporte não vazias antes do tanque de imersão"}.`
            : campo.tipo === "pendura_aves"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "desvio de bem-estar animal na sala de pendura"}.`
            : campo.tipo === "eletronarcose_aves"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "desvio de bem-estar animal na eletronarcose"}.`
            : campo.tipo === "aguas_residuais" || campo.tipo === "ventilacao" || campo.tipo === "higiene_habitos" || campo.tipo === "pso" || campo.tipo === "higiene_operacional" || campo.tipo === "higiene_colaboradores"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "item não conforme"}.`
            : campo.tipo === "controle_absorcao"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "temperatura da água acima do limite"}.`
            : campo.tipo === "qualidade_miudos"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "defeito acima do máximo tolerado"}.`
            : campo.tipo === "potabilidade_agua" || campo.tipo === "potabilidade_pontos"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "pH ou cloro fora do limite"}.`
            : campo.tipo === "temperatura_resfriamento"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "temperatura acima do limite"}.`
            : campo.tipo === "espera_aves"
            ? `O campo "${campo.label ?? campo.chave}" está não conforme: ${bruto.detalhesRNC ?? "desvio de bem-estar animal na área de espera"}.`
            : `O campo "${campo.label ?? campo.chave}" está fora da meta: ${bruto.detalhesRNC ?? "vazão abaixo do mínimo"}.`
        );
        continue;
      }
    }
    const valor = dados[campo.chave] as { status?: string; averagePercentage?: number; timeNonConformity?: boolean } | undefined;
    if (!valor || typeof valor !== "object" || valor.status !== "nao-conforme") continue;
    const label = campo.label ?? campo.chave;
    const media = valor.averagePercentage ?? 0;

    if (campo.tipo === "absorcao_agua") {
      avisos.push(mensagemDesvioAbsorcao(label, media, limiteConfigurado(campo)));
    } else if (campo.tipo === "dripping_test") {
      avisos.push(mensagemDesvioDripping(label, { averagePercentage: media, timeNonConformity: valor.timeNonConformity === true }, limiteConfigurado(campo)));
    }
  }
  return avisos;
}

/** O registro assinado tem alguma não conformidade detectada NO PREENCHIMENTO (vazão abaixo da
 * meta ou absorção/dripping fora do limite; pragas não contam)? A coluna `conformidade` só é
 * definida pelo Verificador — antes disso é null —, então o Painel de Bordo usa isto para avisar o
 * inspetor logo após a assinatura, sem esperar a verificação. */
export function temNaoConformidade(dados: Record<string, unknown> | null | undefined): boolean {
  return Object.values(dados ?? {}).some(valorNaoConforme);
}

/** O valor de UM campo está não conforme no preenchimento (widget com `conformidade` falsa ou `status` "nao-conforme")? */
export function valorNaoConforme(valor: unknown): boolean {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const v = valor as { conformidade?: unknown; status?: unknown };
  return v.conformidade === false || v.status === "nao-conforme";
}

export interface CampoNaoConforme {
  rotulo: string;
  detalhe: string;
}

/** Campos do registro que estavam NÃO CONFORMES no preenchimento (vazão abaixo da meta, absorção ou
 * dripping fora do limite), com o rótulo do campo e o detalhe do desvio — usado no relatório para
 * dizer a QUAIS CAMPOS a RNC se refere. Pragas não entram. */
export function camposNaoConformes(campos: CampoTemplate[], dados: Record<string, unknown>): CampoNaoConforme[] {
  const lista: CampoNaoConforme[] = [];
  for (const campo of campos) {
    const rotulo = campo.label ?? campo.chave;
    const valor = dados[campo.chave] as
      | { conformidade?: boolean; detalhesRNC?: string | null; status?: string; averagePercentage?: number; timeNonConformity?: boolean }
      | null
      | undefined;
    if (!valor || typeof valor !== "object") continue;

    if (TIPOS_VAZAO.includes(campo.tipo) && valor.conformidade === false) {
      lista.push({ rotulo, detalhe: valor.detalhesRNC ?? "vazão abaixo do mínimo" });
    } else if (campo.tipo === "absorcao_agua" && valor.status === "nao-conforme") {
      const limite = limiteConfigurado(campo) ?? LIMITE_ABSORCAO_AGUA;
      lista.push({ rotulo, detalhe: `média de absorção ${(valor.averagePercentage ?? 0).toFixed(2)}% acima do limite de ${limite}%` });
    } else if (campo.tipo === "dripping_test" && valor.status === "nao-conforme") {
      const limite = limiteConfigurado(campo) ?? LIMITE_DRIPPING;
      lista.push({
        rotulo,
        detalhe:
          valor.timeNonConformity && !acimaDoLimite(valor.averagePercentage ?? 0, limite)
            ? "tempo de drenagem abaixo do mínimo (Portaria 210/1998)"
            : `média de gotejamento ${(valor.averagePercentage ?? 0).toFixed(2)}% acima do limite de ${limite}% (Portaria 210/1998)`,
      });
    }
  }
  return lista;
}
