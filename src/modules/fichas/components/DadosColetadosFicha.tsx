// Renderização compartilhada de "Dados Coletados em Campo" — usada pelo card da lista
// (AuditRecordCard), pela modal "Ver" (PreviewModal em PainelVerificacao.tsx) e pelo relatório
// impresso (RelatorioMonitoramento.tsx). Itera schema_campos na ordem real da ficha (fonte de
// verdade estruturada — sem heurísticas de regex) e delega os 7 widgets "Especial SIF" para
// CamposEspeciaisRelatorio; sem isto, cada tela reimplementava (ou esquecia de implementar) a
// mesma lógica de rótulo/tipo, e um valor de widget composto caía direto em `String(valor)` →
// "[object Object]".
import type { CampoTemplate } from "@/shared/schema-campos";
import {
  AbsorcaoAguaRelatorio,
  CaixasVaziasRelatorio,
  ChillerCarcacasRelatorio,
  ChillerPartesRelatorio,
  DrippingTestRelatorio,
  EsperaAvesRelatorio,
  LavagemFinalRelatorio,
  MiniChillersRelatorio,
  OcorrenciaPragasRelatorio,
  ParadaEquipamentoRelatorio,
  PenduraAvesRelatorio,
  EletronarcoseAvesRelatorio,
  PesoCaixaRelatorio,
  RastreabilidadeDoaRelatorio,
  TemperaturaResfriamentoRelatorio,
  PotabilidadeAguaRelatorio,
  PotabilidadePontosRelatorio,
  QualidadeMiudosRelatorio,
  ControleAbsorcaoRelatorio,
  ChecklistConformidadeRelatorio,
  RecepcaoAvesRelatorio,
} from "./relatorio/CamposEspeciaisRelatorio";
import type {
  AbsorcaoAguaValor,
  CaixasVaziasValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  DrippingTestValor,
  EsperaAvesValor,
  LavagemFinalValor,
  MiniChillersValor,
  OcorrenciaPragasValor,
  ParadaEquipamentoValor,
  PenduraAvesValor,
  EletronarcoseAvesValor,
  PesoCaixaValor,
  RastreabilidadeDoaValor,
  TemperaturaResfriamentoValor,
  PotabilidadeAguaValor,
  PotabilidadePontosValor,
  QualidadeMiudosValor,
  ControleAbsorcaoValor,
  ChecklistConformidadeValor,
  RecepcaoAvesValor,
} from "../fields/tiposCompostos";

export function CampoSimples({ label, tipo, valor }: { label: string; tipo: string; valor: unknown }) {
  const strVal = String(valor ?? "").toLowerCase().trim();
  const conforme = strVal === "sim" || strVal === "ok" ? true : strVal === "não" || strVal === "nao" || strVal === "nc" ? false : null;
  return (
    <div className="flex flex-col rounded-md border border-hairline bg-gray-50 p-2 print:rounded print:p-1.5">
      <span className="text-[10px] font-bold text-ink print:text-[9px]">{label}</span>
      <span className="mb-0.5 text-[9px] text-muted-foreground print:text-[8px]">{tipo}</span>
      <div className="flex items-center gap-1.5 print:gap-1">
        <span className="text-sm font-black leading-none text-ink print:text-xs">{valor === "" || valor === null || valor === undefined ? "—" : String(valor)}</span>
        {conforme === true && <span className="text-[9px] font-black uppercase tracking-wider text-success print:text-[7px]">Conforme</span>}
        {conforme === false && <span className="text-[9px] font-black uppercase tracking-wider text-down print:text-[7px]">Não Conforme</span>}
      </div>
    </div>
  );
}

/** `items` (v2) ou `itens` (registros antigos): lista de amostras de um teste de absorção. */
function listaDeItens(valor: unknown): AbsorcaoAguaValor["items"] | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as { items?: unknown; itens?: unknown };
  const lista = Array.isArray(bruto.items) ? bruto.items : Array.isArray(bruto.itens) ? bruto.itens : null;
  return lista as AbsorcaoAguaValor["items"] | null;
}

const ROTULO_TIPO: Partial<Record<CampoTemplate["tipo"], string>> = {
  numero: "Numérico",
  inteiro: "Numérico",
  decimal: "Numérico",
  texto: "Texto",
  texto_longo: "Texto",
  hora: "Horário",
  booleano: "Sim/Não",
  simples: "Sim/Não",
  selecao: "Seleção",
  unica_escolha: "Seleção",
};

/** Peso médio da carcaça do SPR Carcaças da MESMA ficha (0 se a ficha não tem esse campo). */
function pesoCarcacaDaFicha(campos: CampoTemplate[], dados: Record<string, unknown>): number {
  const campo = campos.find((c) => c.tipo === "chiller_carcacas");
  return (dados[campo?.chave ?? ""] as ChillerCarcacasValor | undefined)?.pesoMedioCarcaca ?? 0;
}

/** "Dados Coletados em Campo" de UM registro: itera schema_campos na ordem real da ficha e
 * delega os 7 widgets "Especial SIF" para CamposEspeciaisRelatorio. */
