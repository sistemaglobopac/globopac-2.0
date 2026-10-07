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
  /** Carga (GTA) herdada do Bem-Estar Animal; ausente em lotes digitados à mão. */
  cargaId?: string;
  gta?: string;
  /** Só parte desta carga entra no período (a outra parte chega no monitoramento seguinte). */
  parcial?: boolean;
}

/** Pausa da linha de abate informada pelo inspetor: a pendura para (as aves já penduradas continuam a chegar ao
 * pré-resfriamento). `fim` nulo = linha ainda parada na hora do monitoramento. */
export interface ParadaLinha {
  inicio: string;
  fim: string | null;
}

/** Como o período foi calculado pela chegada ao pré-resfriamento (ver chegadaPreResfriamento.ts). `acumulado`
 * (aves já chegadas, por carga) é a base do monitoramento seguinte. */
export interface ChegadaRegistrada {
  corteEm: string;
  velocidadeAvesH: number;
  origemVelocidade: "observada" | "nominal";
  transitoSegundos: number;
  acumulado: Record<string, number>;
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
  /** Campo legado de registros antigos: se só existir `condenas`, ele entra como "totalmente
   * condenadas" (ver ChillerCarcacasField). */
  condenas?: string;
  /** Aves no período (bruto − condenas) — base do cálculo de vazão unitária. */
  totalAves: number;
  /** Total bruto das cargas, antes de descontar condenas — usado pelos widgets seguintes da
   * mesma ficha (chuveiro final) para recompor a própria base. */
  totalAvesBruto: number;
  pesoMedioCarcaca: number;
  /** O inspetor optou por calcular o peso médio SÓ com os lotes que já têm peso (a balança ainda não passou nos demais).
   * O registro fecha assim, marcado como parcial: o verificador e o relatório veem quantas aves ficaram de fora. */
  pesoParcial?: { avesComPeso: number; avesSemPeso: number; lotesSemPeso: number };
  /** Período calculado pela chegada ao pré-resfriamento; ausente em lotes digitados à mão. */
  chegada?: ChegadaRegistrada;
  /** Resposta à pergunta "houve pausa da linha neste período?" — obrigatória antes de usar as cargas calculadas. */
  pausaInformada?: "sim" | "nao";
  /** Pausas da linha do dia conhecidas neste monitoramento (as dos anteriores + as novas): descontadas da duração de
   * cada carga e do avanço da carga em andamento. */
  paradas?: ParadaLinha[];
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
  /** O Chuveiro Final NÃO tem gelo — só as leituras do hidrômetro. */
  chuveiro: { prev: string; cur: string };
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
  /** Carcaça descartada na fase 2: sai do cálculo e exige `motivoDescarte`. */
  descartada?: boolean;
  motivoDescarte?: string;
}

/** Fase do teste de absorção: INICIAL = só pesagem inicial salva (EM_ANDAMENTO); FINAL = concluído. */
export type FaseAbsorcao = "INICIAL" | "FINAL";

/** Teste de Absorção de Água (Especial SIF) — 10 amostras de peso inicial/final; limite de
 * 8% de ganho médio de peso. */
