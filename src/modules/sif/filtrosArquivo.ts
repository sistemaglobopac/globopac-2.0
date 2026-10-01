// Filtros do Painel de Arquivo — funções PURAS (sem React), testadas em
// tests/unit/filtrosArquivo.test.ts. O arquivo lista TODAS as fichas já verificadas (liberadas ou
// não ao SIF) e o usuário recorta por data, PAC, setor, turno, ficha, situação, inspetor e liberação.
import { turnoDoDia } from "@/modules/bordo/api";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import { situacaoDe, type SituacaoConformidade } from "@/shared/situacaoConformidade";

export type FiltroLiberacao = "todas" | "pendentes" | "liberadas";

export interface FiltrosArquivo {
  /** Dia inicial do monitoramento (YYYY-MM-DD, horário de Manaus), inclusive. */
  de: string;
  /** Dia final do monitoramento (YYYY-MM-DD, horário de Manaus), inclusive. */
  ate: string;
  pac: string;
  setor: string;
  /** "1º Turno" | "2º Turno" */
  turno: string;
  /** Tipo da ficha (código sem versão). */
  ficha: string;
  situacao: "" | SituacaoConformidade;
  /** user_id do inspetor. */
  inspetor: string;
  liberacao: FiltroLiberacao;
}

export const FILTROS_ARQUIVO_VAZIOS: FiltrosArquivo = {
  de: "",
  ate: "",
  pac: "",
  setor: "",
  turno: "",
  ficha: "",
  situacao: "",
  inspetor: "",
  liberacao: "todas",
};

export interface ItemArquivo {
  id: string;
  setor: string;
  conformidade: boolean | null;
  situacao_conformidade?: SituacaoConformidade | null;
  liberado_sif: boolean;
  criado_em: string;
  ficha_template_id: string;
  user_id: string;
}

export interface ContextoFiltroArquivo {
  /** PACs de um template (um template pode atender mais de um PAC). */
  pacsDoTemplate: (templateId: string) => string[];
  /** Tipo da ficha independente de versão. */
  tipoDaFicha: (templateId: string) => string;
}

/** Estado inicial do painel: sem recortes, mostrando a fila "aguardando liberação" (o fluxo de
 * sempre); trocar a liberação para "todas" ou "liberadas" abre o arquivo completo. */
export const FILTROS_ARQUIVO_INICIAIS: FiltrosArquivo = { ...FILTROS_ARQUIVO_VAZIOS, liberacao: "pendentes" };

/** Quantos filtros estão ativos além do estado inicial. */
export function filtrosAtivos(f: FiltrosArquivo): number {
  const { liberacao, ...resto } = f;
  return Object.values(resto).filter((v) => v !== "").length + (liberacao !== FILTROS_ARQUIVO_INICIAIS.liberacao ? 1 : 0);
}

export function filtrarArquivo<T extends ItemArquivo>(itens: T[], f: FiltrosArquivo, ctx: ContextoFiltroArquivo): T[] {
  return itens.filter((m) => {
    const dia = ensureLocalTime(m.criado_em).isoLocal;
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.pac && !ctx.pacsDoTemplate(m.ficha_template_id).includes(f.pac)) return false;
    if (f.setor && m.setor !== f.setor) return false;
    if (f.turno && turnoDoDia(new Date(m.criado_em)) !== f.turno) return false;
    if (f.ficha && ctx.tipoDaFicha(m.ficha_template_id) !== f.ficha) return false;
    if (f.situacao && situacaoDe(m) !== f.situacao) return false;
    if (f.inspetor && m.user_id !== f.inspetor) return false;
    if (f.liberacao === "pendentes" && m.liberado_sif) return false;
    if (f.liberacao === "liberadas" && !m.liberado_sif) return false;
    return true;
  });
}
