import { CODIGO_FICHA_BPF, PAC_BPF, type ItemRelatorio, type Ordem, type Programacao, type Relatorio, type ResultadoBpf, type Verificacao } from "./tipos";

const FUSO = "America/Manaus";

export const ROTULO_RESULTADO: Record<ResultadoBpf, string> = {
  C: "Conforme",
  NP: "No prazo",
  NC: "Não conforme",
};

/** Data de hoje (AAAA-MM-DD) no fuso de Manaus — o mesmo que o banco usa em bpf_hoje(). */
export function hojeManaus(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Instante em que o dia (AAAA-MM-DD) começa em Manaus (UTC-4, sem horário de verão). */
export function inicioDoDiaManausIso(dia: string): string {
  return `${dia}T00:00:00-04:00`;
}

/** DD/MM/AAAA a partir de uma data pura (AAAA-MM-DD) ou de um instante ISO (convertido p/ Manaus). */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return new Date(valor).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" });
}

/** Hora HH:MM a partir de "HH:MM:SS". */
export function formatarHora(hora: string | null | undefined): string {
  return hora ? hora.slice(0, 5) : "—";
}

/** Primeiros caracteres do hash, para exibir a assinatura sem ocupar a linha toda. */
export function hashCurto(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 10) : "—";
}

/** Dias inteiros de `de` até `ate` (ambos AAAA-MM-DD). Positivo quando `ate` é depois de `de`. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(Number(de.slice(0, 4)), Number(de.slice(5, 7)) - 1, Number(de.slice(8, 10)));
  const b = Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)) - 1, Number(ate.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/** Regra do monitoramento (espelha bpf_verificacoes_regras no banco): dentro do prazo (até o
 * dia do prazo, inclusive) o inspetor marca C, NP ou NC (NC quando a OS foi executada mas o
 * desvio não foi sanado); vencido, só C ou NC. */
export function resultadosPermitidos(prazoAtual: string, hoje: string): ResultadoBpf[] {
  return prazoAtual >= hoje ? ["C", "NP", "NC"] : ["C", "NC"];
}

export function situacaoPrazo(prazoAtual: string, hoje: string): { vencido: boolean; dias: number; texto: string } {
  const dias = diasEntre(hoje, prazoAtual);
  if (dias < 0) {
    const atraso = -dias;
    return { vencido: true, dias: atraso, texto: `Vencido há ${atraso} ${atraso === 1 ? "dia" : "dias"}` };
  }
  if (dias === 0) return { vencido: false, dias: 0, texto: "Vence hoje" };
  return { vencido: false, dias, texto: `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}` };
}

const ROMANOS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/** Quem aparece na linha de identificação da OS: o inspetor que abriu a SS. O "responsável" digitado pelo
 * PCM (que vem preenchido com o nome de quem programa) só vale nas OS sem SS (importadas). Já traz o " · " final. */
export function rotuloInspetorOuResp(ordem: Pick<Ordem, "constatado_por" | "responsavel">): string {
  if (ordem.constatado_por) return `Inspetor: ${ordem.constatado_por} · `;
  return ordem.responsavel ? `Resp.: ${ordem.responsavel} · ` : "";
}

/** "Prog" para a programação original; "Rep. I", "Rep. II"... para as reprogramações. */
export function rotuloProgramacao(sequencia: number): string {
  if (sequencia === 0) return "Prog";
  return `Rep. ${ROMANOS[sequencia] ?? sequencia}`;
}

export function ordenarProgramacoes<T extends Pick<Programacao, "sequencia">>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.sequencia - b.sequencia);
}

/** OS que o inspetor ainda precisa verificar hoje para poder emitir o relatório — espelha a
 * checagem de bpf_emitir_relatorio: já existiam antes do início do dia e não têm veredito. */
export function pendentesDeVerificacao(ordens: Ordem[], hoje: string): Ordem[] {
  const inicio = new Date(inicioDoDiaManausIso(hoje)).getTime();
  return ordens.filter(
    (o) =>
      o.status === "PROGRAMADA" &&
      new Date(o.criado_em).getTime() < inicio &&
      !o.verificacoes.some((v) => v.data_verificacao === hoje)
  );
}

/** OS que a tela de verificação diária lista: conforme o inspetor marca C, NP ou NC, a OS sai da lista. Ficam à vista
 * as ainda sem veredito hoje e as `retidas` (marcadas Não conforme que ainda aguardam a observação); `incluirVerificadas`
 * traz de volta as já marcadas, para corrigir um clique errado. */
