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
  ChillerCarcacasRelatorio,
  ChillerPartesRelatorio,
  DrippingTestRelatorio,
  LavagemFinalRelatorio,
  MiniChillersRelatorio,
  ParadaEquipamentoRelatorio,
} from "./relatorio/CamposEspeciaisRelatorio";
import type {
  AbsorcaoAguaValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  DrippingTestValor,
  LavagemFinalValor,
  MiniChillersValor,
  ParadaEquipamentoValor,
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

/** "Dados Coletados em Campo" de UM registro: itera schema_campos na ordem real da ficha e
 * delega os 7 widgets "Especial SIF" para CamposEspeciaisRelatorio. */
export function DadosColetados({ dadosDinamicos, campos }: { dadosDinamicos: Record<string, unknown>; campos: CampoTemplate[] }) {
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
            return valor ? <LavagemFinalRelatorio key={campo.chave} valor={valor as LavagemFinalValor} titulo={rotulo} /> : null;
          case "mini_chillers":
            return valor ? <MiniChillersRelatorio key={campo.chave} valor={valor as MiniChillersValor} titulo={rotulo} /> : null;
          case "absorcao_agua":
            return valor ? <AbsorcaoAguaRelatorio key={campo.chave} valor={valor as AbsorcaoAguaValor} titulo={rotulo} /> : null;
          case "dripping_test":
            return valor ? <DrippingTestRelatorio key={campo.chave} valor={valor as DrippingTestValor} titulo={rotulo} /> : null;
          case "parada_equipamento":
            return valor ? <ParadaEquipamentoRelatorio key={campo.chave} valor={valor as ParadaEquipamentoValor} titulo={rotulo} /> : null;
          case "foto":
          case "assinatura":
            return (
              <div key={campo.chave} className="col-span-full text-xs text-muted-foreground print:text-[9px]">
                {rotulo}: tipo de campo sem tela de preenchimento nesta versão.
              </div>
            );
          default:
            return <CampoSimples key={campo.chave} label={rotulo} tipo={ROTULO_TIPO[campo.tipo] ?? "Variável"} valor={valor} />;
        }
      })}
    </div>
  );
}
