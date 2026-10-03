// Alvos de um adendo: o verificador/administrador escolhe o CAMPO da ficha e, nos campos compostos
// (DOA, Peso por Caixa, Recepção, Espera...), também o ITEM (carga/box) e o DADO dentro dele. O alvo
// é gravado como caminho ("campo_123.cargas.0.pesoMedioKg") para a assinatura do inspetor aplicar o
// novo valor no ponto certo do registro. Funções puras, testadas em tests/unit/adendoCampos.test.ts.

export interface AlvoAdendo {
  /** Caminho gravado na correção (`chave` do campo, com `.indice.prop` para itens de lista). */
  caminho: string;
  /** Texto exibido ("Rastreabilidade DOA › GTA 46017 › Peso médio (kg)"). */
  rotulo: string;
  valorAtual: unknown;
}

const ROTULOS: Record<string, string> = {
  pesoMedioKg: "Peso médio (kg)",
  placa: "Veículo (placa)",
  avesPorCaixa: "Aves por caixa",
  avesRecebidas: "Aves que vieram na carga",
  avesMortas: "Aves mortas",
  penduraInicioEm: "Início da pendura",
  temperaturaC: "Temperatura (°C)",
  comportamento: "Comportamento das aves",
  outrasCondicoes: "Outras condições",
  box: "Box",
  gta: "GTA",
  integrado: "Integrado",
  aviario: "Aviário",
  nucleo: "Núcleo",
  qtdAves: "Quantidade de aves",
};

/** Dados calculados ou de conformidade: corrigi-los à mão deixaria o registro incoerente. */
const DERIVADOS = /^(conformidade|detalhesRNC|status|houveOfegantes|acaoCorretiva|acaoCorretivaEm|doaPct|saldoDiferenca|notaSaldo|ordemPendura|dataAbate|cargaId|veiculoId|adendos|total.*|.*Pct)$/;

/** Dados que o adendo pode acrescentar mesmo ainda ausentes no item (herdados depois do registro). */
const EXTRAS_POR_ITEM: Record<string, string[]> = {
  rastreabilidade_doa: ["pesoMedioKg", "placa"],
};

function humanizar(chave: string): string {
  return ROTULOS[chave] ?? chave.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

const ehEscalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

function nomeDoItem(item: Record<string, unknown>, indice: number): string {
  if (item.gta) return `GTA ${String(item.gta)}`;
  if (item.box) return `Box ${String(item.box)}`;
  return `Item ${indice + 1}`;
}

export function alvosDoCampo(campo: { chave: string; label?: string; tipo?: string }, valor: unknown): AlvoAdendo[] {
  const nome = campo.label ?? campo.chave;
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return [{ caminho: campo.chave, rotulo: nome, valorAtual: valor }];

  const alvos: AlvoAdendo[] = [];
  const objeto = valor as Record<string, unknown>;
  for (const [chave, v] of Object.entries(objeto)) {
    if (DERIVADOS.test(chave)) continue;
    if (ehEscalar(v)) {
      alvos.push({ caminho: `${campo.chave}.${chave}`, rotulo: `${nome} › ${humanizar(chave)}`, valorAtual: v });
    } else if (Array.isArray(v)) {
      v.forEach((item, indice) => {
        if (!item || typeof item !== "object") return;
        const reg = item as Record<string, unknown>;
        const chaves = new Set([...Object.keys(reg), ...(EXTRAS_POR_ITEM[campo.tipo ?? ""] ?? [])]);
        for (const k of chaves) {
          if (DERIVADOS.test(k) || !(ehEscalar(reg[k]) || reg[k] === undefined)) continue;
          alvos.push({
            caminho: `${campo.chave}.${chave}.${indice}.${k}`,
            rotulo: `${nome} › ${nomeDoItem(reg, indice)} › ${humanizar(k)}`,
            valorAtual: reg[k],
          });
        }
      });
    }
  }
  return alvos.length > 0 ? alvos : [{ caminho: campo.chave, rotulo: nome, valorAtual: valor }];
}

/** Aplica `novo` no caminho (sem mutar). Caminho simples = chave do campo. */
export function aplicarNoCaminho(dados: Record<string, unknown>, caminho: string, novo: unknown): Record<string, unknown> {
  const partes = caminho.split(".");
  const atualizar = (no: unknown, i: number): unknown => {
    if (i === partes.length) return novo;
    const chave = partes[i]!;
    if (Array.isArray(no)) {
      const copia = [...no];
      const idx = Number(chave);
      copia[idx] = atualizar(copia[idx], i + 1);
      return copia;
    }
    const base = no && typeof no === "object" ? (no as Record<string, unknown>) : {};
    return { ...base, [chave]: atualizar(base[chave], i + 1) };
  };
  return atualizar(dados, 0) as Record<string, unknown>;
}
