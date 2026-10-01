// Relatório oficial de monitoramento — equivalente a DocumentDossier.jsx do v1, com paleta
// navy/lima do design system atual (não o roxo do v1) e conteúdo adaptado ao modelo de dados
// real de v2: schema_campos como fonte de ordem/tipo dos campos (em vez das heurísticas de
// regex do v1), não-conformidade resolvida via RNC vinculada (não um objeto `capa` embutido em
// dados_dinamicos, que não existe neste sistema), e hash/assinatura no formato de
// conteudoAssinavelMonitoramento (v2), não o de v1.
import { useEffect, useState } from "react";
import { camposNaoConformes, type CampoNaoConforme } from "../../utils/desviosEspeciais";
import { CheckCircle2, AlertTriangle, Clock, Scale, Search, Shield } from "lucide-react";
import { turnoDoDia } from "@/modules/bordo/api";
import type { AssinaturaRelatorio, DadosRelatorio, MonitoramentoRelatorio, TemplateRelatorio } from "../../api";
import type { Rnc } from "@/modules/rnc/api";
import { ensureLocalTime } from "../../utils/tempo";
import { computarHashMonitoramento, resumoHash } from "../../utils/hashDocumento";
import { DadosColetados } from "../DadosColetadosFicha";

// Razão social/SIF fixos — mesma planta/cliente do v1, só trocou de sistema (confirmado com o
// usuário). Não há hoje um app_config para isso; se um dia mudar, esse é o único lugar a tocar.
const RAZAO_SOCIAL = "KAEFER AGRO INDUSTRIAL LTDA. - SIF1606";

const ADENDO_STATUS_ROTULO: Record<string, string> = {
  pending_monitor: "Aguardando assinatura do inspetor",
  completed: "Concluído",
};

interface AdendoBruto {
  id: string;
  status: "pending_monitor" | "completed";
  notes: string;
  verificadorName: string;
  corrections: Record<string, { old: unknown; new: unknown }>;
  criadoEm?: string;
  timestamp?: string;
  monitorSignedAt?: string;
}

function SeloAssinatura({
  titulo,
  nome,
  dataHora,
  hash,
  integro,
  corLabel = "text-primary",
}: {
  titulo: string;
  nome: string;
  dataHora: string;
  hash: string | null | undefined;
  integro: boolean | null;
  corLabel?: string;
}) {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-ink/70 bg-white p-3 print:p-2">
      {/* Marca d'água da logo a 10% de opacidade (90% de transparência, a pedido do usuário) —
          mesma ideia do selo de assinatura do v1, atrás do conteúdo, sem interferir na leitura. */}
      <div className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center" style={{ opacity: 0.1 }}>
        <img src="/logo-globopac.png" alt="" className="max-h-[85%] max-w-[85%] object-contain" />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center">
        <p className="mb-1 w-full border-b border-hairline pb-1 text-center text-[9px] font-bold uppercase tracking-tight text-muted-foreground print:pb-0.5 print:text-[8px]">
          {titulo}
        </p>
        <p className="mt-1 max-w-full truncate text-sm font-bold text-ink print:text-[9px]">{nome}</p>
        <p className="mt-1 font-mono text-xs font-bold text-muted-foreground print:text-[8px]">{dataHora}</p>
        <p className={`mt-1 text-[10px] font-black uppercase print:text-[8px] ${corLabel}`}>SISTEMA GLOBOPAC</p>
        <p className="mt-0.5 font-mono text-[8px] leading-tight text-muted-foreground print:text-[7px]">
          SHA-256: {resumoHash(hash, 20) ?? "—"}
          {integro !== null && (integro ? " · ÍNTEGRO" : " · VERIFIQUE")}
        </p>
        <p className="text-[7px] leading-none text-muted-foreground">LEI 14.063/2020 · Art. 4º §2º</p>
      </div>
    </div>
  );
}

