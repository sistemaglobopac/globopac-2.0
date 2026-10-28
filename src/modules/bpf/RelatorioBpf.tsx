import { cn } from "@/lib/utils";
import { RodapeAtestado } from "@/shared/relatorio/RodapeAtestado";
import { SeloAssinatura } from "@/shared/relatorio/SeloAssinatura";
import {
  formatarData,
  formatarDataHora,
  formatarHora,
  hashCurto,
  itensComReprogramacao,
  resumirAssinaturas,
  rotuloProgramacao,
} from "./regras";
import { CODIGO_FICHA_BPF, NOME_RELATORIO_BPF, PAC_BPF, type ItemRelatorio, type Relatorio, type RelatorioProvisorio } from "./tipos";

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
        {item.reprogramada && (
          <p className="text-[10px] font-semibold text-amber-800" data-testid={`nc-reprogramada-${item.numero_os}`}>
            Marcada Não conforme pelo inspetor e reprogramada pelo PCM em {formatarDataHora(item.reprogramada.em)} · novo prazo {formatarData(item.reprogramada.prazo)}
            {item.reprogramada.por ? ` (${item.reprogramada.por})` : ""}.
          </p>
        )}
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
        {/* Quem constatou é o inspetor que abriu a SS; o "responsável" digitado pelo PCM só aparece nas OS sem SS (importadas). */}
        {item.constatado_por ? (
          <p className="text-[10px]">Inspetor: {item.constatado_por}</p>
        ) : (
          item.responsavel && <p className="text-[10px]">Resp.: {item.responsavel}</p>
        )}
        {item.aprovada_por && (
          <p className="text-[10px] text-slate-600">
            SS aprovada por {item.aprovada_por} em {formatarData(item.aprovada_em)}
          </p>
        )}
      </td>
      <td className={cn("border border-slate-400 p-1.5 text-center text-base font-extrabold", item.reprogramada ? "text-amber-700" : COR_RESULTADO[item.resultado])}>
        {item.resultado}
        {item.reprogramada && <p className="text-[10px] font-bold uppercase">reprogramada</p>}
        <p className="text-[10px] font-normal text-slate-600">
          prazo {formatarData(item.reprogramada ? item.reprogramada.prazo : item.prazo_vigente)}
          {item.reprogramada ? ` (era ${formatarData(item.prazo_vigente)})` : ""}
        </p>
      </td>
      <td className="border border-slate-400 p-1.5 text-center">
        {item.sem_verificacao ? (
          <>
            <p className="font-semibold">Programada pelo PCM</p>
            <p className="text-[10px] text-slate-600">{formatarDataHora(item.programada_em)}</p>
            <p className="text-[10px] italic text-slate-600">ainda sem verificação do inspetor</p>
          </>
        ) : (
          <>
            <p>{formatarData(item.data_verificacao)}</p>
            <p className="text-[10px] text-slate-600">{formatarHora(item.hora_verificacao)}</p>
            <p className="text-[10px] text-slate-600">{item.inspetor}</p>
          </>
        )}
      </td>
    </tr>
  );
}

/** Espaço da assinatura que ainda não existe (ou que o relatório não tem): mesma moldura do selo. */
function SeloPendente({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink/30 bg-white p-3 print:p-2">
      <p className="mb-1 w-full border-b border-hairline pb-1 text-center text-[9px] font-bold uppercase tracking-tight text-muted-foreground print:pb-0.5 print:text-[8px]">
        {titulo}
      </p>
      <p className="mt-1 text-center text-[10px] font-semibold text-muted-foreground">{children}</p>
    </div>
  );
}

/** Relatório diário de não conformidades — BPF Estrutural. Layout do formulário usado até aqui
 * (anomalia, setor, ação corretiva, nº da OS com datas, C/NC/NP, data e hora), acrescido do
 * centro de custo, da SS de origem, dos selos das assinaturas eletrônicas do dia e do atestado de
 * validade jurídica — os mesmos dos relatórios de monitoramento. */