export function ordensNaVerificacaoDiaria(
  ordens: Ordem[],
  hoje: string,
  opcoes: { centroId?: string; incluirVerificadas?: boolean; retidas?: ReadonlySet<string> } = {}
): Ordem[] {
  return ordens.filter(
    (o) =>
      (!opcoes.centroId || o.centro?.id === opcoes.centroId) &&
      (opcoes.incluirVerificadas ||
        opcoes.retidas?.has(o.id) ||
        !o.verificacoes.some((v) => v.data_verificacao === hoje))
  );
}

/** Instante da verificação (data + hora de Manaus, UTC-4). */
function instanteVerificacao(v: Pick<Verificacao, "data_verificacao" | "hora_verificacao">): number {
  return new Date(`${v.data_verificacao}T${v.hora_verificacao.slice(0, 8)}-04:00`).getTime();
}

/** Observação mais recente que o inspetor deixou na OS (em qualquer resultado e mesmo dentro do prazo):
 * o PCM precisa vê-la para providenciar a adequação. Espera `ordem.verificacoes` com o histórico
 * da OS (ver useOrdensProgramadas). Retorna a verificação que a contém ou null. */
export function ultimaObservacaoDoInspetor(ordem: Pick<Ordem, "verificacoes">): Verificacao | null {
  return (
    [...ordem.verificacoes]
      .filter((v) => (v.observacao ?? "").trim().length > 0)
      .sort((a, b) => instanteVerificacao(b) - instanteVerificacao(a))[0] ?? null
  );
}

/** OS com observação do inspetor que o PCM ainda precisa ler: OS ainda programada, cuja última observação do inspetor ainda não teve
 * ciência do PCM e é mais recente que a última programação/reprogramação (se o PCM já reprogramou depois dela, já tratou). Da
 * observação mais recente para a mais antiga. Espera `ordem.verificacoes` com o histórico da OS (ver useOrdensProgramadas). */
export interface ObservacaoParaPcm {
  ordem: Ordem;
  verificacao: Verificacao;
}

export function observacoesParaCienciaDoPcm(ordens: readonly Ordem[], cientes: ReadonlySet<string>): ObservacaoParaPcm[] {
  const lista: ObservacaoParaPcm[] = [];
  for (const ordem of ordens) {
    if (ordem.status !== "PROGRAMADA") continue;
    const verificacao = ultimaObservacaoDoInspetor(ordem);
    if (!verificacao || cientes.has(verificacao.id)) continue;
    const ultimaProgramacao = ordenarProgramacoes(ordem.programacoes).at(-1);
    if (ultimaProgramacao && new Date(ultimaProgramacao.criado_em).getTime() >= instanteVerificacao(verificacao)) continue;
    lista.push({ ordem, verificacao });
  }
  return lista.sort((a, b) => instanteVerificacao(b.verificacao) - instanteVerificacao(a.verificacao));
}

/** OS devolvida ao PCM: a última verificação do inspetor foi Não conforme e o PCM ainda não
 * reprogramou depois dela. Retorna essa verificação (com a observação do inspetor) ou null.
 * Espera `ordem.verificacoes` com o histórico da OS (ver useOrdensProgramadas). */
export function devolucaoAoPcm(ordem: Pick<Ordem, "status" | "verificacoes" | "programacoes">): Verificacao | null {
  if (ordem.status !== "PROGRAMADA") return null;
  const ultima = [...ordem.verificacoes].sort((a, b) => instanteVerificacao(b) - instanteVerificacao(a))[0];
  if (!ultima || ultima.resultado !== "NC") return null;
  const ultimaProgramacao = ordenarProgramacoes(ordem.programacoes).at(-1);
  if (ultimaProgramacao && new Date(ultimaProgramacao.criado_em).getTime() >= instanteVerificacao(ultima)) return null;
  return ultima;
}

/** Itens do relatório com as reprogramações feitas pelo PCM depois da emissão aplicadas: a OS marcada NC e reprogramada no
 * mesmo dia leva `reprogramada`, sem alterar os itens assinados que ficaram gravados. */
export function itensComReprogramacao(relatorio: Pick<Relatorio, "itens"> & { reprogramacoes_posteriores?: Relatorio["reprogramacoes_posteriores"] }): ItemRelatorio[] {
  const posteriores = new Map((relatorio.reprogramacoes_posteriores ?? []).map((r) => [r.numero_os, r.reprogramada]));
  return relatorio.itens.map((item) => {
    const depois = posteriores.get(item.numero_os);
    return depois && item.resultado === "NC" ? { ...item, reprogramada: depois } : item;
  });
}

export interface AssinaturaAdmin {
  nome: string;
  solicitacoes: { numero: number | null; em: string | null; hash: string | null }[];
}

