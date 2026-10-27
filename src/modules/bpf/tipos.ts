export type ResultadoBpf = "C" | "NP" | "NC";
export type StatusSolicitacao = "AGUARDANDO_APROVACAO" | "APROVADA" | "REPROVADA" | "PROGRAMADA";
export type StatusOrdem = "PROGRAMADA" | "CONCLUIDA";
/** emitido (inspetor) → verificado (Verificador, Painel de Verificação) → liberado (administrador, Painel de Arquivo; só então o SIF vê). */
export type StatusRelatorio = "emitido" | "verificado" | "liberado";

/** Setor de inspeção do monitoramento de manutenções diversas (app_config.setores_cadastrados). */
export const SETOR_BPF = "MANUTENÇÕES DIVERSAS";

export const CATEGORIAS_BPF = [
  "Prédio / estrutura",
  "Piso",
  "Teto / forro",
  "Paredes",
  "Rodapés",
  "Equipamentos",
  "Instalações elétricas",
  "Iluminação",
  "Instalações hidráulicas",
  "Vazamento",
  "Oxidação / ferrugem",
  "Solda não sanitária",
  "Portas / maçanetas",
  "Aberturas, frestas",
  "Água residual",
  "Reparo improvisado",
  "Uso de material indevido",
  "Sujidade",
  "Zinabre, graxa",
  "Entupimentos, obstruções",
  "Risco de contaminação cruzada",
  "Goteira",
  "Condensação",
  "Outros",
] as const;

export interface CentroCustoRef {
  id: string;
  codigo: string;
  nome: string;
}

export interface Solicitacao {
  id: string;
  numero: number;
  setor: string;
  centro_custo_id: string;
  centro: CentroCustoRef | null;
  categoria: string;
  descricao: string;
  local_detalhe: string | null;
  constatado_em: string;
  aberta_por: string;
  aberta_por_nome: string;
  status: StatusSolicitacao;
  aprovada_por_nome: string | null;
  aprovada_em: string | null;
  hash_aprovacao: string | null;
  reprovada_por_nome: string | null;
  reprovada_em: string | null;
  motivo_reprovacao: string | null;
  /** Último ajuste do administrador antes da assinatura (descrição, local ou tipo). */
  editada_por_nome: string | null;
  editada_em: string | null;
  criado_em: string;
}

/** Foto anexada pelo inspetor à SS (bucket privado bpf-fotos). */
export interface FotoSolicitacao {
  id: string;
  solicitacao_id: string;
  nome: string;
  caminho: string;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  enviado_por: string;
  criado_em: string;
}

export const MAX_FOTOS_SOLICITACAO = 10;
export const TAMANHO_MAXIMO_FOTO_BYTES = 10 * 1024 * 1024;

export interface Programacao {
  sequencia: number;
  prazo: string;
  acao_corretiva: string | null;
  responsavel: string | null;
  justificativa: string | null;
  importada: boolean;
  programado_por_nome: string | null;
  hash_assinatura: string | null;
  criado_em: string;
}

export interface Verificacao {
  id: string;
  ordem_id: string;
  data_verificacao: string;
  hora_verificacao: string;
  resultado: ResultadoBpf;
  prazo_vigente: string;
  observacao: string | null;
  inspetor_nome: string;
}

export interface Ordem {
  id: string;
  numero_os: string;
  solicitacao_id: string | null;
  setor: string;
  centro_custo_id: string;
  centro: CentroCustoRef | null;
  categoria: string;
  descricao: string;
  local_detalhe: string | null;
  constatado_em: string;
  acao_corretiva: string | null;
  responsavel: string | null;
  /** Inspetor que abriu a SS de origem; nulo nas OS importadas, que não têm SS. */
  constatado_por: string | null;
  prazo_atual: string;
  reprogramacoes: number;
  status: StatusOrdem;
  concluida_em: string | null;
  origem: "v2" | "importada";
  criado_em: string;
  programacoes: Programacao[];
  /** Somente as verificações da data consultada (ver useOrdensParaVerificar). */
  verificacoes: Verificacao[];
}

export interface ItemRelatorio {
  numero_os: string;
  solicitacao_numero: number | null;
  anomalia: string;
  categoria: string;
  local_detalhe: string | null;
  setor_area: string;
  centro_custo_codigo: string;
  acao_corretiva: string | null;
  responsavel: string | null;
  constatado_em: string;
  constatado_por: string | null;
  aprovada_por: string | null;
  aprovada_em: string | null;
  aprovada_hash: string | null;
  origem: "v2" | "importada";
  prazo_vigente: string;
  reprogramacoes: number;
  programacao: {
    sequencia: number;
    prazo: string;
    justificativa: string | null;
    por: string | null;
    em: string;
    hash: string | null;
  }[];
  resultado: ResultadoBpf;
  data_verificacao: string;
  hora_verificacao: string;
  inspetor: string;
  observacao: string | null;
}

export interface Relatorio {
  id: string;
  setor: string;
  data_referencia: string;
  status: StatusRelatorio;
  itens: ItemRelatorio[];
  qtd_nc: number;
  qtd_np: number;
  qtd_conformes: number;
  emitido_por: string;
  emitido_por_nome: string;
  emitido_em: string;
  hash_emissao: string;
  verificado_por: string | null;
  verificado_por_nome: string | null;
  verificado_em: string | null;
  hash_verificacao: string | null;
  liberado_por: string | null;
  liberado_por_nome: string | null;
  liberado_em: string | null;
  hash_liberacao: string | null;
}

export interface ItemImportacao {
  numero_os: string;
  descricao: string;
  setor_area: string;
  acao_corretiva: string | null;
  responsavel: string | null;
  aberta_em: string | null;
  prazos: string[];
}