export function RelatorioBpf({ relatorio: dado }: { relatorio: Relatorio | RelatorioProvisorio }) {
  const provisorio = "provisorio" in dado && dado.provisorio === true ? dado : null;
  /** Relatório emitido (assinado); nulo no gerado na hora. */
  const relatorio = provisorio ? null : (dado as Relatorio);
  const itens = itensComReprogramacao(dado);
  const posteriores = dado.itens_posteriores ?? [];
  const resumo = resumirAssinaturas([...itens, ...posteriores]);
  const protocolo = relatorio ? `GS-${relatorio.data_referencia.replaceAll("-", "")}-${relatorio.id.split("-")[0]!.toUpperCase()}-BPF` : "";

  return (
    <div id="relatorio-impressao" className="print-page print-compacto space-y-3 rounded-lg border bg-white p-4 text-[11px] text-black" data-testid="relatorio-bpf">
      <style>{"@media print { @page { size: A4 landscape; margin: 8mm; } }"}</style>

      <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-black pb-2">
        <div>
          <h2 className="text-base font-extrabold uppercase">{NOME_RELATORIO_BPF}</h2>
          <p className="text-[11px] text-slate-700">
            <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 font-black tracking-wider" data-testid="codigo-ficha-bpf">
              {CODIGO_FICHA_BPF}
            </span>
            {PAC_BPF} · Relatório diário de não conformidades · BPF Estrutural · Manutenções diversas
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold">DATA: {formatarData(dado.data_referencia)}</p>
          <p className="text-[10px] text-slate-700">
            {dado.qtd_nc} não conforme(s) · {dado.qtd_np} no prazo · {dado.qtd_conformes} conforme(s) no dia
            {dado.qtd_nc_reprogramadas > 0 ? ` · ${dado.qtd_nc_reprogramadas} NC reprogramada(s) pelo PCM` : ""}
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
          {itens.length === 0 && posteriores.length === 0 && (
            <tr>
              <td colSpan={6} className="border border-slate-400 p-3 text-center text-slate-600">
                Nenhuma não conformidade em aberto neste dia.
              </td>
            </tr>
          )}
          {itens.map((item) => (
            <LinhaItem key={item.numero_os} item={item} />
          ))}
          {posteriores.length > 0 && (
            <tr>
              <td colSpan={6} className="border border-slate-400 bg-slate-100 p-1.5 text-[10px] font-bold uppercase" data-testid="separador-posteriores">
                OS programadas pelo PCM depois da emissão do relatório
              </td>
            </tr>
          )}
          {posteriores.map((item) => (
            <LinhaItem key={item.numero_os} item={item} />
          ))}
        </tbody>
      </table>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4" aria-label="Assinaturas">
        {relatorio ? (
          <SeloAssinatura
            titulo="Assinatura Eletrônica do Inspetor de Qualidade do dia — emissão"
            nome={relatorio.emitido_por_nome}
            dataHora={formatarDataHora(relatorio.emitido_em)}
            hash={relatorio.hash_emissao}
            integro={null}
          />
        ) : (
          <SeloPendente titulo="Inspetor de Qualidade do dia — emissão">
            <span className="text-amber-800">Dia ainda não encerrado pelo inspetor</span>
          </SeloPendente>
        )}

        {resumo.administradores.length === 0 && (
          <SeloPendente titulo="Administrador — aprovação das solicitações">Sem solicitações aprovadas no sistema neste relatório.</SeloPendente>
        )}
        {resumo.administradores.map((a) => {
          const ultima = a.solicitacoes.at(-1);
          return (
            <SeloAssinatura
              key={a.nome}
              titulo="Assinatura Eletrônica do Administrador — aprovação das solicitações"
              nome={a.nome}
              dataHora={formatarDataHora(ultima?.em)}
              hash={ultima?.hash}
              integro={null}
            />
          );
        })}

        {resumo.pcm.length === 0 && <SeloPendente titulo="PCM — programação das OS">Sem programações assinadas no sistema neste relatório.</SeloPendente>}
        {resumo.pcm.map((u) => {
          const ultima = u.programacoes.at(-1);
          return (
            <SeloAssinatura
              key={u.nome}
              titulo="Assinatura Eletrônica do PCM — programação das OS"
              nome={u.nome}
              dataHora={formatarDataHora(ultima?.em)}
              hash={ultima?.hash}
              integro={null}
            />
          );
        })}

        {relatorio?.verificado_por_nome ? (
          <SeloAssinatura
            titulo="Assinatura Eletrônica do Verificador — verificação do monitoramento"
            nome={relatorio.verificado_por_nome}
            dataHora={formatarDataHora(relatorio.verificado_em)}
            hash={relatorio.hash_verificacao}
            integro={null}
            corLabel="text-success"
          />
        ) : (
          <SeloPendente titulo="Verificador — verificação do monitoramento">
            <span className="text-amber-800">Aguardando verificação do Verificador</span>
          </SeloPendente>
        )}
      </section>

      {provisorio && (
        <p className="rounded border border-amber-500/50 bg-amber-50 p-2 text-[10px] font-semibold text-amber-900" data-testid="aviso-provisorio">
          Relatório gerado em {formatarDataHora(provisorio.gerado_em)} a partir dos registros do dia. Ainda não foi emitido e assinado pelo inspetor: não tem
          validade como documento assinado.
          {provisorio.sem_verificacao_pendentes > 0
            ? ` ${provisorio.sem_verificacao_pendentes} OS em aberto no dia ainda não foram verificadas pelo inspetor e não constam neste relatório.`
            : ""}
        </p>
      )}

      {posteriores.length > 0 && (
        <p className="text-[10px] text-slate-600">
          As OS listadas após a emissão foram programadas pelo PCM depois da assinatura do inspetor e entram como "no prazo", sem verificação do inspetor; a
          assinatura de emissão abrange apenas as OS anteriores a elas.
        </p>
      )}

      {resumo.semAprovacaoNoSistema > 0 && (
        <p className="text-[10px] text-slate-600">
          {resumo.semAprovacaoNoSistema} OS deste relatório foram importadas do relatório manual anterior e não têm, no sistema, a assinatura de aprovação do administrador; as programações importadas também não têm assinatura eletrônica.
        </p>
      )}

      {relatorio && (
        <RodapeAtestado
          objeto="relatório"
          protocolo={protocolo}
          hash={relatorio.hash_verificacao ?? relatorio.hash_emissao}
          integro={null}
          carimbo={
            <p className="mt-1">
              Emissão registrada em {formatarDataHora(relatorio.emitido_em)}
              {relatorio.verificado_em
                ? ` · verificação do Verificador em ${formatarDataHora(relatorio.verificado_em)}`
                : " · aguardando a verificação do Verificador"}
              {relatorio.liberado_em ? ` · liberação ao SIF em ${formatarDataHora(relatorio.liberado_em)}` : ""}
              .
            </p>
          }
          auditoria={
            <>
              <p>
                Os códigos (#) são os primeiros caracteres do SHA-256 de cada assinatura, calculado pelo servidor no momento do ato. Identificador único do
                documento:
              </p>
              <p className="mt-1 break-all rounded border border-hairline bg-gray-50 px-2 py-1 font-mono text-[10px] font-bold text-ink print:text-[8px]">{relatorio.id}</p>
            </>
          }
        />
      )}
    </div>
  );
}
