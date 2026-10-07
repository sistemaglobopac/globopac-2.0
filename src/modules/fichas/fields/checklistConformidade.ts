// Monitoramentos de checklist de conformidade (Águas Residuais, Ventilação e Higiene) — funções PURAS (sem
// React). Cada monitoramento cobre as duas salas de pré-resfriamento (Carcaças e Miúdos): cada item é
// respondido "Conforme / Não conforme / Não se aplica" ou, no excesso de água no piso, "Sim / Não"
// (Sim = não conforme). Qualquer item não conforme, em qualquer sala, torna o monitoramento NÃO
// CONFORME. Testadas em tests/unit/checklistConformidade.test.ts.
import type { ChaveSalaChecklist, ChecklistConformidadeValor } from "./tiposCompostos";

export type TipoChecklist = "aguas_residuais" | "ventilacao" | "higiene_habitos" | "pso" | "higiene_operacional" | "higiene_colaboradores";

/** `conforme`: Conforme / Não conforme / Não se aplica. `sim_e_nc`: Sim / Não, em que "Sim" é a não conformidade. */
export type ModoItem = "conforme" | "sim_e_nc";

export interface ItemChecklist {
  chave: string;
  rotulo: string;
  modo: ModoItem;
  /** Título do bloco em que o item aparece (opcional). */
  grupo?: string;
  /** Salas em que o item existe; ausente = todas as salas do checklist. */
  somenteSalas?: ChaveSalaChecklist[];
}

export interface DefinicaoChecklist {
  titulo: string;
  /** Salas cobertas pelo monitoramento; ausente = as duas salas de pré-resfriamento. `geral` = sem divisão por sala. */
  salas?: ChaveSalaChecklist[];
  itens: ItemChecklist[];
}

export const SALAS_CHECKLIST: { chave: ChaveSalaChecklist; rotulo: string; curto: string }[] = [
  { chave: "carcacas", rotulo: "Sala de Pré-resfriamento de Carcaças", curto: "Carcaças" },
  { chave: "miudos", rotulo: "Sala de Pré-resfriamento de Miúdos", curto: "Miúdos" },
  { chave: "geral", rotulo: "Geral", curto: "Geral" },
];

const hig = (grupo: string, chave: string, rotulo: string, modo: ModoItem = "conforme"): ItemChecklist => ({ chave, rotulo, modo, grupo });
const pso = hig;

