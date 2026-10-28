import type { ReactNode } from "react";
import { agruparPorEspecialidade, FILTRO_SEM_CLASSIFICACAO, FILTRO_TODAS } from "./especialidades";
import { formatarData, formatarDataHora, devolucaoAoPcm, hojeManaus, rotuloInspetorOuResp, rotuloProgramacao, situacaoPrazo, ultimaObservacaoDoInspetor } from "./regras";
import type { Ordem, Solicitacao } from "./tipos";

/** Folha de impressão do PCM: fica oculta na tela e é a única coisa impressa (o CSS de impressão do app mostra só
 * #relatorio-impressao — ver index.css). Sem filtro de especialidade, cada especialidade sai numa página própria, para
 * entregar a cada equipe só o que é dela; com filtro, sai só a especialidade escolhida. */
function FolhaLista<T extends { especialidade: string | null }>({
  titulo,
  filtro,
  especialidade = FILTRO_TODAS,
  itens,
  colunas,
  linha,
}: {
  titulo: string;
  filtro?: string;
  /** Filtro de especialidade aplicado à lista (já refletido em `itens`). */
  especialidade?: string;
  itens: T[];
  colunas: string[];
  linha: (item: T) => ReactNode;
}) {
  const emitidaEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" });
  const separar = especialidade === FILTRO_TODAS;
  const grupos = separar ? agruparPorEspecialidade(itens) : [{ rotulo: null, itens }];
  const rotuloFiltro = especialidade === FILTRO_SEM_CLASSIFICACAO ? "sem classificação" : especialidade;
  return (
    <div id="relatorio-impressao" className="hidden bg-white p-4 text-[11px] text-black print:block" data-testid="lista-impressa-pcm">
      {(grupos.length === 0 ? [{ rotulo: null, itens: [] as T[] }] : grupos).map((grupo, indice) => (
        <section key={grupo.rotulo ?? "unica"} className={`space-y-3 ${indice > 0 ? "quebra-pagina" : ""}`} data-testid="folha-especialidade">
          <header className="border-b border-slate-400 pb-2">
            <h1 className="text-base font-bold uppercase">
              {titulo}
              {grupo.rotulo ? ` — ${grupo.rotulo}` : !separar ? ` — ${rotuloFiltro}` : ""}
            </h1>
            <p className="text-[10px] text-slate-700">
              PCM — Planejamento e Controle da Manutenção · emitida em {emitidaEm} · {grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}
              {filtro ? ` · filtro: “${filtro}”` : ""}
            </p>
          </header>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-100 text-left uppercase">
                {colunas.map((c) => (
                  <th key={c} className="border border-slate-400 p-1.5">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{grupo.itens.map(linha)}</tbody>
          </table>
          {grupo.itens.length === 0 && <p className="text-center text-slate-600">Nenhum item na lista.</p>}
        </section>
      ))}
    </div>
  );
}

const CELULA = "border border-slate-400 p-1.5 align-top";

/** Lista das solicitações aprovadas que aguardam programação do PCM. */
export function ListaImpressaAProgramar({ solicitacoes, especialidade }: { solicitacoes: Solicitacao[]; especialidade?: string }) {
  return (
    <FolhaLista
      titulo="Lista de OS a programar"
      especialidade={especialidade}
      itens={solicitacoes}
      colunas={["SS", "Centro de custo", "Categoria", "Descrição / local", "Constatada em", "Aprovada por"]}
      linha={(ss) => (
        <tr key={ss.id}>
          <td className={CELULA}>{String(ss.numero).padStart(4, "0")}</td>
          <td className={CELULA}>{ss.centro?.nome ?? "—"}</td>
          <td className={CELULA}>{ss.categoria}</td>
          <td className={CELULA}>
            <p className="font-semibold">{ss.descricao}</p>
            {ss.local_detalhe && <p className="text-slate-600">Local: {ss.local_detalhe}</p>}
          </td>
          <td className={CELULA}>
            {formatarDataHora(ss.constatado_em)}
            <p className="text-slate-600">{ss.aberta_por_nome}</p>
          </td>
          <td className={CELULA}>
            {ss.aprovada_por_nome ?? "—"}
            {ss.aprovada_em && <p className="text-slate-600">{formatarDataHora(ss.aprovada_em)}</p>}
          </td>
        </tr>
      )}
    />
  );
}

function ProgramacoesDaOs({ ordem }: { ordem: Ordem }) {
  return (
    <ul>
      {ordem.programacoes.map((p) => (
        <li key={p.sequencia}>
          <span className="font-semibold">{rotuloProgramacao(p.sequencia)}</span> {formatarData(p.prazo)}
          {p.justificativa ? <span className="text-slate-600"> — {p.justificativa}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function DescricaoDaOs({ ordem }: { ordem: Ordem }) {
  return (
    <>
      <p className="font-semibold">{ordem.descricao}</p>
      <p className="text-slate-600">
        {ordem.acao_corretiva ? `Ação: ${ordem.acao_corretiva} · ` : ""}
        {rotuloInspetorOuResp(ordem)}Constatada em {formatarData(ordem.constatado_em)}
      </p>
    </>
  );
}

/** Lista das OS marcadas como não conformes pelo inspetor e devolvidas ao PCM para reprogramar e justificar. */
export function ListaImpressaDevolvidas({ ordens, especialidade }: { ordens: Ordem[]; especialidade?: string }) {
  return (
    <FolhaLista
      titulo="Lista de OS devolvidas pelo inspetor"
      especialidade={especialidade}
      itens={ordens}
      colunas={["OS", "Centro de custo", "Descrição / ação", "Programação", "Não conforme em", "Observação do inspetor"]}
      linha={(o) => {
        const devolucao = devolucaoAoPcm(o);
        return (
          <tr key={o.id}>
            <td className={CELULA}>{o.numero_os}</td>
            <td className={CELULA}>{o.centro?.nome ?? "—"}</td>
            <td className={CELULA}>
              <DescricaoDaOs ordem={o} />
            </td>
            <td className={CELULA}>
              <ProgramacoesDaOs ordem={o} />
            </td>
            <td className={CELULA}>
              {devolucao ? formatarData(devolucao.data_verificacao) : "—"}
              {devolucao && <p className="text-slate-600">{devolucao.inspetor_nome}</p>}
            </td>
            <td className={CELULA}>{devolucao?.observacao ?? "—"}</td>
          </tr>
        );
      }}
    />
  );
}

/** Lista das OS programadas (com o filtro de busca da tela, quando houver). */
export function ListaImpressaProgramadas({ ordens, filtro, especialidade }: { ordens: Ordem[]; filtro?: string; especialidade?: string }) {
  const hoje = hojeManaus();
  return (
    <FolhaLista
      titulo="Lista de OS programadas"
      filtro={filtro}
      especialidade={especialidade}
      itens={ordens}
      colunas={["OS", "Centro de custo", "Descrição / ação", "Programação", "Prazo atual", "Situação"]}
      linha={(o) => {
        const prazo = situacaoPrazo(o.prazo_atual, hoje);
        return (
          <tr key={o.id}>
            <td className={CELULA}>{o.numero_os}</td>
            <td className={CELULA}>{o.centro?.nome ?? "—"}</td>
            <td className={CELULA}>
              <DescricaoDaOs ordem={o} />
            </td>
            <td className={CELULA}>
              <ProgramacoesDaOs ordem={o} />
            </td>
            <td className={CELULA}>{formatarData(o.prazo_atual)}</td>
            <td className={CELULA}>
              <span className={prazo.vencido ? "font-semibold text-red-700" : ""}>{prazo.texto}</span>
              {devolucaoAoPcm(o) && <p className="text-red-700">Devolvida pelo inspetor</p>}
              {ultimaObservacaoDoInspetor(o)?.observacao && (
                <p className="font-semibold">Obs. do inspetor: {ultimaObservacaoDoInspetor(o)?.observacao}</p>
              )}
            </td>
          </tr>
        );
      }}
    />
  );
}
