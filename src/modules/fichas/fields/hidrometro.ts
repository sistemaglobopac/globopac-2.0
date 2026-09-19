// Helpers de máscara/parse compartilhados pelos widgets "Especial SIF" que leem hidrômetro
// (chiller_carcacas, chiller_partes, lavagem_final, mini_chillers — portados do v1). Extraídos
// para um único lugar porque os quatro widgets usavam a mesma lógica copiada quatro vezes lá.

/** Leitura de hidrômetro: aceita casas decimais (vírgula ou ponto) — o número de roletes de
 * fração varia por equipamento (alguns têm 1 casa, outros 2, outros nenhuma). Mantém o texto
 * exatamente como o inspetor digitou (sem reformatar a cada tecla) para não atrapalhar a
 * digitação do separador decimal. */
export function parseHidrometro(valor: string | number | undefined | null): string {
  if (valor === undefined || valor === null) return "";
  let s = valor.toString().replace(/[^\d.,]/g, "");
  let viuSeparador = false;
  s = s
    .split("")
    .filter((ch) => {
      if (ch === "," || ch === ".") {
        if (viuSeparador) return false;
        viuSeparador = true;
      }
      return true;
    })
    .join("");
  return s;
}

export function formatHidrometro(valor: string | number | undefined | null): string {
  if (valor === "" || valor === null || valor === undefined) return "";
  return valor.toString();
}

/** Converte a leitura (texto, possivelmente com vírgula decimal) para número, para uso nos
 * cálculos de vazão. */
export function parseNumeroHidrometro(valor: string | number | undefined | null): number {
  if (valor === "" || valor === null || valor === undefined) return 0;
  const num = parseFloat(valor.toString().replace(",", "."));
  return isNaN(num) ? 0 : num;
}

/** Formata um número com 3 casas decimais fixas, no padrão pt-BR (usado para exibir litros
 * apurados/metas — nunca para o texto do input, que usa parseHidrometro/formatHidrometro). */
export function formatMaskedValue(valor: string | number | undefined | null): string {
  if (valor === "" || valor === null || valor === undefined) return "";
  const num = parseFloat(valor.toString());
  if (isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Acima de quantas vezes a meta legal um valor apurado é considerado implausível (provável
 * erro de leitura de hidrômetro — casas decimais/rolete de fração não digitadas) em vez de um
 * consumo real de água. */
export const LIMIAR_IMPLAUSIVEL = 10;