export const CHECKLISTS: Record<TipoChecklist, DefinicaoChecklist> = {
  pso: {
    titulo: "Procedimentos Sanitários Operacionais",
    salas: ["geral"],
    itens: [
      pso("PSO 25", "trocaUtensilios", "Troca dos utensílios auxiliares e caixas brancas"),
      pso("PSO 26", "fluxoEsteiraRependura", "Fluxo contínuo e sem acúmulo na esteira de rependura?"),
      pso("PSO 26", "autoHigienizacaoEsteira", "Auto-higienização da esteira de rependura ligada?"),
      pso("PSO 28", "embalagemPrimaria", "Embalagem primária de miúdos e pés íntegras e inócuas?"),
      pso("PSO 28", "soldaEmbalagemKits", "Solda da embalagem dos kits de miúdos para frango inteiro"),
      pso("PSO 28", "kitsCompletos", "Kits de miúdos completos e embalados separadamente (2 pés, 1 cabeça, 1 fígado e 1 moela)"),
      pso("PSO 28", "autoHigienizacaoEmbaladoras", "Auto-higienização das embaladoras de miúdos ativa?"),
    ],
  },
  higiene_operacional: {
    titulo: "Higiene Operacional das Salas de Pré-resfriamento",
    itens: [
      { chave: "pisoRodapes", rotulo: "Piso e rodapés", modo: "conforme" },
      { chave: "paredes", rotulo: "Paredes", modo: "conforme" },
      { chave: "equipamentos", rotulo: "Equipamentos", modo: "conforme" },
      { chave: "calhas", rotulo: "Calhas", modo: "conforme" },
    ],
  },
  higiene_colaboradores: {
    titulo: "Monitoramento de Higiene e Hábitos Higiênicos dos Colaboradores",
    salas: ["geral"],
    itens: [
      { chave: "ausenciaRoupasCivis", rotulo: "Ausência de roupas civis sob o uniforme", modo: "conforme" },
      { chave: "uniformeCompletoLimpo", rotulo: "Uniforme completo e limpo", modo: "conforme" },
      { chave: "toucaAmarrada", rotulo: "Touca devidamente amarrada", modo: "conforme" },
      { chave: "botasLimpas", rotulo: "Botas limpas", modo: "conforme" },
      { chave: "episLimpos", rotulo: "EPIs limpos", modo: "conforme" },
      { chave: "unhasCurtasLimpas", rotulo: "Unhas curtas e limpas, sem esmalte", modo: "conforme" },
      { chave: "ausenciaBarba", rotulo: "Homens: ausência de barba", modo: "conforme" },
      { chave: "cabelosNaoAparentes", rotulo: "Cabelos não aparentes", modo: "conforme" },
      { chave: "ausenciaAdornos", rotulo: "Ausência de adornos", modo: "conforme" },
      { chave: "ausenciaCosmeticos", rotulo: "Ausência de uso de cosméticos", modo: "conforme" },
      { chave: "ausenciaFerimentos", rotulo: "Ausência de ferimentos expostos", modo: "conforme" },
      { chave: "ausenciaPerfume", rotulo: "Ausência de cheiro de perfume", modo: "conforme" },
      { chave: "ausenciaEletronicos", rotulo: "Ausência de aparelhos eletrônicos", modo: "conforme" },
    ],
  },
  higiene_habitos: {
    titulo: "Higiene e Hábitos Higiênicos dos Colaboradores",
    itens: [
      hig("Barreira sanitária", "lavadorBotas", "Lavador de botas em pleno funcionamento?"),
      hig("Barreira sanitária", "vazaoAgua", "Vazão de água?"),
      hig("Barreira sanitária", "escovasManuais", "Escovas manuais?"),
      hig("Barreira sanitária", "detergente", "Detergente?"),
      hig("Barreira sanitária", "sabonetePsanitizante", "Sabonete e sanitizante?"),
      hig("Barreira sanitária", "secadorMaos", "Secador de mãos?"),
      hig("Organização dos Setores", "usoToucas", "Uso adequado das toucas"),
      hig("Organização dos Setores", "usoLuvas", "Uso adequado das luvas"),
      hig("Organização dos Setores", "usoAventais", "Uso adequado de aventais"),
      hig("Organização dos Setores", "luvasHigienizadas", "Luvas higienizadas?"),
      hig("Organização dos Setores", "aventaisHigienizados", "Aventais higienizados?"),
      hig("Organização dos Setores", "materiaisEstranhos", "Materiais estranhos no setor", "sim_e_nc"),
      hig("Organização dos Setores", "organizacaoSetor", "Organização do setor"),
    ],
  },
  aguas_residuais: {
    titulo: "Monitoramento de Águas Residuais",
    itens: [
      { chave: "excessoAguaPiso", rotulo: "Excesso de água no piso", modo: "sim_e_nc" },
      { chave: "escoamentoCarcacas", rotulo: "Escoamento da água dos tanques de pré-resfriamento de carcaças", modo: "conforme", somenteSalas: ["carcacas"] },
      { chave: "escoamentoPartes", rotulo: "Escoamento da água do tanque de pré-resfriamento de partes", modo: "conforme", somenteSalas: ["carcacas"] },
      { chave: "escoamentoEsteiraCones", rotulo: "Escoamento da água de auto-higienização da esteira de frango inteiro para linhas de cone", modo: "conforme", somenteSalas: ["carcacas"] },
      { chave: "escoamentoMiudos", rotulo: "Escoamento da água dos tanques de pré-resfriamento de miúdos", modo: "conforme", somenteSalas: ["miudos"] },
      { chave: "escoamentoEmbalagemMiudos", rotulo: "Escoamento da água da auto-higienização da máquina de embalar miúdos", modo: "conforme", somenteSalas: ["miudos"] },
      { chave: "escoamentoPiaMaos", rotulo: "Escoamento da água da pia de higienizar mãos", modo: "conforme", somenteSalas: ["miudos"] },
      { chave: "direcionamentoCanaletas", rotulo: "Direcionamento da água para canaletas", modo: "conforme" },
      { chave: "canaletasDesobstruidas", rotulo: "Canaletas desobstruídas", modo: "conforme" },
    ],
  },
  ventilacao: {
    titulo: "Monitoramento de Ventilação",
    itens: [
      { chave: "ausenciaOdores", rotulo: "Ausência de odores", modo: "conforme" },
      { chave: "ausenciaCondensacao", rotulo: "Ausência de condensações", modo: "conforme" },
      { chave: "ausenciaVapores", rotulo: "Ausência de vapores", modo: "conforme" },
    ],
  },
};

