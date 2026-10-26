import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  AVALIACOES,
  avaliarRecebimentoEmbalagens,
  estatisticasAmostras,
  formatarMedida,
  montarValorRecebimentoEmbalagens,
  recebimentoEmbalagensVazio,
  ROTULOS_MEDIDA,
  SITUACOES_LOTE,
  VARIANTES_EMBALAGEM,
  type MedidaEmbalagem,
  type VarianteEmbalagem,
} from "./recebimentoEmbalagens";
import type { AmostraEmbalagem, AvaliacaoSatisfatoria, RecebimentoEmbalagensValor, SituacaoLoteEmbalagem } from "./tiposCompostos";

interface RecebimentoEmbalagensFieldProps {
  value: RecebimentoEmbalagensValor | undefined | null;
  onChange: (valor: RecebimentoEmbalagensValor) => void;
  disabled?: boolean;
  /** Bobina (padrão): 10 amostras. Sacos: 30. Secundárias (caixas): 32, com teste de resina e sem rótulo. */
  variante?: VarianteEmbalagem;
}

const CLASSE_OK = "border-success bg-success/10 text-success";
const CLASSE_DESVIO = "border-destructive bg-destructive/10 text-destructive";

/** Perguntas de sim/não: `desvioQuando` diz qual resposta é o desvio (contaminação: "Sim"; leiaute: "Não"); null = nenhuma é desvio. */
function SimNao({ nome, rotulo, valor, desvioQuando, onChange }: { nome: string; rotulo: string; valor: boolean | null; desvioQuando: boolean | null; onChange: (b: boolean) => void }) {
  return (
    <div className="space-y-1">
      <Label>{rotulo}</Label>
      <div className="flex gap-2" role="radiogroup" aria-label={rotulo}>
        {([true, false] as const).map((b) => (
          <label
            key={String(b)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${valor === b ? (b === desvioQuando ? CLASSE_DESVIO : CLASSE_OK) : ""}`}
          >
            <input type="radio" name={nome} checked={valor === b} onChange={() => onChange(b)} />
            {b ? "Sim" : "Não"}
          </label>
        ))}
      </div>
    </div>
  );
}

function Escolha({ nome, rotulo, valor, opcoes, desvio, onChange }: { nome: string; rotulo: string; valor: string; opcoes: { valor: string; rotulo: string }[]; desvio: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{rotulo}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <label
            key={o.valor}
            className={`flex min-w-[8rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${valor === o.valor ? (o.valor === desvio ? CLASSE_DESVIO : CLASSE_OK) : ""}`}
          >
            <input type="radio" name={nome} checked={valor === o.valor} onChange={() => onChange(o.valor)} />
            {o.rotulo}
          </label>
        ))}
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">{titulo}</legend>
      {children}
    </fieldset>
  );
}

const soMedida = (texto: string) => texto.replace(/[^\d.,]/g, "");

/** "Largura (mm)" → "Largura"; unidade → "mm". */
const nomeMedida = (m: MedidaEmbalagem) => ROTULOS_MEDIDA[m].replace(/ \(.*\)$/, "");
const unidadeMedida = (m: MedidaEmbalagem) => ROTULOS_MEDIDA[m].match(/\((.*)\)$/)?.[1] ?? "";

/** Recebimento de embalagens (bobina, sacos ou secundárias): fornecedor, nota fiscal, higiene do veículo e das
 * embalagens, rótulo (bobina e sacos), quantidade, código, relatório de ensaio, teste de resina e absorção de água
 * (secundárias), lote e medição das amostras (as medidas e a quantidade de amostras dependem da variante). */
export function RecebimentoEmbalagensField({ value, onChange, disabled, variante = "bobina" }: RecebimentoEmbalagensFieldProps) {
  const cfg = VARIANTES_EMBALAGEM[variante];
  const [v, setV] = useState<RecebimentoEmbalagensValor>(() => {
    const base = recebimentoEmbalagensVazio(variante);
    const inicial = { ...base, ...(value ?? {}) };
    // Preserva todas as linhas mesmo se o valor salvo vier com menos.
    return { ...inicial, amostras: base.amostras.map((a, i) => ({ ...a, ...(inicial.amostras?.[i] ?? {}) })) };
  });
  const aval = avaliarRecebimentoEmbalagens(v);
  const stats = estatisticasAmostras(v);

  useEffect(() => {
    onChange(montarValorRecebimentoEmbalagens(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<RecebimentoEmbalagensValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  function atualizarAmostra(i: number, parcial: Partial<AmostraEmbalagem>) {
    setV((atual) => ({ ...atual, amostras: atual.amostras.map((a, k) => (k === i ? { ...a, ...parcial } : a)) }));
  }

  const respondeu = v.contaminacaoFisica !== null || v.contaminacaoQuimica !== null || v.condensacao !== null || v.higieneGeral !== "";

  return (
    <div className="space-y-4 rounded-lg border p-4" data-testid="recebimento-embalagens">
      <div
        className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : respondeu ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
      >
        {!aval.conformidade ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : respondeu ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
      </div>
      {!aval.conformidade && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs font-semibold text-destructive" role="alert">
          {aval.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <fieldset className="space-y-4" disabled={disabled}>
        <Secao titulo="Fornecedor">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="emb-fornecedor">Nome do fornecedor</Label>
              <Input id="emb-fornecedor" value={v.fornecedor} onChange={(e) => atualizar({ fornecedor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emb-nota-fiscal">Número da nota fiscal</Label>
              <Input id="emb-nota-fiscal" value={v.notaFiscal} onChange={(e) => atualizar({ notaFiscal: e.target.value })} />
            </div>
          </div>
        </Secao>

        <Secao titulo="Condições higiênicas do veículo e das embalagens">
          <SimNao
            nome="emb-fisica"
            rotulo="Há contaminações físicas no compartimento de cargas? (cabelo, fragmento de metal, vidro, madeira, terra) que possam comprometer as embalagens"
            valor={v.contaminacaoFisica}
            desvioQuando={true}
            onChange={(b) => atualizar({ contaminacaoFisica: b })}
          />
          <SimNao nome="emb-quimica" rotulo="Há presença de contaminações químicas (resíduos de substância)?" valor={v.contaminacaoQuimica} desvioQuando={true} onChange={(b) => atualizar({ contaminacaoQuimica: b })} />
          <SimNao
            nome="emb-condensacao"
            rotulo="Há condensação, resíduos orgânicos, umidade, sujidades ou insetos?"
            valor={v.condensacao}
            desvioQuando={true}
            onChange={(b) => atualizar({ condensacao: b })}
          />
          <Escolha
            nome="emb-higiene"
            rotulo="Condições gerais de higiene do veículo e das embalagens"
            valor={v.higieneGeral}
            opcoes={AVALIACOES}
            desvio="insatisfatoria"
            onChange={(x) => atualizar({ higieneGeral: x as AvaliacaoSatisfatoria })}
          />
        </Secao>

        {cfg.rotulo && (
          <Secao titulo="Rótulo da embalagem">
            <SimNao nome="emb-rotulo" rotulo="Há rótulo na embalagem?" valor={v.temRotulo} desvioQuando={null} onChange={(b) => atualizar({ temRotulo: b })} />
            {v.temRotulo === true && (
              <div className="space-y-4 rounded-md border border-dashed p-3">
                <SimNao nome="emb-leiaute" rotulo="Leiaute de acordo com a ficha técnica da embalagem?" valor={v.leiauteConforme} desvioQuando={false} onChange={(b) => atualizar({ leiauteConforme: b })} />
                <SimNao nome="emb-descricao" rotulo="Presença da descrição dos produtos?" valor={v.descricaoProduto} desvioQuando={false} onChange={(b) => atualizar({ descricaoProduto: b })} />
                <Escolha
                  nome="emb-impressao"
                  rotulo="Qualidade da impressão"
                  valor={v.qualidadeImpressao}
                  opcoes={AVALIACOES}
                  desvio="insatisfatoria"
                  onChange={(x) => atualizar({ qualidadeImpressao: x as AvaliacaoSatisfatoria })}
                />
              </div>
            )}
          </Secao>
        )}

        <Secao titulo="Recebimento">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="emb-quantidade">Quantidade recebida</Label>
              <Input id="emb-quantidade" inputMode="decimal" value={v.quantidadeRecebida} onChange={(e) => atualizar({ quantidadeRecebida: soMedida(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="emb-codigo">Código da embalagem</Label>
              <Input id="emb-codigo" value={v.codigoEmbalagem} onChange={(e) => atualizar({ codigoEmbalagem: e.target.value })} />
            </div>
          </div>
          <SimNao nome="emb-ensaio" rotulo="Acompanha relatório de ensaio de qualidade?" valor={v.relatorioEnsaio} desvioQuando={false} onChange={(b) => atualizar({ relatorioEnsaio: b })} />
          {cfg.testeCaixa && (
            <>
              <SimNao nome="emb-resina" rotulo="Teste de resina: há aplicação de resina?" valor={v.aplicacaoResina ?? null} desvioQuando={false} onChange={(b) => atualizar({ aplicacaoResina: b })} />
              <SimNao nome="emb-absorcao" rotulo="Houve absorção de água em alguma parte da caixa?" valor={v.absorcaoAgua ?? null} desvioQuando={true} onChange={(b) => atualizar({ absorcaoAgua: b })} />
            </>
          )}
          <div className="space-y-1">
            <Label htmlFor="emb-lote">Número do lote</Label>
            <Input id="emb-lote" value={v.lote} onChange={(e) => atualizar({ lote: e.target.value })} />
          </div>
          <Escolha
            nome="emb-lote-situacao"
            rotulo="Situação do lote"
            valor={v.situacaoLote}
            opcoes={SITUACOES_LOTE}
            desvio="reprovado"
            onChange={(x) => atualizar({ situacaoLote: x as SituacaoLoteEmbalagem })}
          />
        </Secao>

        <Secao titulo={`Medição das embalagens — amostras 1 a ${cfg.qtdAmostras}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="emb-amostras">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wider text-muted-foreground">
                  <th className="w-20 py-1">Amostra</th>
                  {cfg.medidas.map((m) => (
                    <th key={m} className="py-1">
                      {ROTULOS_MEDIDA[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.amostras.map((a, i) => (
                  <tr key={i}>
                    <td className="py-1 font-semibold">{i + 1}</td>
                    {cfg.medidas.map((m) => (
                      <td key={m} className="py-1 pr-2">
                        <Input aria-label={`${nomeMedida(m)} da amostra ${i + 1}`} inputMode="decimal" value={a[m] ?? ""} onChange={(e) => atualizarAmostra(i, { [m]: soMedida(e.target.value) })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cfg.medidas.some((m) => stats[m].n > 0) && (
            <p className="text-xs text-muted-foreground">
              {cfg.medidas.map((m) => `${nomeMedida(m)}: mín. ${formatarMedida(stats[m].min)} · máx. ${formatarMedida(stats[m].max)} · média ${formatarMedida(stats[m].media)} ${unidadeMedida(m)}`).join(" — ")}
            </p>
          )}
        </Secao>
      </fieldset>
    </div>
  );
}
