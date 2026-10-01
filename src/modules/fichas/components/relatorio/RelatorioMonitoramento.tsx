// Relatório oficial de monitoramento — equivalente a DocumentDossier.jsx do v1, com paleta
// navy/lima do design system atual (não o roxo do v1) e conteúdo adaptado ao modelo de dados
// real de v2: schema_campos como fonte de ordem/tipo dos campos (em vez das heurísticas de
// regex do v1), não-conformidade resolvida via RNC vinculada (não um objeto `capa` embutido em
// dados_dinamicos, que não existe neste sistema), e hash/assinatura no formato de
// conteudoAssinavelMonitoramento (v2), não o de v1.
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, FileText, Search, Shield, UserCheck } from "lucide-react";
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

function BlocoRnc({ rnc, nomesPorId }: { rnc: Rnc; nomesPorId: Map<string, string> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border-2 border-down/40 print:mt-2">
      <div className="flex items-center gap-2 border-b-2 border-down/30 bg-down-soft p-3 text-sm font-bold uppercase tracking-wider text-down print:p-2 print:text-[10px]">
        <AlertTriangle className="h-4 w-4 print:h-3 print:w-3" /> Não Conformidade — RNC ({rnc.severidade})
      </div>
      <div className="grid grid-cols-1 gap-3 bg-white p-4 text-sm sm:grid-cols-2 print:gap-2 print:p-3 print:text-[9px]">
        <div className="rounded border border-hairline bg-gray-50 p-2">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Descrição</span>
          <span className="font-medium text-ink">{rnc.descricao}</span>
        </div>
        <div className="rounded border border-hairline bg-gray-50 p-2">
          <span className="mb-0.5 block text-[10px] font-bold uppercase text-muted-foreground print:text-[8px]">Status</span>
          <span className="font-medium text-ink">{rnc.status}</span>
        </div>
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
        <span className={`text-[10px] font-black uppercase tracking-wider print:text-[8px] ${record.conformidade ? "text-success" : "text-down"}`}>
          {record.conformidade ? "Conforme" : "Não Conforme"}
        </span>
      </div>

      <DadosColetados dadosDinamicos={record.dados_dinamicos} campos={camposSemHora} />

      {record.conformidade === false && rnc && <BlocoRnc rnc={rnc} nomesPorId={dados.nomesPorId} />}
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
  const records = ids.map((id) => dados.monitoramentos.find((m) => m.id === id)).filter((m): m is MonitoramentoRelatorio => Boolean(m));
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

  const todasConformes = records.every((r) => r.conformidade);
  const rncsDoGrupo = records
    .filter((r) => r.conformidade === false)
    .map((r) => dados.rncs.find((rnc) => rnc.monitoramento_id === r.id))
    .filter((r): r is Rnc => Boolean(r));
  const todasTratadas = rncsDoGrupo.length > 0 && rncsDoGrupo.every((r) => r.status === "FECHADA");

  const turnos = [...new Set(records.map((r) => turnoDoDia(new Date(r.criado_em))))];
  const horarios = records.map((r) => ensureLocalTime(r.criado_em).time).sort();
  const horarioDocumento = horarios.length <= 1 ? horarios[0] ?? "—" : `${horarios[0]}–${horarios[horarios.length - 1]}`;

  return (
    <div className="print-page mx-auto flex w-full max-w-4xl flex-col bg-white font-sans text-ink shadow-2xl print:max-w-[210mm]" style={{ margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div className="flex w-full flex-col justify-between gap-4 rounded-t-lg bg-surface-dark p-6 text-ondark sm:flex-row print:flex-row print:p-4">
        <div className="min-w-0 flex-1 pr-0 sm:pr-4 print:pr-4">
          <div className="mb-2 flex items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 opacity-80" />
            <span className="text-xl font-black tracking-wide print:text-base">{RAZAO_SOCIAL}</span>
          </div>
          <div className="mb-1 mt-2 text-[10px] uppercase tracking-widest opacity-85">
            SISTEMA DE GESTÃO DE QUALIDADE — RELATÓRIO OFICIAL{isGrouped ? " CONSOLIDADO" : ""}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold drop-shadow-sm print:text-base">{template?.nome ?? "Ficha de Monitoramento"}</span>
            {template?.codigo && (
              <span className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime">{template.codigo}</span>
            )}
            {isGrouped && (
              <span className="whitespace-nowrap rounded bg-lime/15 px-2 py-0.5 text-xs font-black tracking-wider text-lime">
                {records.length} APURAÇÕES NO DIA
              </span>
            )}
            <span className="whitespace-nowrap rounded border border-ondark/40 bg-ondark/10 px-2 py-0.5 text-xs font-black tracking-wider">
              SETOR: {primary.setor.toUpperCase()}
            </span>
          </div>
          <div className="mt-1 text-sm opacity-90 print:text-xs">
            {template?.pac_correspondente ?? "PAC não definido"} · {diaDocumento}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start sm:items-end print:items-end">
          <div className="max-w-full rounded-lg border border-ondark/20 bg-ondark/10 p-3 print:p-2">
            <div className="mb-1 text-[10px] uppercase tracking-widest opacity-85">Protocolo</div>
            <div className="truncate font-mono text-lg font-black tracking-wider print:text-sm">{protocolo}</div>
          </div>
          <div className="mt-3 text-xs opacity-85 print:mt-1 print:text-[10px]">Emitido em: {emitidoEm}</div>
        </div>
      </div>

      {/* Banner de conformidade */}
      <div
        className={`flex w-full flex-col items-start justify-between gap-2 border-b-[3px] px-6 py-3 sm:flex-row sm:items-center print:flex-row print:px-4 print:py-2 ${
          todasConformes ? "border-success bg-success/5" : todasTratadas ? "border-warning bg-warning/5" : "border-down bg-down-soft"
        }`}
      >
        <div className="flex items-center gap-3">
          {todasConformes ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className={`h-4 w-4 ${todasTratadas ? "text-warning-foreground" : "text-down"}`} />
          )}
          <span className={`text-sm font-extrabold print:text-xs ${todasConformes ? "text-success" : todasTratadas ? "text-warning-foreground" : "text-down"}`}>
            {todasConformes ? "CONFORME — Todos os Pontos dentro dos Padrões" : todasTratadas ? "TRATADA — Desvio Identificado e Resolvido" : "NÃO CONFORME — Contém Desvios Identificados"}
          </span>
        </div>
        <div className={`flex items-center gap-2 text-sm font-bold print:text-[10px] ${todasConformes ? "text-success" : "text-down"}`}>
          <Shield className="h-3.5 w-3.5" />
          {isGrouped ? (
            <>{records.length} REGISTROS · <span className="font-mono">{hashId}</span></>
          ) : (
            <>SHA-256: <span className="font-mono">{resumoHash(assinaturaDe(dados.assinaturas, primary.id, "VERIFICADOR")?.hash_documento ?? assinaturaDe(dados.assinaturas, primary.id, "INSPETOR")?.hash_documento ?? hashesAoVivo.get(primary.id), 12) ?? hashId}</span></>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-white p-8 print:flex-none print:p-3">
        {/* Dados gerais */}
        <div className="mb-8 print:mb-2">
          <h3 className="mb-4 flex items-center gap-2 border-b-2 border-primary/20 pb-2 text-sm font-bold uppercase tracking-wider text-primary print:mb-1 print:pb-1 print:text-xs">
            <FileText className="h-4 w-4 print:h-3 print:w-3" /> Dados Gerais do Monitoramento
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 rounded-lg border border-hairline bg-gray-50 p-4 sm:grid-cols-5 print:grid-cols-5 print:gap-y-2 print:p-2">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground print:mb-0">Data</p>
              <p className="text-sm font-bold text-ink print:text-[11px]">{diaDocumento}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground print:mb-0">Horário</p>
              <p className="text-sm font-bold text-ink print:text-[11px]">{horarioDocumento}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground print:mb-0">Turno</p>
              <p className="text-sm font-bold text-ink print:text-[11px]">{turnos.length === 1 ? turnos[0] : "Múltiplos Turnos"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground print:mb-0">Status</p>
              <p className="text-sm font-bold text-success print:text-[11px]">{isGrouped ? `Concluído (${records.length} apurações)` : "Concluído"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground print:mb-0">Autenticação</p>
              <p className="text-sm font-bold text-primary print:text-[11px]">Digital / Assinada</p>
            </div>
          </div>
        </div>

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
        <div className="mt-4 border-t border-hairline pt-4 print:mt-2 print:pt-2" style={{ breakInside: "avoid" }}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary print:mb-1 print:text-[10px]">
            <UserCheck className="h-4 w-4 print:h-3 print:w-3" /> Atestado de Validade Jurídica e Compliance Tecnológico
          </h3>
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-hairline bg-gray-50 p-4 text-[10px] leading-relaxed text-muted-foreground sm:grid-cols-2 print:gap-2 print:p-2 print:text-[8px]">
            <div className="rounded border border-hairline bg-white p-2">
              <p className="mb-1 font-bold uppercase text-ink">Amparo Legal e Normativo</p>
              <p>Assinatura eletrônica avançada nos termos da Lei nº 14.063/2020, Art. 4º §2º — univocidade, controle exclusivo do signatário e detectabilidade de alterações.</p>
            </div>
            <div className="rounded border border-hairline bg-white p-2">
              <p className="mb-1 font-bold uppercase text-ink">Criptografia e Imutabilidade</p>
              <p>Hash SHA-256 calculado a partir do registro persistido no servidor — nunca aceito do cliente. Registros liberados ao SIF são imutáveis; correções geram um novo registro vinculado (aditivo), preservando o original.</p>
            </div>
            <div className="rounded border border-hairline bg-white p-2">
              <p className="mb-1 font-bold uppercase text-ink">Carimbo de Tempo</p>
              <p className="font-mono text-ink">{protocolo}</p>
              {(() => {
                const carimbo = assinaturaDe(dados.assinaturas, primary.id, "VERIFICADOR") ?? assinaturaDe(dados.assinaturas, primary.id, "INSPETOR");
                if (!carimbo) return <p>Aguardando assinatura.</p>;
                if (carimbo.tsa_emitido_em) return <p>RFC 3161 — {carimbo.tsa_utilizada ?? "TSA"} em {new Date(carimbo.tsa_emitido_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}</p>;
                return <p>Carimbo RFC 3161 em processamento.</p>;
              })()}
            </div>
            <div className="rounded border border-hairline bg-white p-2">
              <p className="mb-1 font-bold uppercase text-ink">Auditoria Permanente</p>
              <p>
                Verifique este documento em{" "}
                <span className="font-mono text-primary">
                  {typeof window !== "undefined" ? window.location.origin : ""}/verificar?id={primary.id}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="doc-generated-by hidden pt-2 text-right text-[9px] uppercase text-muted-foreground print:block">
          Relatório validado e gerado pelo Sistema GloboPac.
        </div>
      </div>
    </div>
  );
}