/** Respostas possíveis e o rótulo de cada uma, conforme o modo do item. "Não se aplica" cobre o item
 * que não existe naquela sala (ex.: máquina de embalar miúdos na sala de carcaças). */
export const OPCOES_POR_MODO: Record<ModoItem, { valor: string; rotulo: string; naoConforme: boolean }[]> = {
  conforme: [
    { valor: "conforme", rotulo: "Conforme", naoConforme: false },
    { valor: "nao_conforme", rotulo: "Não conforme", naoConforme: true },
    { valor: "na", rotulo: "Não se aplica", naoConforme: false },
  ],
  sim_e_nc: [
    { valor: "nao", rotulo: "Não", naoConforme: false },
    { valor: "sim", rotulo: "Sim", naoConforme: true },
  ],
};

/** Salas cobertas pelo checklist: as duas de pré-resfriamento, ou só as da definição. */
export function salasDoChecklist(tipo: TipoChecklist) {
  const def = CHECKLISTS[tipo];
  return SALAS_CHECKLIST.filter((s) => (def.salas ? def.salas.includes(s.chave) : s.chave !== "geral"));
}

/** Itens que existem na sala (alguns itens são específicos de uma sala). */
export function itensDaSala(tipo: TipoChecklist, sala: ChaveSalaChecklist): ItemChecklist[] {
  return CHECKLISTS[tipo].itens.filter((i) => !i.somenteSalas || i.somenteSalas.includes(sala));
}

export function rotuloResposta(modo: ModoItem, resposta: string | undefined): string {
  return OPCOES_POR_MODO[modo].find((o) => o.valor === resposta)?.rotulo ?? "—";
}

export function respostaNaoConforme(modo: ModoItem, resposta: string | undefined): boolean {
  return OPCOES_POR_MODO[modo].find((o) => o.valor === resposta)?.naoConforme ?? false;
}

export function checklistVazio(tipo: TipoChecklist): ChecklistConformidadeValor {
  return {
    salas: Object.fromEntries(salasDoChecklist(tipo).map((s) => [s.chave, Object.fromEntries(itensDaSala(tipo, s.chave).map((i) => [i.chave, ""]))])) as Record<ChaveSalaChecklist, Record<string, string>>,
    observacao: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** Itens respondidos como não conformes, por sala (para o selo, a RNC e o relatório). */
export function avaliarChecklist(tipo: TipoChecklist, v: ChecklistConformidadeValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  for (const sala of salasDoChecklist(tipo)) {
    for (const i of itensDaSala(tipo, sala.chave)) {
      if (respostaNaoConforme(i.modo, v.salas?.[sala.chave]?.[i.chave])) {
        motivos.push(`${sala.chave === "geral" ? "" : `${sala.curto} — `}${i.modo === "sim_e_nc" ? i.rotulo : `${i.rotulo}: não conforme`}`);
      }
    }
  }
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorChecklist(tipo: TipoChecklist, v: ChecklistConformidadeValor): ChecklistConformidadeValor {
  const { conformidade, motivos } = avaliarChecklist(tipo, v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `${CHECKLISTS[tipo].titulo} — ${motivos.join("; ")}` : null };
}

/** Todos os itens das duas salas precisam de resposta antes de assinar. */
export function motivosBloqueioChecklist(tipo: TipoChecklist, v: ChecklistConformidadeValor | undefined | null): string[] {
  const def = CHECKLISTS[tipo];
  if (!v) return [`${def.titulo}: responda todos os itens.`];
  const motivos: string[] = [];
  for (const sala of salasDoChecklist(tipo)) {
    for (const i of itensDaSala(tipo, sala.chave)) {
      if (!OPCOES_POR_MODO[i.modo].some((o) => o.valor === v.salas?.[sala.chave]?.[i.chave])) {
        motivos.push(`${def.titulo}: responda "${i.rotulo}"${sala.chave === "geral" ? "" : ` (${sala.rotulo})`}.`);
      }
    }
  }
  return motivos;
}
