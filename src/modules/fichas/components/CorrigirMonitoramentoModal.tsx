import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2, PenLine, X } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useCorrigirMonitoramento, usePodeCorrigirMonitoramento, usePreviaMonitoramento, type PreviaMonitoramento } from "@/modules/bordo/api";
import { valoresIniciaisDe, zodFromSchemaCampos, type CampoTemplate } from "@/shared/schema-campos";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { DynamicField } from "../DynamicField";
import type { ChillerCarcacasValor } from "../fields/tiposCompostos";
import { dataManaus, instanteDoRegistro } from "../utils/horaMonitoramento";
import { diffCorrecoes, MOTIVO_CORRECAO_MIN_CARACTERES, type CorrecaoCampo } from "../utils/correcaoInspetor";

interface Props {
  monitoramentoId: string;
  /** Campo clicado no relatório: a tela abre já rolada até ele. */
  campoFoco?: string | null;
  onFechar: () => void;
}

function textoDoValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Correção feita pelo inspetor (antes da verificação): abre a ficha com os valores gravados, os campos refazem os cálculos
 * enquanto ele edita (mesmo comportamento do preenchimento) e, ao assinar, o sistema grava uma nova versão com a justificativa. */
export function CorrigirMonitoramentoModal({ monitoramentoId, campoFoco, onFechar }: Props) {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: previa, isLoading, isError } = usePreviaMonitoramento(monitoramentoId);
  const { data: permissao } = usePodeCorrigirMonitoramento(monitoramentoId, perfil ? { id: perfil.id, nivelAcesso: perfil.nivelAcesso } : null);

  let corpo: React.ReactNode;
  if (isLoading || !permissao) {
    corpo = (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Abrindo o monitoramento…
      </div>
    );
  } else if (isError || !previa?.ficha) {
    corpo = <p className="py-16 text-center text-sm text-destructive">Não foi possível abrir o monitoramento para correção.</p>;
  } else if (!permissao.pode) {
    corpo = (
      <p role="alert" className="m-6 flex items-start gap-2 rounded-md border border-warning bg-warning/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {permissao.motivo}
      </p>
    );
  } else {
    corpo = (
      <FormularioCorrecao
        key={previa.id}
        monitoramentoId={monitoramentoId}
        previa={previa}
        campos={previa.ficha.schema_campos}
        campoFoco={campoFoco ?? null}
        onFechar={onFechar}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Corrigir monitoramento"
      data-testid="corrigir-monitoramento"
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-warning px-4 py-3 text-warning-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <PenLine className="h-4 w-4" /> Corrigir monitoramento
            {previa?.ficha ? ` — ${previa.ficha.codigo} ${previa.ficha.nome}` : ""}
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{corpo}</div>
      </div>
    </div>
  );
}

