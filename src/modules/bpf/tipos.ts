export type ResultadoBpf = "C" | "NP" | "NC";
export type StatusSolicitacao = "AGUARDANDO_APROVACAO" | "APROVADA" | "REPROVADA" | "PROGRAMADA";
export type StatusOrdem = "PROGRAMADA" | "CONCLUIDA";
/** emitido (inspetor) → verificado (Verificador, Painel de Verificação) → liberado (administrador, Painel de Arquivo; só então o SIF vê). */
export type StatusRelatorio = "emitido" | "verificado" | "liberado";

/** Setor de inspeção do monitoramento de manutenções diversas (app_config.setores_cadastrados). */
export const SETOR_BPF = "MANUTENÇÕES DIVERSAS";

/** Identificação do relatório diário de OS como ficha de monitoramento (nome, código de ficha e PAC), como nas demais fichas. */
export const NOME_RELATORIO_BPF = "Monitoramento de Infraestrutura e Equipamentos";
export const CODIGO_FICHA_BPF = "RAC 002/001";
export const PAC_BPF = "PAC 1";

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
  /** Especialidade de manutenção (elétrica, obra civil...), definida pelo PCM; nula = sem classificação. */
  especialidade: string | null;
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
  /** Especialidade de manutenção, definida pelo PCM (herdada da SS ao programar); nula = sem classificação. */
  especialidade: string | null;
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

/** Reprogramação feita pelo PCM, no mesmo dia, de uma OS que o inspetor marcou Não conforme. */
export interface ReprogramacaoDaNc {
  sequencia: number;
  prazo: string;
  justificativa: string | null;
  por: string | null;
  em: string;
  hash: string | null;
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
  /** Nulos nas OS programadas pelo PCM que o inspetor ainda não verificou (`sem_verificacao`). */
  data_verificacao: string | null;
  hora_verificacao: string | null;
  inspetor: string | null;
  observacao: string | null;
  /** OS programada pelo PCM no dia e incluída no relatório como "no prazo" sem passar pela verificação do inspetor. */
  sem_verificacao?: boolean;
  programada_em?: string | null;
  /** NC do inspetor que o PCM reprogramou no mesmo dia: o veredito segue NC, mas não conta como não conformidade. */
  reprogramada?: ReprogramacaoDaNc | null;
}

export interface Relatorio {
  id: string;
  setor: string;
  data_referencia: string;
  status: StatusRelatorio;
  itens: ItemRelatorio[];
  /** OS programadas pelo PCM depois da emissão (fora do hash de emissão, que cobre só os `itens`). */
  itens_posteriores: ItemRelatorio[];
  /** Reprogramações do PCM feitas depois da emissão, de OS que constam como NC em `itens`. */
  reprogramacoes_posteriores: { numero_os: string; reprogramada: ReprogramacaoDaNc }[];
  qtd_nc: number;
  qtd_np: number;
  qtd_conformes: number;
  /** NC do dia reprogramadas pelo PCM no mesmo dia (não entram em qtd_nc). */
  qtd_nc_reprogramadas: number;
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

/** Relatório do dia montado na hora (bpf_relatorio_do_dia) quando o inspetor ainda não emitiu: não é o documento assinado. */
export interface RelatorioProvisorio {
  provisorio: true;
  setor: string;
  data_referencia: string;
  gerado_em: string;
  itens: ItemRelatorio[];
  itens_posteriores: ItemRelatorio[];
  reprogramacoes_posteriores: { numero_os: string; reprogramada: ReprogramacaoDaNc }[];
  qtd_nc: number;
  qtd_np: number;
  qtd_conformes: number;
  qtd_nc_reprogramadas: number;
  /** OS abertas no dia que o inspetor não verificou: sem veredito, não constam no relatório. */
  sem_verificacao_pendentes: number;
}

/** O que a consulta por data devolve: o relatório emitido (assinado) ou o gerado na hora. */
export type RelatorioDoDia = (Relatorio & { provisorio: false }) | RelatorioProvisorio;

export interface ItemImportacao {
  numero_os: string;
  descricao: string;
  setor_area: string;
  acao_corretiva: string | null;
  responsavel: string | null;
  aberta_em: string | null;
  prazos: string[];
}