function BlocoRnc({ rnc, nomesPorId, camposNc }: { rnc: Rnc; nomesPorId: Map<string, string>; camposNc: CampoNaoConforme[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border-2 border-down/40 print:mt-2">
      <div className="flex items-center gap-2 border-b-2 border-down/30 bg-down-soft p-3 text-sm font-bold uppercase tracking-wider text-down print:p-2 print:text-[10px]">
        <AlertTriangle className="h-4 w-4 print:h-3 print:w-3" /> Tratativa de não conformidades deste monitoramento — RNC ({rnc.severidade})
      </div>
      <div className="grid grid-cols-1 gap-3 bg-white p-4 text-sm sm:grid-cols-2 print:gap-2 print:p-3 print:text-[9px]">
        <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2" data-testid="rnc-referencia">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Refere-se aos campos</span>
          {camposNc.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 font-medium text-ink">
              {camposNc.map((c) => (
                <li key={c.rotulo}>
                  <strong>{c.rotulo}</strong> — {c.detalhe}
                </li>
              ))}
            </ul>
          ) : (
            <span className="font-medium text-muted-foreground">Nenhum campo apontado automaticamente no preenchimento — ver a descrição abaixo.</span>
          )}
        </div>
        <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Descrição da não conformidade</span>
          <span className="whitespace-pre-line font-medium text-ink">{rnc.descricao}</span>
        </div>
        <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2" data-testid="rnc-acao-imediata">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Ação imediata tomada pelo inspetor</span>
          <span className="whitespace-pre-line font-medium text-ink">{rnc.acao_imediata || "Não informada (RNC anterior a este registro)."}</span>
        </div>
        {rnc.causa_desvio && (
          <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2">
            <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Causa do desvio</span>
            <span className="font-medium text-ink">{rnc.causa_desvio}</span>
          </div>
        )}
        {rnc.tratativa && (
          <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2">
            <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Ação corretiva</span>
            <span className="font-medium text-ink">{rnc.tratativa}</span>
          </div>
        )}
        {rnc.tratado_por && (
          <div>
            <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Tratado por</span>
            <span className="font-medium text-ink">{nomesPorId.get(rnc.tratado_por) ?? "—"}</span>
          </div>
        )}
        {rnc.fechado_em && (
          <div>
            <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Fechada em</span>
            <span className="font-medium text-ink">{new Date(rnc.fechado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}</span>
          </div>
        )}
        {rnc.assinatura_gestor_hash && (
          <div className="sm:col-span-2" data-testid="rnc-assinatura-gestor">
            <SeloAssinatura
              titulo="Assinatura Eletrônica do Gestor de Setor — resposta da RNC"
              nome={nomesPorId.get(rnc.assinatura_gestor_por ?? "") ?? (rnc.tratado_por ? nomesPorId.get(rnc.tratado_por) : undefined) ?? "Gestor de Setor"}
              dataHora={rnc.assinatura_gestor_em ? new Date(rnc.assinatura_gestor_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" }) : "—"}
              hash={rnc.assinatura_gestor_hash}
              integro={null}
            />
          </div>
        )}
        {/* Status por último: é o desfecho da tratativa (após causa, ação corretiva, tratado por e fechamento). */}
        <div className="rounded border border-hairline bg-gray-50 p-2 sm:col-span-2" data-testid="rnc-status">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Status</span>
          <span className="font-medium text-ink">{rnc.status}</span>
        </div>
      </div>
    </div>
  );
}

function BlocoAdendos({ adendos }: { adendos: AdendoBruto[] }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border-2 border-warning/40 print:mt-2">
      <div className="flex items-center gap-2 border-b-2 border-warning/30 bg-warning/10 p-3 text-sm font-bold uppercase tracking-wider text-warning-foreground print:p-2 print:text-[10px]">
        <AlertTriangle className="h-4 w-4 print:h-3 print:w-3" /> Adendos / Correções Complementares
      </div>
      <div className="flex flex-col gap-3 bg-white p-4 print:gap-2 print:p-3">
        {adendos.map((ad, i) => (
          <div key={ad.id ?? i} className="rounded border border-hairline bg-gray-50 p-3 text-xs print:p-2 print:text-[9px]">
            <div className="mb-2 flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-[10px] font-bold uppercase text-ink print:text-[8px]">Aberto por {ad.verificadorName}</span>
              <span className="font-mono text-[10px] text-muted-foreground print:text-[7px]">
                {(ad.timestamp ?? ad.criadoEm) ? new Date((ad.timestamp ?? ad.criadoEm)!).toLocaleString("pt-BR", { timeZone: "America/Manaus" }) : "—"}
              </span>
            </div>
            <p className="italic text-ink">{ad.notes}</p>
            {ad.corrections && Object.keys(ad.corrections).length > 0 && (
              <div className="mt-2 rounded border border-hairline bg-white p-2">
                {Object.entries(ad.corrections).map(([campo, correcao]) => (
                  <div key={campo} className="flex items-center gap-2 border-b border-hairline/60 py-1 text-[10px] print:text-[8px]">
                    <span className="font-bold capitalize text-muted-foreground">{campo.replace(/_/g, " ")}:</span>
                    <span className="text-down line-through">{String(correcao.old)}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-bold text-success">{String(correcao.new)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className={`mt-2 border-t border-hairline pt-2 text-[10px] font-bold print:text-[8px] ${ad.status === "completed" ? "text-success" : "text-warning-foreground"}`}>
              {ADENDO_STATUS_ROTULO[ad.status] ?? ad.status}
              {ad.monitorSignedAt && ` em ${new Date(ad.monitorSignedAt).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function assinaturaDe(assinaturas: AssinaturaRelatorio[], monitoramentoId: string, tipo: AssinaturaRelatorio["tipo"]) {
  return assinaturas.find((a) => a.monitoramento_id === monitoramentoId && a.tipo === tipo);
}

interface RegistroUnicoProps {
  record: MonitoramentoRelatorio;
  ordem: number | null;
  template: TemplateRelatorio | undefined;
  dados: DadosRelatorio;
  hashesAoVivo: Map<string, string>;
}

type SituacaoRegistro = "conforme" | "tratado" | "nao-conforme" | "desvio-pendente" | "aguardando";

/** `conformidade` da coluna só é preenchida quando o Verificador decide (verificar-monitoramento);
 * antes disso é `null` — NÃO é "não conforme". Enquanto pendente, mostra "Aguardando verificação"
 * (ou "Desvio detectado" se algum widget do próprio registro apontou desvio). */
function situacaoDoRegistro(record: MonitoramentoRelatorio, rnc?: Rnc): SituacaoRegistro {
  // RNC procedente (fechada pelo Verificador): o monitoramento não fica "não conforme", fica TRATADO.
  if (rnc?.status === "FECHADA" && record.conformidade !== true) return "tratado";
  if (record.conformidade === true) return "conforme";
  if (record.conformidade === false) return "nao-conforme";
  const temDesvio = Object.values(record.dados_dinamicos).some(
    (v) => v && typeof v === "object" && ((v as { conformidade?: unknown }).conformidade === false || (v as { status?: unknown }).status === "nao-conforme")
  );
  return temDesvio ? "desvio-pendente" : "aguardando";
}

const ROTULO_SELO: Record<SituacaoRegistro, string> = {
  conforme: "Conforme",
  tratado: "Tratado — RNC procedente e fechada",
  "nao-conforme": "Não Conforme",
  "desvio-pendente": "Desvio detectado — aguardando verificação",
  aguardando: "Aguardando verificação",
};
const CLASSE_SELO: Record<SituacaoRegistro, string> = {
  conforme: "text-success",
  tratado: "text-success",
  "nao-conforme": "text-down",
  "desvio-pendente": "text-warning-foreground",
  aguardando: "text-muted-foreground",
};

function RegistroUnico({ record, ordem, template, dados, hashesAoVivo }: RegistroUnicoProps) {
  const inspetorAssinatura = assinaturaDe(dados.assinaturas, record.id, "INSPETOR");
  const verificadorAssinatura = assinaturaDe(dados.assinaturas, record.id, "VERIFICADOR");
  const hashReferencia = verificadorAssinatura?.hash_documento ?? inspetorAssinatura?.hash_documento;
  const hashAoVivo = hashesAoVivo.get(record.id);
  const integro = hashReferencia && hashAoVivo ? hashReferencia === hashAoVivo : null;
  const rnc = dados.rncs.find((r) => r.monitoramento_id === record.id);
  const adendos = (record.dados_dinamicos.adendos as AdendoBruto[] | undefined) ?? [];
  const { time } = ensureLocalTime(record.criado_em);
  // Campos "hora" (ex.: "Hora do Monitoramento") já aparecem no cabeçalho deste bloco
  // ("Monitoramento N — HH:MM") — listá-los de novo em Dados Coletados é redundante e pode
  // divergir do horário real de criação do registro (o campo é digitado/editável pelo
  // inspetor; o cabeçalho usa `criado_em`, o horário de fato gravado no servidor).
  const camposSemHora = (template?.schema_campos ?? []).filter((campo) => campo.tipo !== "hora");

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.02] p-4 print:break-inside-avoid print:p-2">
      <div className="mb-3 flex items-center justify-between border-b border-dashed border-primary/25 pb-2">
        <span className="text-xs font-black uppercase tracking-wider text-primary print:text-[9px]">
          {template?.nome ?? "Ficha de Monitoramento"}
          {ordem ? ` · Apuração ${ordem}` : ""} — {time}
        </span>
        <span className={`text-right text-[10px] font-black uppercase tracking-wider print:text-[8px] ${CLASSE_SELO[situacaoDoRegistro(record, rnc)]}`}>
          {ROTULO_SELO[situacaoDoRegistro(record, rnc)]}
        </span>
      </div>

      <DadosColetados dadosDinamicos={record.dados_dinamicos} campos={camposSemHora} registro={{ criado_em: record.criado_em, finalizado_em: record.finalizado_em, assinado_em: inspetorAssinatura?.criado_em }} />

      {rnc && (
        <BlocoRnc
          rnc={rnc}
          nomesPorId={dados.nomesPorId}
          camposNc={camposNaoConformes(template?.schema_campos ?? [], record.dados_dinamicos)}
        />
      )}
      {adendos.length > 0 && <BlocoAdendos adendos={adendos} />}
      {record.aditivo_de && (
        <p className="mt-2 text-[10px] italic text-muted-foreground print:text-[8px]">
          Este registro é um aditivo (correção) do apontamento original — id {record.aditivo_de.slice(0, 8).toUpperCase()}.
        </p>
      )}
      {record.origem_versao === "v1_legado" && (
        <p className="mt-2 text-[10px] italic text-muted-foreground print:text-[8px]">
          Registro migrado do sistema anterior — hash/carimbo de tempo originais preservados, não recomputados sob as regras deste sistema.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-primary/25 pt-3 sm:flex-row print:gap-2">
        <SeloAssinatura
          titulo="Assinatura Eletrônica do Inspetor de Qualidade"
          nome={dados.nomesPorId.get(record.user_id) ?? "Usuário do Sistema"}
          dataHora={new Date(record.criado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
          hash={inspetorAssinatura?.hash_documento ?? hashAoVivo}
          integro={inspetorAssinatura ? integro : null}
        />
        {verificadorAssinatura && (
          <SeloAssinatura
            titulo="Assinatura Eletrônica do Verificador"
            nome={dados.nomesPorId.get(verificadorAssinatura.user_id) ?? "Verificador"}
            dataHora={new Date(verificadorAssinatura.criado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
            hash={verificadorAssinatura.hash_documento}
            integro={integro}
            corLabel="text-success"
          />
        )}
      </div>
    </div>
  );
}

export interface RelatorioMonitoramentoProps {
  ids: string[];
  dados: DadosRelatorio;
}

/** Relatório oficial — um único registro OU um dossiê consolidado (vários `ids` do mesmo
 * grupo: mesmo inspetor/dia/turno/PAC/setor, ver DossieVerificacaoCard). Renderizado dentro de
 * #relatorio-impressao pelo RelatorioModal, que é o que de fato vira a página impressa. */
export function RelatorioMonitoramento({ ids, dados }: RelatorioMonitoramentoProps) {
  // Sempre em ordem cronológica: "Apuração 1" é o 1º monitoramento do dia, independentemente da
  // ordem em que os ids chegaram na URL.
  const records = ids
    .map((id) => dados.monitoramentos.find((m) => m.id === id))
    .filter((m): m is MonitoramentoRelatorio => Boolean(m))
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  const isGrouped = records.length > 1;
  const primary = records[0];

  const [hashesAoVivo, setHashesAoVivo] = useState<Map<string, string>>(new Map());
  const idsKey = records.map((r) => r.id).join(",");
  useEffect(() => {
    let cancelado = false;
    Promise.all(records.map(async (r) => [r.id, await computarHashMonitoramento(r)] as const)).then((pares) => {
      if (cancelado) return;
      setHashesAoVivo(new Map(pares));
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (!primary) return null;

  const template = dados.templatesPorId.get(primary.ficha_template_id);
  const diaDocumento = ensureLocalTime(primary.criado_em).datePt;
  const hashId = primary.id.split("-")[0]!.toUpperCase();
  const protocolo = `GS-${diaDocumento.split("/").reverse().join("")}-${hashId}${isGrouped ? "-CONSOLIDADO" : ""}`;
  const emitidoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" });

  const assinaturaPrimario =
    assinaturaDe(dados.assinaturas, primary.id, "VERIFICADOR") ?? assinaturaDe(dados.assinaturas, primary.id, "INSPETOR");
  const hashPrimario = assinaturaPrimario?.hash_documento ?? hashesAoVivo.get(primary.id);
  const hashAoVivoPrimario = hashesAoVivo.get(primary.id);
  const integroPrimario = assinaturaPrimario?.hash_documento && hashAoVivoPrimario ? assinaturaPrimario.hash_documento === hashAoVivoPrimario : null;

  const rncDe = (r: MonitoramentoRelatorio) => dados.rncs.find((rnc) => rnc.monitoramento_id === r.id);
  const situacoes = records.map((r) => situacaoDoRegistro(r, rncDe(r)));
  // "Tratado" (RNC procedente fechada) conta como resolvido: o documento não fica não conforme.
  const todasConformes = situacoes.every((s) => s === "conforme" || s === "tratado");
  const houveTratado = situacoes.includes("tratado");
  // Nenhum registro reprovado, mas ainda há decisão do Verificador pendente (conformidade null).
  const aguardando = !todasConformes && records.every((r) => r.conformidade !== false);
  const desvioPendente = aguardando && situacoes.includes("desvio-pendente");
  const rncsDoGrupo = records
    .filter((r) => r.conformidade === false)
    .map((r) => dados.rncs.find((rnc) => rnc.monitoramento_id === r.id))
    .filter((r): r is Rnc => Boolean(r));
  const todasTratadas = rncsDoGrupo.length > 0 && rncsDoGrupo.every((r) => r.status === "FECHADA");

  const turnos = [...new Set(records.map((r) => turnoDoDia(new Date(r.criado_em))))];
  const horarios = records.map((r) => ensureLocalTime(r.criado_em).time).sort();
  const horarioDocumento = horarios.length <= 1 ? horarios[0] ?? "—" : `${horarios[0]}–${horarios[horarios.length - 1]}`;

  return (
    <div className={`print-page mx-auto flex w-full max-w-4xl flex-col bg-white font-sans text-ink shadow-2xl print:max-w-[210mm] ${isGrouped ? "" : "print-fit-one-page"}`} style={{ margin: "0 auto" }}>
      {/* Cabeçalho — identificação no topo, título da ficha e uma grade de metadados rotulados
          (antes eram chips soltos + uma seção "Dados Gerais" separada, que repetia data/turno). */}
      <div className="w-full rounded-t-lg bg-surface-dark p-6 text-ondark print:p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Shield className="h-9 w-9 shrink-0 opacity-80 print:h-7 print:w-7" />
            <div className="min-w-0">
              <p className="text-lg font-black leading-tight tracking-wide print:text-sm">{RAZAO_SOCIAL}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-widest opacity-80 print:text-[8px]">
                Sistema de Gestão de Qualidade — Relatório Oficial{isGrouped ? " Consolidado" : ""}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-ondark/20 bg-ondark/10 px-3 py-2 text-right print:px-2 print:py-1">
            <p className="text-[9px] uppercase tracking-widest opacity-80 print:text-[7px]">Protocolo</p>
            <p className="font-mono text-base font-black tracking-wider print:text-[11px]">{protocolo}</p>
            <p className="mt-0.5 text-[10px] opacity-80 print:text-[8px]">Emitido em {emitidoEm}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ondark/20 pt-3 print:mt-2 print:pt-2">
          <h1 className="min-w-0 text-lg font-extrabold leading-snug print:text-sm">{template?.nome ?? "Ficha de Monitoramento"}</h1>
          {template?.codigo && (
            <span className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime print:text-[9px]">{template.codigo}</span>
          )}
          {isGrouped && (
            <span className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime print:text-[9px]">
              {records.length} APURAÇÕES NO DIA
            </span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-ondark/20 bg-ondark/20 sm:grid-cols-3 print:mt-2 print:grid-cols-3">
          {[
            ["Setor", primary.setor.toUpperCase()],
            ["PAC", template?.pac_correspondente ?? "PAC não definido"],
            ["Data", diaDocumento],
            ["Horário", horarioDocumento],
            ["Turno", turnos.length === 1 ? turnos[0] : "Múltiplos Turnos"],
            ["Status", isGrouped ? `Concluído · ${records.length} apurações` : "Concluído · Assinado digitalmente"],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0 bg-surface-dark px-3 py-1.5 print:px-2 print:py-1">
              <dt className="text-[9px] font-bold uppercase tracking-widest opacity-70 print:text-[7px]">{rotulo}</dt>
              <dd className="truncate text-sm font-bold print:text-[10px]">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Banner de conformidade */}
      <div
        className={`flex w-full flex-col items-start justify-between gap-2 border-b-[3px] px-6 py-3 sm:flex-row sm:items-center print:flex-row print:px-4 print:py-2 ${
          todasConformes
            ? "border-success bg-success/5"
            : aguardando
              ? desvioPendente
                ? "border-warning bg-warning/5"
                : "border-hairline bg-muted/40"
              : todasTratadas
                ? "border-warning bg-warning/5"
                : "border-down bg-down-soft"
        }`}
      >
        <div className="flex items-center gap-3">
          {todasConformes ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className={`h-4 w-4 ${aguardando ? (desvioPendente ? "text-warning-foreground" : "text-muted-foreground") : todasTratadas ? "text-warning-foreground" : "text-down"}`} />
          )}
          <span
            className={`text-sm font-extrabold print:text-xs ${
              todasConformes ? "text-success" : aguardando ? (desvioPendente ? "text-warning-foreground" : "text-muted-foreground") : todasTratadas ? "text-warning-foreground" : "text-down"
            }`}
          >
            {todasConformes
              ? houveTratado
                ? "TRATADO — Desvio identificado, RNC procedente e fechada"
                : "CONFORME — Todos os Pontos dentro dos Padrões"
              : aguardando
                ? desvioPendente
                  ? "AGUARDANDO VERIFICAÇÃO — Desvio detectado no preenchimento"
                  : "AGUARDANDO VERIFICAÇÃO"
                : todasTratadas
                  ? "TRATADA — Desvio Identificado e Resolvido"
                  : "NÃO CONFORME — Contém Desvios Identificados"}
          </span>
        </div>
        <div className={`flex items-center gap-2 text-sm font-bold print:text-[10px] ${todasConformes ? "text-success" : aguardando ? "text-muted-foreground" : "text-down"}`}>
          <Shield className="h-3.5 w-3.5" />
          {isGrouped ? (
            <>{records.length} REGISTROS · <span className="font-mono">{hashId}</span></>
          ) : (
            <>SHA-256: <span className="font-mono">{resumoHash(assinaturaDe(dados.assinaturas, primary.id, "VERIFICADOR")?.hash_documento ?? assinaturaDe(dados.assinaturas, primary.id, "INSPETOR")?.hash_documento ?? hashesAoVivo.get(primary.id), 12) ?? hashId}</span></>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white p-8 print:flex-none print:p-3">
        {/* Dados coletados em campo */}
        <div className="mb-8 flex-1 print:mb-2 print:flex-none">
          <h3 className="mb-4 flex items-center gap-2 border-b-2 border-primary/20 pb-2 text-xs font-bold uppercase tracking-wider text-primary print:mb-1 print:pb-1 print:text-[10px]">
            <Search className="h-4 w-4 print:h-3 print:w-3" /> {isGrouped ? "Dados Coletados em Campo — Apurações do Dia" : "Dados Coletados em Campo"}
          </h3>
          <div className="flex flex-col gap-4 print:gap-2">
            {records.map((record, indice) => (
              <RegistroUnico
                key={record.id}
                record={record}
                ordem={isGrouped ? indice + 1 : null}
                template={dados.templatesPorId.get(record.ficha_template_id)}
                dados={dados}
                hashesAoVivo={hashesAoVivo}
              />
            ))}
          </div>
        </div>

        {/* Rodapé de conformidade legal */}
        <div className="mt-4 overflow-hidden rounded-lg border border-hairline print:mt-2" style={{ breakInside: "avoid" }}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-gray-50 px-4 py-2 print:px-3 print:py-1">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary print:text-[9px]">
              <Shield className="h-4 w-4 print:h-3 print:w-3" /> Atestado de Validade Jurídica e Compliance Tecnológico
            </h3>
            {hashPrimario && (
              <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 print:text-[8px]">
                SHA-256: {resumoHash(hashPrimario, 16)}
                {integroPrimario !== null && (integroPrimario ? " ✓ ÍNTEGRO" : " ≠ VERIFIQUE")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 bg-white p-4 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2 print:grid-cols-2 print:gap-x-4 print:gap-y-2 print:p-3 print:text-[8px]">
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
                <Scale className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Amparo Legal e Normativo
              </p>
              <p>
                Documento oficial de autocontrole, gerado em conformidade com as exigências do MAPA para os agentes privados. As assinaturas e registros
                atendem aos requisitos de evidência eletrônica e rastreabilidade industrial.
              </p>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 print:h-3 print:w-3" /> Criptografia e Imutabilidade
              </p>
              <p>
                Após assinado digitalmente, este registro entra em modo estrito de bloqueio (Read-Only). O banco de dados em nuvem garante que o conteúdo
                não pode ser corrompido, adulterado ou apagado sem gerar alertas no sistema mestre.
              </p>
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
                <Clock className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Carimbo de Tempo (Timestamp)
              </p>
              <p>
                A sincronização de data e hora deste monitoramento foi aferida por servidores seguros no momento exato do lançamento, prevenindo edições
                retroativas. Protocolo Oficial: <strong className="text-primary">{protocolo}</strong>
              </p>
              {(() => {
                const carimbo = assinaturaDe(dados.assinaturas, primary.id, "VERIFICADOR") ?? assinaturaDe(dados.assinaturas, primary.id, "INSPETOR");
                if (!carimbo) return <p className="mt-1">Aguardando assinatura.</p>;
                if (carimbo.tsa_emitido_em)
                  return (
                    <p className="mt-1">
                      RFC 3161 — {carimbo.tsa_utilizada ?? "TSA"} em {new Date(carimbo.tsa_emitido_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
                    </p>
                  );
                return <p className="mt-1">Carimbo RFC 3161 em processamento.</p>;
              })()}
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink print:text-[8px]">
                <Search className="h-3.5 w-3.5 text-primary print:h-3 print:w-3" /> Auditoria Permanente
              </p>
              <p>
                Acesse <strong className="text-primary">{typeof window !== "undefined" ? window.location.host : ""}/verificar</strong> e informe o identificador único do
                documento:
              </p>
              <p className="mt-1 break-all rounded border border-hairline bg-gray-50 px-2 py-1 font-mono text-[10px] font-bold text-ink print:text-[8px]">{primary.id}</p>
            </div>
          </div>
          <p className="border-t border-hairline bg-gray-50 px-4 py-1 text-[9px] text-muted-foreground print:px-3 print:text-[7px]">
            Sistema GloboPac · Kaefer Agro Industrial LTDA. · SIF 1606
            {hashPrimario ? ` · SHA-256: ${resumoHash(hashPrimario, 16)}` : ""}
          </p>
        </div>

        <div className="doc-generated-by hidden pt-2 text-right text-[9px] uppercase text-muted-foreground print:block">
          Relatório validado e gerado pelo Sistema GloboPac.
        </div>
      </div>
    </div>
  );
}
