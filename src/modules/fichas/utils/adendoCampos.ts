// Alvos de um adendo: o verificador/administrador escolhe o CAMPO da ficha e, nos campos compostos
// (DOA, Peso por Caixa, Recepção, Espera...), também o ITEM (carga/box) e o DADO dentro dele. O alvo
// é gravado como caminho ("campo_123.cargas.0.pesoMedioKg") para a assinatura do inspetor aplicar o
// novo valor no ponto certo do registro. Funções puras, testadas em tests/unit/adendoCampos.test.ts.

import { CHECKLISTS, itensDaSala, SALAS_CHECKLIST, type TipoChecklist } from "../fields/checklistConformidade";
import { PARTES_MIUDOS } from "../fields/qualidadeMiudos";

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
  cur: "Hidr. atual (m³)",
  prev: "Hidr. anterior (m³)",
  ice: "Gelo adicionado (kg)",
  preChiller: "Pré-chiller",
  chiller1: "Chiller 1",
  chiller2: "Chiller 2",
  coracao: "Coração",
  moela: "Moela",
  figado: "Fígado",
  cabeca: "Cabeça",
  pes: "Pés",
  chuveiro: "Chuveiro final",
  tanques: "Tanque",
  temperaturas: "Temperatura da água (°C)",
  ph: "pH",
  cloro: "Cloro (ppm)",
  aspersoresLigados: "Aspersores ligados",
  ventiladoresLigados: "Ventiladores ligados",
  condicaoVeiculo: "Condição do veículo",
};

/** Objetos aninhados cujos dados escalares também podem ser corrigidos (leituras de hidrômetro por tanque, temperaturas da água). */
const OBJETOS_ALVO = new Set(["tanques", "chuveiro", "temperaturas", "agua", "ambiente", "produtos", "sistemas", "salas", "partes"]);
/** Profundidade máxima dentro desses objetos (partes › parte › defeitos › defeito). */
const PROFUNDIDADE_MAXIMA = 3;
/** Chaves que só agrupam (não entram no rótulo): "Chiller 1 › Hidr. atual", não "Tanques › Chiller 1 › …". */
const PREFIXOS_ESTRUTURAIS = new Set(["tanques", "sistemas"]);

/** Rótulo legível de um dado aninhado (trilha = chaves a partir do objeto, ex.: ["salas", "carcacas", "escoamento"]). */
function rotuloDaTrilha(tipo: string | undefined, trilha: string[]): string {
  if (tipo && tipo in CHECKLISTS && trilha[0] === "salas" && trilha.length === 3) {
    const sala = SALAS_CHECKLIST.find((s) => s.chave === trilha[1]);
    const item = itensDaSala(tipo as TipoChecklist, trilha[1] as never).find((i) => i.chave === trilha[2]);
    if (sala && item) return `${sala.curto} › ${item.rotulo}`;
  }
  if (tipo === "qualidade_miudos" && trilha[0] === "partes") {
    const parte = PARTES_MIUDOS.find((p) => p.chave === trilha[1]);
    if (parte) {
      if (trilha[2] === "defeitos") return `${parte.rotulo} › ${parte.defeitos.find((d) => d.chave === trilha[3])?.rotulo ?? humanizar(trilha[3] ?? "")}`;
      if (trilha[2] === "amostra") return `${parte.rotulo} › Amostra`;
      if (trilha[2] === "existe") return `${parte.rotulo} › Existe no setor`;
    }
  }
  return trilha.filter((k) => !PREFIXOS_ESTRUTURAIS.has(k)).map(humanizar).join(" › ");
}

function coletarAninhados(campo: { chave: string; tipo?: string }, nome: string, objeto: Record<string, unknown>, trilha: string[], saida: AlvoAdendo[]): void {
  for (const [k, v] of Object.entries(objeto)) {
    const atual = [...trilha, k];
    if (ehEscalar(v)) {
      saida.push({ caminho: `${campo.chave}.${atual.join(".")}`, rotulo: `${nome} › ${rotuloDaTrilha(campo.tipo, atual)}`, valorAtual: v });
    } else if (ehObjeto(v) && atual.length < PROFUNDIDADE_MAXIMA + 1) {
      coletarAninhados(campo, nome, v, atual, saida);
    }
  }
}

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
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

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
    } else if (ehObjeto(v) && OBJETOS_ALVO.has(chave)) {
      coletarAninhados(campo, nome, v, [chave], alvos);
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