export interface AbsorcaoAguaValor {
  items: AmostraAbsorcaoAgua[];
  /** Só preenchida nos registros de duas fases (ausente = teste feito de uma vez, como antes). */
  fase?: FaseAbsorcao;
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
  /** Instante (ISO) em que a 1ª etapa foi salva — a "hora inicial" do relatório. Ausente se o teste foi feito de uma vez. */
  primeiraEtapaSalvaEm?: string;
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

/** Monitoramento Diário de Ocorrência de Pragas (Especial SIF). `pragas[chave] = true` = presença
 * no dia; tudo false = ausência de pragas. Só o inspetor marca; a conformidade final segue com o
 * Verificador. */
export interface OcorrenciaPragasValor {
  pragas: Record<string, boolean>;
  /** Descrição de "Outras Pragas (citar)" — obrigatória quando `pragas.outras` é true. */
  outrasPragas: string;
  /** Alguma praga marcada como presente. */
  houvePraga: boolean;
  /** Ações corretivas executadas — obrigatório marcar quando houve praga. */
  acoesCorretivas: boolean;
  /** Texto das medidas, congelado no registro quando `acoesCorretivas` é true. */
  medidasCorretivas: string | null;
}

export interface BoxEsperaAves {
  /** Identificação do box na área de espera (texto livre: "1", "A2"…). */
  box: string;
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtdAves: number;
  /** Comportamento das aves no box: chave de COMPORTAMENTOS_AVES. */
  comportamento: string;
  outrasCondicoes: string;
}

/** Bem-Estar Animal na Área de Espera (Especial SIF): cargas por box + comportamento das aves,
 * temperatura ambiente e estado de aspersores/ventiladores. Com aves ofegantes, a ação corretiva é
 * ligar os dois equipamentos. */
export interface EsperaAvesValor {
  boxes: BoxEsperaAves[];
  /** Temperatura ambiente (°C), como digitada. */
  temperaturaC: string;
  aspersoresLigados: boolean | null;
  ventiladoresLigados: boolean | null;
  houveOfegantes: boolean;
  /** Aspersores e ventiladores acionados como ação corretiva por aves ofegantes. */
  acaoCorretiva: boolean;
  /** `YYYY-MM-DDTHH:mm` (Manaus) em que a ação corretiva foi acionada. */
  acaoCorretivaEm: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Uma carga no monitoramento de peso vivo por caixa de transporte. */
export interface CargaPesoCaixa {
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtdAves: number;
  /** Aves por caixa (gaiola), como digitado. */
  avesPorCaixa: string;
  /** Peso médio das aves da carga (kg), como digitado. */
  pesoMedioKg: string;
}

/** Peso vivo por caixa de transporte (Especial SIF): conforme até 25 kg por caixa. */
export interface PesoCaixaValor {
  cargas: CargaPesoCaixa[];
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Caixas de transporte vazias antes do tanque de imersão (Especial SIF). */
export interface CaixasVaziasValor {
  /** true = todas as caixas estão vazias. `null` = não respondido. */
  todasVazias: boolean | null;
  caixasNaoVazias: string;
  acaoCorretiva: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Bem-Estar Animal na Sala de Pendura (Especial SIF): temperatura, ventiladores, luzes, ruídos
 * desnecessários e conduta dos auxiliares na pendura. `null` = ainda não respondido. */
export interface PenduraAvesValor {
  /** Temperatura da sala (°C), como digitada. */
  temperaturaC: string;
  ventiladoresLigados: boolean | null;
  luzesAcesas: boolean | null;
  /** true = há ruídos desnecessários (desvio). */
  ruidosDesnecessarios: boolean | null;
  /** true = auxiliares pendurando conforme os princípios de bem-estar animal. */
  auxiliaresConformes: boolean | null;
  /** Ocorrência e ação corretiva — obrigatória quando há desvio. */
  descricaoDesvio: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Bem-Estar Animal — Eletronarcose (Especial SIF): parâmetros elétricos, tempos da linha (em
 * segundos, como digitados), pré-choque, aves sem sangrar e sinais de insensibilização.
 * `null` = ainda não respondido. Nos sinais, true ("Sim") = ave consciente (desvio). */
export interface EletronarcoseAvesValor {
  voltagemV: string;
  frequenciaHz: string;
  correnteMa: string;
  /** Contenção da pendura até a cuba de insensibilização (máx. 60 s). */
  contencaoS: string;
  /** Tempo dentro da cuba de insensibilização. */
  tempoCubaS: string;
  /** Saída da cuba até a sangria (máx. 12 s). */
  saidaSangriaS: string;
  /** Tempo de sangria (mín. 180 s = 3 min). */
  sangriaS: string;
  /** true = aves recebendo pré-choque (desvio). */
  preChoque: boolean | null;
  /** true = há aves sem sangrar após o disco automático e o rapasse da sangria (desvio). */
  avesSemSangrar: boolean | null;
  vocalizacao: boolean | null;
  reflexosOculares: boolean | null;
  asasAfastadas: boolean | null;
  respiracaoRitmica: boolean | null;
  tremores: boolean | null;
  /** Tempo para restabelecer a postura de estação, em SEGUNDOS (máx. 60). */
  posturaEstacaoS: string;
  /** LEGADO: registros assinados em 01/10/2026 gravaram este tempo em minutos por engano de unidade.
   * Só é lido para exibir esses registros como foram gravados; o preenchimento novo usa posturaEstacaoS. */
  posturaEstacaoMin?: string;
  /** Ocorrência e ação corretiva — obrigatória quando há desvio. */
  descricaoDesvio: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Uma carga no monitoramento de Rastreabilidade e Controle de DOA. Os campos herdados vêm da
 * programação de abate e da recepção de aves; o inspetor digita só aves recebidas e mortas. */
export interface CargaDoa {
  cargaId: string;
  /** Ordem em que a carga começou a ser pendurada no dia (1 = primeira); null = ainda sem pendura. */
  ordemPendura: number | null;
  /** `YYYY-MM-DDTHH:mm` (Manaus) — início da pendura, que é o início do abate da carga. */
  penduraInicioEm: string;
  placa: string;
  /** Peso médio das aves (kg) herdado do monitoramento de Peso por Caixa; vazio = ainda não informado. */
  pesoMedioKg?: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  /** Aves previstas na GTA. */
  qtdPrevista: number;
  /** Aves que de fato chegaram na carga (inclui as mortas), como digitado. */
  avesRecebidas: string;
  /** Aves mortas na chegada (DOA), como digitado. */
  avesMortas: string;
  /** Calculados — gravados para o relatório não depender de recalcular. */
  doaPct: number | null;
  /** Recebidas − previstas (negativo = vieram a menos). */
  saldoDiferenca: number | null;
  /** Nota de necessidade de documento de correção de saldo, quando aplicável. */
  notaSaldo: string | null;
}

/** Rastreabilidade e Controle de DOA (Especial SIF): uma linha por carga do dia. */
export interface RastreabilidadeDoaValor {
  /** Dia de abate (YYYY-MM-DD) cujas cargas estão listadas. */
  dataAbate: string;
  cargas: CargaDoa[];
  totalRecebidas: number;
  totalMortas: number;
  /** % de DOA do conjunto das cargas informadas. */
  doaTotalPct: number | null;
  /** Sem limite normativo: DOA e diferença de saldo são registrados, nunca reprovam sozinhos. */
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Recepção de Aves / Bem-Estar Animal (Especial SIF): uma carga (GTA) por monitoramento. Datas e
 * horas são `YYYY-MM-DDTHH:mm` no horário de Manaus (formato do input datetime-local). */
export interface RecepcaoAvesValor {
  cargaId: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtdAves: number;
  veiculoId: string;
  placa: string;
  condicaoVeiculo: "CONFORME" | "NAO_CONFORME" | "";
  obsVeiculo: string;
  retiradaRacaoEm: string;
  embarqueInicioEm: string;
  embarqueFimEm: string;
  chegadaEm: string;
  penduraInicioEm: string;
  /** Condição geral da carga na chegada (uma só): chave de CONDICOES_ANIMAIS. */
  condicaoAnimais: string;
  outrasCondicoes: string;
  /** Calculados (minutos) — gravados para o relatório não depender de recalcular. */
  jejumMin: number | null;
  dietaHidricaMin: number | null;
  viagemMin: number | null;
  esperaMin: number | null;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export type ChaveAguaResfriamento =
  | "preChiller"
  | "chiller1"
  | "chiller2"
  | "chillerPartes1"
  | "chillerPartes2"
  | "miniFigado"
  | "miniMoela"
  | "miniCabeca"
  | "miniCoracao"
  | "miniPes";

export type ChaveAmbienteResfriamento = "salaCarcacas" | "salaMiudos";

export type ChaveProdutoResfriamento = "carcaca" | "parte" | "figado" | "moela" | "cabeca" | "coracao" | "pes";

/** Duas amostras de temperatura (ºC, como digitado) de um produto. */
export interface AmostrasProduto {
  amostra1: string;
  amostra2: string;
  /** O monitoramento foi feito, mas não havia este produto saindo do sistema naquele momento (ex.: início do turno):
   * não há amostras a informar. */
  semProduto?: boolean;
}

/** Temperaturas dos Sistemas de Pré-resfriamento (Especial SIF): água de cada tanque e duas
 * amostras de cada produto na saída dos sistemas. */
export interface TemperaturaResfriamentoValor {
  agua: Record<ChaveAguaResfriamento, string>;
  /** Temperatura ambiente das salas de pré-resfriamento (ºC, como digitado). */
  ambiente: Record<ChaveAmbienteResfriamento, string>;
  produtos: Record<ChaveProdutoResfriamento, AmostrasProduto>;
  /** Qual parte foi aferida: Filé de peito, Asa ou Coxa e Sobrecoxa. */
  tipoParte: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export type ChaveSistemaPotabilidade = "carcacas" | "partes" | "miudos";

/** Teste de um tanque: qual tanque foi testado (rodízio) e o pH e o cloro (ppm) como digitados. */
export interface TesteTanque {
  tanque: string;
  ph: string;
  cloro: string;
}

/** Potabilidade da Água (Especial SIF): um tanque testado em cada um dos 3 sistemas de pré-resfriamento. */
export interface PotabilidadeAguaValor {
  sistemas: Record<ChaveSistemaPotabilidade, TesteTanque>;
  conformidade: boolean;
  detalhesRNC: string | null;
}

/** Potabilidade da Água nos pontos de coleta (Especial SIF): o ponto sorteado e o pH e o cloro (ppm) como digitados. */
export interface PotabilidadePontosValor {
  ponto: string;
  ph: string;
  cloro: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export type ChaveTanqueAbsorcao = "preChiller" | "chiller1" | "chiller2";

/** Controle de Absorção (Especial SIF): tempo de permanência no pré-chiller, temperatura da água e
 * borbulhamento ("moderado" | "intenso") do pré-chiller e dos chillers 1 e 2, como digitados. */
export interface ControleAbsorcaoValor {
  tempoPermanenciaMin: string;
  temperaturas: Record<ChaveTanqueAbsorcao, string>;
  borbulhamento: Record<ChaveTanqueAbsorcao, string>;
  observacao: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export type ChaveParteMiudo = "cabeca" | "pes" | "moela" | "figado" | "coracao";

/** Qualidade de Miúdos e Pertences (Especial SIF): por parte, a quantidade avaliada e a quantidade com
 * cada defeito, como digitadas (o percentual é calculado). */
export interface QualidadeMiudosValor {
  partes: Record<ChaveParteMiudo, { amostra: string; defeitos: Record<string, string> }>;
  observacao: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}

export type ChaveSalaChecklist = "carcacas" | "miudos" | "geral";

/** Checklist de conformidade (Águas Residuais e Ventilação) das salas de pré-resfriamento de
 * Carcaças e de Miúdos: resposta de cada item (por chave) em cada sala. */
export interface ChecklistConformidadeValor {
  salas: Record<ChaveSalaChecklist, Record<string, string>>;
  observacao: string;
  conformidade: boolean;
  detalhesRNC: string | null;
}