export interface AssinaturaPcm {
  nome: string;
  programacoes: { numeroOs: string; rotulo: string; em: string; hash: string }[];
}

export interface ResumoAssinaturas {
  administradores: AssinaturaAdmin[];
  pcm: AssinaturaPcm[];
  /** OS do relatório sem assinatura de aprovação no sistema (importadas do relatório manual). */
  semAprovacaoNoSistema: number;
}

/** Quem assinou o quê nas OS do relatório do dia: administradores que aprovaram as SS e usuários
 * do PCM que programaram/reprogramaram. As assinaturas do inspetor (emissão) e do Verificador
 * (verificação) e do administrador (liberação ao SIF) são do relatório em si. Programações sem hash (importadas) não contam como
 * assinatura. */
export function resumirAssinaturas(itens: ItemRelatorio[]): ResumoAssinaturas {
  const admins = new Map<string, AssinaturaAdmin>();
  const pcm = new Map<string, AssinaturaPcm>();
  let semAprovacao = 0;

  for (const item of itens) {
    if (item.aprovada_por) {
      const a = admins.get(item.aprovada_por) ?? { nome: item.aprovada_por, solicitacoes: [] };
      a.solicitacoes.push({ numero: item.solicitacao_numero, em: item.aprovada_em, hash: item.aprovada_hash });
      admins.set(item.aprovada_por, a);
    } else {
      semAprovacao++;
    }
    for (const p of item.programacao) {
      if (!p.por || !p.hash) continue;
      const u = pcm.get(p.por) ?? { nome: p.por, programacoes: [] };
      u.programacoes.push({ numeroOs: item.numero_os, rotulo: rotuloProgramacao(p.sequencia), em: p.em, hash: p.hash });
      pcm.set(p.por, u);
    }
  }
  const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, "pt-BR");
  return { administradores: [...admins.values()].sort(porNome), pcm: [...pcm.values()].sort(porNome), semAprovacaoNoSistema: semAprovacao };
}

export type FiltroLiberacaoRelatorios = "pendentes" | "liberadas" | "todas";

/** Relatórios de OS que o Painel de Arquivo mostra para o filtro de liberação escolhido: os já verificados pelo Verificador
 * (aguardando a liberação ao SIF) e/ou os já liberados. Os emitidos ainda não verificados não chegam ao arquivo. */
export function relatoriosOsDoArquivo(
  relatorios: Relatorio[] | undefined,
  liberacao: FiltroLiberacaoRelatorios,
  filtros?: FiltrosRelatorioOs
): Relatorio[] {
  return (relatorios ?? []).filter((r) => {
    if (r.status === "emitido") return false;
    if (liberacao === "pendentes" && r.status !== "verificado") return false;
    if (liberacao === "liberadas" && r.status !== "liberado") return false;
    return !filtros || relatorioOsCasaFiltros(r, filtros);
  });
}

/** Recortes do Painel de Arquivo que valem para o relatório de OS (mesmos campos do painel; vazio = sem recorte). */
export interface FiltrosRelatorioOs {
  /** Dia inicial / final (YYYY-MM-DD), inclusive, contra a data de referência do relatório. */
  de: string;
  ate: string;
  /** O relatório de OS é do PAC 1. */
  pac: string;
  setor: string;
  turno: string;
  /** O relatório de OS é a ficha de código RAC 002/001. */
  ficha: string;
  situacao: string;
  /** user_id de quem emitiu o relatório. */
  inspetor: string;
}

/** O relatório de OS entra na busca do Painel de Arquivo? Data e PAC 1 são os recortes principais; setor, ficha, inspetor e situação
 * valem como nas demais fichas. Relatório diário não tem turno: escolher um turno o esconde. */
export function relatorioOsCasaFiltros(r: Pick<Relatorio, "data_referencia" | "setor" | "emitido_por" | "qtd_nc">, f: FiltrosRelatorioOs): boolean {
  if (f.de && r.data_referencia < f.de) return false;
  if (f.ate && r.data_referencia > f.ate) return false;
  if (f.pac && f.pac !== PAC_BPF) return false;
  if (f.setor && r.setor !== f.setor) return false;
  if (f.turno) return false;
  if (f.ficha && f.ficha !== CODIGO_FICHA_BPF) return false;
  if (f.inspetor && r.emitido_por !== f.inspetor) return false;
  if (f.situacao === "NAO_CONFORME" && r.qtd_nc === 0) return false;
  if (f.situacao === "CONFORME" && r.qtd_nc > 0) return false;
  if (f.situacao === "TRATADO") return false;
  return true;
}
