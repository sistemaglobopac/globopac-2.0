import { cn } from "@/lib/utils";
import {
  formatarData,
  formatarDataHora,
  formatarHora,
  hashCurto,
  resumirAssinaturas,
  rotuloProgramacao,
} from "./regras";
import type { ItemRelatorio, Relatorio } from "./tipos";

/** "Escaldagem/Depenagem" não tem espaço onde quebrar e estoura a coluna: permite a quebra depois da barra. */
function permitirQuebra(texto: string): string {
  return texto.replace(/\//g, "/​");
}

const COR_RESULTADO = {
  NC: "text-red-700",
  NP: "text-blue-800",
  C: "text-green-700",
} as const;

function LinhaItem({ item }: { item: ItemRelatorio }) {
  return (
    <tr className="align-top">
      <td className="border border-slate-400 p-1.5">
        <p className="font-semibold">{item.anomalia}</p>
        {/* OS importadas não têm categoria/SS/constatação detalhada: só o que veio do relatório manual. */}
        {item.origem === "v2" && (
          <p className="text-[10px] text-slate-600">
            {item.categoria}
            {item.solicitacao_numero ? ` · SS ${String(item.solicitacao_numero).padStart(4, "0")}` : ""}
            {` · constatada em ${formatarDataHora(item.constatado_em)}`}
            {item.constatado_por ? ` por ${item.constatado_por}` : ""}
          </p>
        )}
        {item.local_detalhe && <p className="text-[10px] text-slate-600">Local: {item.local_detalhe}</p>}
        {item.observacao && <p className="text-[10px] italic text-slate-700">Obs. do inspetor: {item.observacao}</p>}
      </td>
      <td className="border border-slate-400 p-1.5">
        <p className="font-medium">{permitirQuebra(item.setor_area)}</p>
        <p className="text-[10px] text-slate-600 [overflow-wrap:anywhere]">CC {item.centro_custo_codigo}</p>
      </td>
      <td className="border border-slate-400 p-1.5">{item.acao_corretiva ?? "—"}</td>
      <td className="border border-slate-400 p-1.5">
        <p className="font-semibold">OS: {item.numero_os}</p>
        <p className="text-[10px]">Em: {formatarData(item.constatado_em)}</p>
        {item.programacao.map((p) => (
          <div key={p.sequencia} className="text-[10px]">
            <p>
              {rotuloProgramacao(p.sequencia)}: {formatarData(p.prazo)}
              {p.por && p.hash ? <span className="text-slate-600"> · {p.por} #{hashCurto(p.hash)}</span> : null}
            </p>
            {p.justificativa && <p className="italic text-slate-700">Motivo: {p.justificativa}</p>}
          </div>
        ))}
        {item.responsavel && <p className="text-[10px]">Resp.: {item.responsavel}</p>}
        {item.aprovada_por && (
          <p className="text-[10px] text-slate-600">
            SS aprovada por {item.aprovada_por} em {formatarData(item.aprovada_em)}
          </p>
        )}
      </td>
      <td className={cn("border border-slate-400 p-1.5 text-center text-base font-extrabold", COR_RESULTADO[item.resultado])}>
        {item.resultado}
        <p className="text-[10px] font-normal text-slate-600">prazo {formatarData(item.prazo_vigente)}</p>
      </td>
      <td className="border border-slate-400 p-1.5 text-center">
        <p>{formatarData(item.data_verificacao)}</p>
        <p className="text-[10px] text-slate-600">{formatarHora(item.hora_verificacao)}</p>
        <p className="text-[10px] text-slate-600">{item.inspetor}</p>
      </td>
    </tr>
  );
}

function CaixaAssinatura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded border border-slate-400 p-2">
      <p className="border-b border-slate-300 pb-1 text-[10px] font-bold uppercase tracking-wide">{titulo}</p>
      {children}
    </div>
  );
}

/** Relatório diário de não conformidades — BPF Estrutural. Layout do formulário usado até aqui
 * (anomalia, setor, ação corretiva, nº da OS com datas, C/NC/NP, data e hora), acrescido do
 * centro de custo, da SS de origem e das quatro assinaturas eletrônicas do dia. */