function FormularioCorrecao({
  monitoramentoId,
  previa,
  campos,
  campoFoco,
  onFechar,
}: {
  monitoramentoId: string;
  previa: PreviaMonitoramento;
  campos: CampoTemplate[];
  campoFoco: string | null;
  onFechar: () => void;
}) {
  const perfil = useSessionStore((s) => s.perfil)!;
  const corrigir = useCorrigirMonitoramento();
  const [justificativa, setJustificativa] = useState("");
  const [revisao, setRevisao] = useState<{
    dados: FieldValues;
    /** Tudo o que difere do gravado (trilha completa do adendo). */
    correcoes: Record<string, CorrecaoCampo>;
    /** O que o inspetor mexeu. O resto (`correcoes` sem estes) foi preenchido sozinho pelos campos (dado herdado). */
    doInspetor: Record<string, CorrecaoCampo>;
    antesDaEdicao: Record<string, unknown>;
  } | null>(null);
  // Valores no instante da PRIMEIRA mexida do inspetor: alguns campos completam dados sozinhos ao abrir (peso médio, placa, hora de
  // pendura herdados); isso não é correção dele e não deve ser apresentado nem propagado como se fosse.
  const antesDaEdicao = useRef<Record<string, unknown> | null>(null);
  const [assinando, setAssinando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{
    alteradas: number;
    propagados: number;
    erro?: string;
  } | null>(null);

  const valoresGravados = useMemo(() => {
    const base = valoresIniciaisDe(campos) as Record<string, unknown>;
    for (const campo of campos) if (campo.chave in previa.dados_dinamicos) base[campo.chave] = previa.dados_dinamicos[campo.chave];
    return base;
  }, [campos, previa.dados_dinamicos]);

  const { register, control, handleSubmit, formState, getValues } = useForm<FieldValues>({
    resolver: zodResolver(zodFromSchemaCampos(campos)),
    defaultValues: valoresGravados,
  });

  // Partes/lavagem/mini-chillers dependem ao vivo do SPR Carcaças da mesma ficha (peso médio, aves no período).
  const chaveCarcacas = campos.find((c) => c.tipo === "chiller_carcacas")?.chave;
  const carcacasAtual = useWatch({
    control,
    name: chaveCarcacas ?? "__inexistente__",
  }) as ChillerCarcacasValor | undefined;
  const valoresForm = useWatch({ control }) as Record<string, unknown>;
  const camposVisiveis = campos.filter((campo) => !campo.dependeDe || valoresForm?.[campo.dependeDe.campo] === campo.dependeDe.valor);

  const instante = instanteDoRegistro(previa);
  const dia = dataManaus(new Date(instante));

  useEffect(() => {
    if (!campoFoco) return;
    const t = setTimeout(() => document.getElementById(`corrigir-${campoFoco}`)?.scrollIntoView({ block: "center" }), 150);
    return () => clearTimeout(t);
  }, [campoFoco]);

  function revisar(dados: FieldValues) {
    setAviso(null);
    if (justificativa.trim().length < MOTIVO_CORRECAO_MIN_CARACTERES) {
      setAviso(`Informe o motivo da correção (mínimo ${MOTIVO_CORRECAO_MIN_CARACTERES} caracteres).`);
      return;
    }
    const antes = antesDaEdicao.current ?? dados;
    const doInspetor = diffCorrecoes(campos, antes, dados);
    if (Object.keys(doInspetor).length === 0) {
      setAviso("Nenhum valor foi alterado.");
      return;
    }
    setRevisao({ dados, correcoes: diffCorrecoes(campos, previa.dados_dinamicos, dados), doInspetor, antesDaEdicao: antes });
  }

  async function assinar() {
    if (!revisao) return;
    const r = await corrigir.mutateAsync({
      monitoramentoId,
      campos,
      dadosNovos: revisao.dados,
      dadosAntesDaEdicao: revisao.antesDaEdicao,
      justificativa,
      quem: {
        id: perfil.id,
        nivelAcesso: perfil.nivelAcesso,
        nome: perfil.nomeCompleto,
      },
    });
    setAssinando(false);
    setRevisao(null);
    setConcluido({
      alteradas: r.alteradas,
      propagados: r.propagados,
      erro: r.erro,
    });
  }

  if (concluido) {
    return (
      <div className="space-y-4 p-6 text-sm" data-testid="correcao-concluida">
        <p className="rounded-md border border-success bg-success/10 p-3 font-medium">
          Correção assinada: {concluido.alteradas} valor(es) corrigido(s) e os cálculos refeitos. O original fica guardado no histórico e a versão corrigida
          volta para a verificação.
        </p>
        {concluido.propagados > 0 && <p>A correção também foi levada a {concluido.propagados} monitoramento(s) seguinte(s) que usavam o valor anterior.</p>}
        {concluido.erro && (
          <p role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">
            A correção foi gravada, mas não foi possível levá-la aos monitoramentos seguintes: {concluido.erro}
          </p>
        )}
        <Button type="button" onClick={onFechar}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(revisar)}
        className="space-y-5 p-4 sm:p-6"
        // Fase de captura: roda antes dos handlers dos campos, então o valor ainda é o de antes da mexida.
        onChangeCapture={() => {
          antesDaEdicao.current ??= structuredClone(getValues());
        }}
        onKeyDownCapture={() => {
          antesDaEdicao.current ??= structuredClone(getValues());
        }}
        onPointerDownCapture={() => {
          antesDaEdicao.current ??= structuredClone(getValues());
        }}
      >
        <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-xs">
          Altere só o que estiver errado. Os cálculos (%, totais, conformidade) são refeitos enquanto você edita. A correção gera uma{" "}
          <strong>nova versão assinada</strong> do monitoramento; o registro original continua guardado no histórico. Só é possível corrigir antes de o
          Verificador verificar.
        </p>

        {camposVisiveis.map((campo) => (
          <div
            key={campo.chave}
            id={`corrigir-${campo.chave}`}
            className={campo.chave === campoFoco ? "rounded-lg ring-2 ring-warning ring-offset-2" : undefined}
          >
            <DynamicField
              campo={campo}
              register={register}
              errors={formState.errors}
              control={control}
              carcacasAtual={carcacasAtual}
              diaMonitoramento={dia}
              horaMonitoramento={instante}
            />
          </div>
        ))}

        <div className="space-y-1">
          <Label htmlFor="justificativa-correcao">Motivo da correção</Label>
          <Textarea
            id="justificativa-correcao"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: digitei o peso errado; o correto é o da balança às 10h…"
          />
        </div>

        {aviso && (
          <p role="alert" className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" data-testid="revisar-correcao">
            Revisar correção
          </Button>
        </div>
      </form>

      {revisao && !assinando && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Revisar correção">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-xl space-y-3 overflow-y-auto rounded-xl border bg-background p-5 shadow-2xl">
            <h3 className="text-base font-semibold">Confira o que será corrigido</h3>
            <div className="rounded border bg-muted/30 p-2" data-testid="resumo-correcao">
              {Object.entries(revisao.doInspetor).map(([caminho, c]) => (
                <div key={caminho} className="flex flex-wrap items-center gap-2 border-b py-1 text-xs last:border-0">
                  <span className="font-bold text-muted-foreground">{c.rotulo ?? caminho}:</span>
                  <span className="text-down line-through">{textoDoValor(c.old)}</span>
                  <span>→</span>
                  <span className="font-bold text-success">{textoDoValor(c.new)}</span>
                </div>
              ))}
            </div>
            {Object.keys(revisao.correcoes).some((k) => !(k in revisao.doInspetor)) && (
              <div className="rounded border border-dashed p-2 text-[11px] text-muted-foreground" data-testid="resumo-automatico">
                <p className="font-semibold">Completados automaticamente pelo sistema (dados já registrados em outros monitoramentos):</p>
                <ul className="list-disc pl-4">
                  {Object.entries(revisao.correcoes)
                    .filter(([k]) => !(k in revisao.doInspetor))
                    .map(([caminho, c]) => (
                      <li key={caminho}>
                        {c.rotulo ?? caminho}: {textoDoValor(c.old)} → {textoDoValor(c.new)}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <p className="text-xs italic text-muted-foreground">“{justificativa.trim()}”</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRevisao(null)}>
                Voltar e ajustar
              </Button>
              <Button type="button" onClick={() => setAssinando(true)} data-testid="assinar-correcao">
                Assinar correção
              </Button>
            </div>
          </div>
        </div>
      )}

      {assinando && (
        <ModalAssinaturaSenha
          titulo="Assinatura Eletrônica da Correção"
          descricao="Confirme sua senha para assinar a correção: uma nova versão do monitoramento será gravada e voltará para a verificação."
          textoConfirmar="Assinar correção"
          onAssinar={assinar}
          onCancelar={() => setAssinando(false)}
          testId="assinar-correcao-senha"
        />
      )}
    </>
  );
}
