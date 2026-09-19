// Formas de valor dos widgets "Especial SIF" (dados_dinamicos[chave] quando campo.tipo é um
// dos tipos compostos do catálogo do Construtor de Fichas) — portados do v1
// (src/components/fields/*.jsx). schema-campos.ts valida esses tipos como `z.unknown()`
// deliberadamente (ver comentário lá): a estrutura interna é responsabilidade de cada widget,
// não da validação genérica de dados_dinamicos.

export interface TanqueHidrometro {
  /** Leitura anterior (m³) — herdada do monitoramento anterior de hoje, travada na UI assim
   * que existir uma leitura para herdar (ver useUltimoRegistroFicha). */
  prev: string;
  /** Leitura atual (m³) — o único valor que o inspetor efetivamente digita a cada apontamento. */
  cur: string;
  /** Gelo adicionado (kg ≈ L). */
  ice: string;
}

export interface CargaProcessada {
  id: string;
  quantity: string;
  avgLiveWeight: string;
}

export interface ChillerCarcacasValor {
  cargas: CargaProcessada[];
  tanques: {
    preChiller: TanqueHidrometro;
    chiller1: TanqueHidrometro;
    chiller2: TanqueHidrometro;
  };
  condenasParcial: string;
  condenasTotal: string;
  /** Aves no período (bruto − condenas) — base do cálculo de vazão unitária. */
  totalAves: number;
  /** Total bruto das cargas, antes de descontar condenas — usado pelos widgets seguintes da
   * mesma ficha (chuveiro final) para recompor a própria base. */
  totalAvesBruto: number;
  pesoMedioCarcaca: number;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Renovação da Água do Chiller de Partes — depende AO VIVO do "Renovação da Água do SPR
 * Carcaças" da mesma ficha (peso médio de carcaça e carcaças parcialmente aproveitadas), lido
 * via useWatch em FichaForm.tsx, não buscado no banco. */
export interface ChillerPartesValor {
  tanques: {
    chiller1: TanqueHidrometro;
    chiller2: TanqueHidrometro;
  };
  totalCondenacoes: number;
  pesoMedioCarcaca: number;
  /** true quando o SPR Carcaças desta ficha ainda não foi preenchido — bloqueia o envio. */
  pesoCarcacaIndisponivel: boolean;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Vazão do Chuveiro Final de Lavagem de Carcaças — mesma dependência ao vivo do SPR
 * Carcaças (total de aves e condenas totais) desta ficha. */
export interface LavagemFinalValor {
  chuveiro: TanqueHidrometro;
  condenacoesParciais: string;
  totalAvesBruto: number;
  condenasTotalSPR: number;
  totalAves: number;
  avesIndisponivel: boolean;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Renovação da Água dos Mini-Chillers de Miúdos (coração, moela, fígado, cabeça, pés) —
 * peso unitário de cada miúdo vem da Tabela DE-PARA por faixa de peso médio de carcaça
 * (herdado ao vivo do SPR Carcaças desta ficha). */
export interface MiniChillersValor {
  tanques: {
    coracao: TanqueHidrometro;
    moela: TanqueHidrometro;
    figado: TanqueHidrometro;
    cabeca: TanqueHidrometro;
    pes: TanqueHidrometro;
  };
  totalAves: number;
  pesoCarcaca: number;
  avesIndisponivel: boolean;
  pesoMiudoIndisponivel: boolean;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export interface AmostraAbsorcaoAgua {
  id: number;
  seal: string;
  initial: string;
  final: string;
}

/** Teste de Absorção de Água (Especial SIF) — 10 amostras de peso inicial/final; limite de
 * 8% de ganho médio de peso. */
export interface AbsorcaoAguaValor {
  items: AmostraAbsorcaoAgua[];
  status: "conforme" | "nao-conforme";
  averagePercentage: number;
  validCount: number;
  sumInitial: number;
  sumFinal: number;
}

export interface AmostraDrippingTest {
  id: number;
  seal: string;
  m0: string;
  m1: string;
  m3: string;
  horaRetirada: string;
  m2: string;
  timeNc?: boolean;
}

/** Dripping Test — Portaria 210/1998 (Especial SIF): 6 amostras, limite de 6% de absorção
 * média + tempo mínimo de drenagem conforme peso bruto congelado (M0). */
export interface DrippingTestValor {
  items: AmostraDrippingTest[];
  lote: string;
  horaInicio: string;
  status: "conforme" | "nao-conforme";
  averagePercentage: number;
  validCount: number;
  timeNonConformity: boolean;
}

/** Registro de Parada de Equipamento — sem cálculo de conformidade, só o tempo de inatividade. */
export interface ParadaEquipamentoValor {
  hora_parada: string;
  hora_retomada: string;
  tempo_minutos: number;
}
