// Bloqueio de assinatura/salvamento dos monitoramentos que dependem do SPR Carcaças. Cada widget
// (Partes, Miúdos, Chuveiro) já emite a flag no seu valor quando a base vinda do SPR Carcaças está
// ausente ou zero (fora do 1º monitoramento do dia); o formulário-pai só precisa conferi-las antes
// de salvar. Função pura, testada em tests/unit/bloqueiosSpr.test.ts.
import type { CampoTemplate } from "@/shared/schema-campos";
import { motivosBloqueioPragas } from "../fields/pragas";
import { motivosBloqueioEspera } from "../fields/esperaAves";
import { motivosBloqueioCaixasVazias } from "../fields/caixasVazias";
import { motivosBloqueioPendura } from "../fields/penduraAves";
import { motivosBloqueioEletronarcose } from "../fields/eletronarcoseAves";
import { motivosBloqueioPesoCaixa } from "../fields/pesoCaixa";
import { motivosBloqueioRecepcao } from "../fields/recepcaoAves";
import { motivosBloqueioDoa } from "../fields/rastreabilidadeDoa";
import type { CaixasVaziasValor, EletronarcoseAvesValor, EsperaAvesValor, OcorrenciaPragasValor, PenduraAvesValor, PesoCaixaValor, RastreabilidadeDoaValor, RecepcaoAvesValor } from "../fields/tiposCompostos";

export function motivosDeBloqueioSpr(campos: CampoTemplate[], dados: Record<string, unknown>): string[] {
  const motivos: string[] = [];
  for (const campo of campos) {
    if (campo.tipo === "recepcao_aves") {
      motivos.push(...motivosBloqueioRecepcao(dados[campo.chave] as RecepcaoAvesValor | undefined));
      continue;
    }
    if (campo.tipo === "rastreabilidade_doa") {
      motivos.push(...motivosBloqueioDoa(dados[campo.chave] as RastreabilidadeDoaValor | undefined));
      continue;
    }
    if (campo.tipo === "espera_aves") {
      motivos.push(...motivosBloqueioEspera(dados[campo.chave] as EsperaAvesValor | undefined));
      continue;
    }
    if (campo.tipo === "peso_caixa") {
      motivos.push(...motivosBloqueioPesoCaixa(dados[campo.chave] as PesoCaixaValor | undefined));
      continue;
    }
    if (campo.tipo === "caixas_vazias") {
      motivos.push(...motivosBloqueioCaixasVazias(dados[campo.chave] as CaixasVaziasValor | undefined));
      continue;
    }
    if (campo.tipo === "eletronarcose_aves") {
      motivos.push(...motivosBloqueioEletronarcose(dados[campo.chave] as EletronarcoseAvesValor | undefined));
      continue;
    }
    if (campo.tipo === "pendura_aves") {
      motivos.push(...motivosBloqueioPendura(dados[campo.chave] as PenduraAvesValor | undefined));
      continue;
    }
    const valor = dados[campo.chave] as Record<string, unknown> | undefined;
    if (!valor || typeof valor !== "object") continue;

    if (campo.tipo === "ocorrencia_pragas") {
      motivos.push(...motivosBloqueioPragas(valor as unknown as OcorrenciaPragasValor));
    }
    if (campo.tipo === "chiller_partes" && valor.pesoCarcacaIndisponivel === true) {
      motivos.push(
        'SPR Partes: preencha primeiro o "Renovação da Água do SPR Carcaças" — o peso médio de carcaça vem de lá e está ausente ou zerado.'
      );
    }
    if (campo.tipo === "mini_chillers") {
      if (valor.avesIndisponivel === true) {
        motivos.push('SPR Miúdos: preencha primeiro o "Renovação da Água do SPR Carcaças" — as aves no período vêm de lá e estão ausentes ou zeradas.');
      }
      if (valor.pesoMiudoIndisponivel === true) {
        motivos.push(
          'SPR Miúdos: preencha primeiro o "Renovação da Água do SPR Carcaças" — o peso médio de carcaça (Tabela DE-PARA dos miúdos) vem de lá e está ausente ou zerado.'
        );
      }
    }
    if (campo.tipo === "lavagem_final" && valor.avesIndisponivel === true) {
      motivos.push(
        'Chuveiro Final: preencha primeiro o "Renovação da Água do SPR Carcaças" — o total de aves (bruto) vem de lá e está ausente ou zerado.'
      );
    }
  }
  return motivos;
}