export function RelatorioBpf({ relatorio }: { relatorio: Relatorio }) {
  const resumo = resumirAssinaturas(relatorio.itens);

  return (
    <div id="relatorio-impressao" className="print-page print-compacto space-y-3 rounded-lg border bg-white p-4 text-[11px] text-black" data-testid="relatorio-bpf">
      <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>

      <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-black pb-2">
        <div>
          <h2 className="text-base font-extrabold uppercase">Relatório de não conformidades — BPF diário</h2>
          <p className="text-[11px] text-slate-700">BPF Estrutural · Manutenções diversas</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold">DATA: {formatarData(relatorio.data_referencia)}</p>
          <p className="text-[10px] text-slate-700">
            {relatorio.qtd_nc} não conforme(s) · {relatorio.qtd_np} no prazo · {relatorio.qtd_conformes} conforme(s) no dia
          </p>
        </div>
      </header>

      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
        <thead className="table-header-group">
          <tr className="bg-slate-200 text-left text-[10px] uppercase">
            <th className="border border-slate-400 p-1.5">Anomalia</th>
            <th className="border border-slate-400 p-1.5">Setor</th>
            <th className="border border-slate-400 p-1.5">Ação corretiva (PCM)</th>
            <th className="border border-slate-400 p-1.5">Nº O.S.</th>
            <th className="border border-slate-400 p-1.5 text-center">C, NC ou NP</th>
            <th className="border border-slate-400 p-1.5 text-center">Data / hora verif.</th>
          </tr>
        </thead>
        <tbody>
          {relatorio.itens.length === 0 && (
            <tr>
              <td colSpan={6} className="border border-slate-400 p-3 text-center text-slate-600">
                Nenhuma não conformidade em aberto neste dia.
              </td>
            </tr>
          )}
          {relatorio.itens.map((item) => (
            <LinhaItem key={item.numero_os} item={item} />
          ))}
        </tbody>
      </table>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Assinaturas">
        <CaixaAssinatura titulo="Inspetor de qualidade do dia — emissão">
          <p className="font-semibold">{relatorio.emitido_por_nome}</p>
          <p className="text-[10px]">Assinado em {formatarDataHora(relatorio.emitido_em)}</p>
          <p className="break-all font-mono text-[9px] text-slate-600">#{hashCurto(relatorio.hash_emissao)}</p>
        </CaixaAssinatura>

        <CaixaAssinatura titulo="Administrador — aprovação das solicitações">
          {resumo.administradores.length === 0 && <p className="text-[10px] text-slate-600">Sem solicitações aprovadas no sistema neste relatório.</p>}
          {resumo.administradores.map((a) => (
            <div key={a.nome}>
              <p className="font-semibold">{a.nome}</p>
              <ul className="text-[9px] text-slate-700">
                {a.solicitacoes.map((s, i) => (
                  <li key={`${s.numero}-${i}`}>
                    SS {s.numero ? String(s.numero).padStart(4, "0") : "—"} · {formatarDataHora(s.em)} · #{hashCurto(s.hash)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CaixaAssinatura>

        <CaixaAssinatura titulo="PCM — programação das OS">
          {resumo.pcm.length === 0 && <p className="text-[10px] text-slate-600">Sem programações assinadas no sistema neste relatório.</p>}
          {resumo.pcm.map((u) => (
            <div key={u.nome}>
              <p className="font-semibold">{u.nome}</p>
              <ul className="text-[9px] text-slate-700">
                {u.programacoes.map((p, i) => (
                  <li key={`${p.numeroOs}-${p.rotulo}-${i}`}>
                    OS {p.numeroOs} · {p.rotulo} · {formatarDataHora(p.em)} · #{hashCurto(p.hash)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CaixaAssinatura>

        <CaixaAssinatura titulo="Verificador — conferência do monitoramento">
          {relatorio.liberado_por_nome ? (
            <>
              <p className="font-semibold">{relatorio.liberado_por_nome}</p>
              <p className="text-[10px]">Assinado em {formatarDataHora(relatorio.liberado_em)}</p>
              <p className="break-all font-mono text-[9px] text-slate-600">#{hashCurto(relatorio.hash_liberacao)}</p>
            </>
          ) : (
            <p className="text-[10px] font-semibold text-amber-800">Aguardando conferência do Verificador</p>
          )}
        </CaixaAssinatura>
      </section>

      {resumo.semAprovacaoNoSistema > 0 && (
        <p className="text-[10px] text-slate-600">
          {resumo.semAprovacaoNoSistema} OS deste relatório foram importadas do relatório manual anterior e não têm, no sistema, a assinatura de aprovação do administrador; as programações importadas também não têm assinatura eletrônica.
        </p>
      )}
      <p className="doc-generated-by text-[9px] text-slate-500">
        Documento gerado pelo GloboPac. Os códigos (#) são os primeiros caracteres do SHA-256 de cada assinatura, calculado pelo servidor no momento do ato.
      </p>
    </div>
  );
}