export function DadosColetados({
  dadosDinamicos,
  campos,
  registro,
}: {
  dadosDinamicos: Record<string, unknown>;
  campos: CampoTemplate[];
  /** Horas do servidor do registro (início = criado_em, fim = finalizado_em) — mostradas na absorção de água. */
  registro?: { criado_em: string; finalizado_em: string | null; assinado_em?: string | null };
}) {
  if (campos.length === 0) {
    return <p className="text-xs text-muted-foreground">Definição da ficha não disponível (template pode ter sido removido).</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
      {campos.map((campo) => {
        const valor = dadosDinamicos[campo.chave];
        const rotulo = campo.label ?? campo.chave;

        switch (campo.tipo) {
          case "chiller_carcacas":
            return valor ? <ChillerCarcacasRelatorio key={campo.chave} valor={valor as ChillerCarcacasValor} titulo={rotulo} /> : null;
          case "chiller_partes":
            return valor ? <ChillerPartesRelatorio key={campo.chave} valor={valor as ChillerPartesValor} titulo={rotulo} /> : null;
          case "lavagem_final":
            return valor ? (
              <LavagemFinalRelatorio key={campo.chave} valor={valor as LavagemFinalValor} titulo={rotulo} pesoCarcaca={pesoCarcacaDaFicha(campos, dadosDinamicos)} />
            ) : null;
          case "mini_chillers":
            return valor ? <MiniChillersRelatorio key={campo.chave} valor={valor as MiniChillersValor} titulo={rotulo} /> : null;
          case "absorcao_agua":
            return valor ? (
              <AbsorcaoAguaRelatorio
                key={campo.chave}
                valor={valor as AbsorcaoAguaValor}
                titulo={rotulo}
                horas={registro ? { iniciadoEm: registro.criado_em, finalizadoEm: registro.finalizado_em } : undefined}
              />
            ) : null;
          case "dripping_test":
            return valor ? <DrippingTestRelatorio key={campo.chave} valor={valor as DrippingTestValor} titulo={rotulo} assinadoEm={registro?.assinado_em} /> : null;
          case "parada_equipamento":
            return valor ? <ParadaEquipamentoRelatorio key={campo.chave} valor={valor as ParadaEquipamentoValor} titulo={rotulo} /> : null;
          case "ocorrencia_pragas":
            return valor ? <OcorrenciaPragasRelatorio key={campo.chave} valor={valor as OcorrenciaPragasValor} titulo={rotulo} /> : null;
          case "recepcao_aves":
            return valor ? <RecepcaoAvesRelatorio key={campo.chave} valor={valor as RecepcaoAvesValor} titulo={rotulo} /> : null;
          case "espera_aves":
            return valor ? <EsperaAvesRelatorio key={campo.chave} valor={valor as EsperaAvesValor} titulo={rotulo} /> : null;
          case "eletronarcose_aves":
            return valor ? <EletronarcoseAvesRelatorio key={campo.chave} valor={valor as EletronarcoseAvesValor} titulo={rotulo} /> : null;
          case "pendura_aves":
            return valor ? <PenduraAvesRelatorio key={campo.chave} valor={valor as PenduraAvesValor} titulo={rotulo} /> : null;
          case "peso_caixa":
            return valor ? <PesoCaixaRelatorio key={campo.chave} valor={valor as PesoCaixaValor} titulo={rotulo} /> : null;
          case "rastreabilidade_doa":
            return valor ? <RastreabilidadeDoaRelatorio key={campo.chave} valor={valor as RastreabilidadeDoaValor} titulo={rotulo} /> : null;
          case "temperatura_resfriamento":
            return valor ? <TemperaturaResfriamentoRelatorio key={campo.chave} valor={valor as TemperaturaResfriamentoValor} titulo={rotulo} /> : null;
          case "potabilidade_agua":
            return valor ? <PotabilidadeAguaRelatorio key={campo.chave} valor={valor as PotabilidadeAguaValor} titulo={rotulo} /> : null;
          case "controle_absorcao":
            return valor ? <ControleAbsorcaoRelatorio key={campo.chave} valor={valor as ControleAbsorcaoValor} titulo={rotulo} /> : null;
          case "qualidade_miudos":
            return valor ? <QualidadeMiudosRelatorio key={campo.chave} valor={valor as QualidadeMiudosValor} titulo={rotulo} /> : null;
          case "potabilidade_pontos":
            return valor ? <PotabilidadePontosRelatorio key={campo.chave} valor={valor as PotabilidadePontosValor} titulo={rotulo} /> : null;
          case "aguas_residuais":
          case "ventilacao":
          case "higiene_habitos":
          case "pso":
          case "higiene_operacional":
          case "higiene_colaboradores":
            return valor ? <ChecklistConformidadeRelatorio key={campo.chave} tipo={campo.tipo} valor={valor as ChecklistConformidadeValor} titulo={rotulo} /> : null;
          case "caixas_vazias":
            return valor ? <CaixasVaziasRelatorio key={campo.chave} valor={valor as CaixasVaziasValor} titulo={rotulo} /> : null;
          case "foto":
          case "assinatura":
            return (
              <div key={campo.chave} className="col-span-full text-xs text-muted-foreground print:text-[9px]">
                {rotulo}: tipo de campo sem tela de preenchimento nesta versão.
              </div>
            );
          default: {
            // Qualquer valor de campo que tenha `items` (ou `itens`) é renderizado pelo componente
            // de detalhe de absorção (registros antigos/campos sem tipo composto conhecido).
            const lista = listaDeItens(valor);
            if (lista) {
              const normalizado = { ...(valor as object), items: lista } as unknown as AbsorcaoAguaValor;
              return <AbsorcaoAguaRelatorio key={campo.chave} valor={normalizado} titulo={rotulo} />;
            }
            return <CampoSimples key={campo.chave} label={rotulo} tipo={ROTULO_TIPO[campo.tipo] ?? "Variável"} valor={valor} />;
          }
        }
      })}
    </div>
  );
}
