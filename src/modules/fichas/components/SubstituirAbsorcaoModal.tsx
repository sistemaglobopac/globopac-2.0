import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ModalAssinaturaSenha } from "@/shared/ModalAssinaturaSenha";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { useCandidatosSubstituicao, useMarcarSubstituido, useUsuariosMap, type MonitoramentoEmAndamento } from "../api";
import { ordenarCandidatos } from "../fields/substituicaoAbsorcao";
import { ensureLocalTime } from "../utils/tempo";
import { horaEfetiva } from "../utils/horaMonitoramento";

const MOTIVO_MIN = 5;

/** "Este registro foi substituído por outro": o inspetor (ou o colega que assumiu o turno) aponta qual registro finalizado
 * refez a mesma amostra, informa o motivo e confirma com a senha. O registro original não é alterado nem apagado: só deixa
 * de aparecer como pendente, com a marca de quem substituiu, quando e por quê. */
export function SubstituirAbsorcaoModal({ pendente, onFechar }: { pendente: MonitoramentoEmAndamento; onFechar: () => void }) {
  const { data: candidatos, isLoading } = useCandidatosSubstituicao(pendente);
  const { data: nomes } = useUsuariosMap();
  const marcar = useMarcarSubstituido();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pedirSenha, setPedirSenha] = useState(false);

  const ordenados = useMemo(() => ordenarCandidatos(pendente.dados_dinamicos, candidatos ?? []), [pendente.dados_dinamicos, candidatos]);
  const motivoValido = motivo.trim().length >= MOTIVO_MIN;

  if (pedirSenha && escolhido) {
    return (
      <ModalAssinaturaSenha
        titulo="Confirmar substituição"
        descricao="Confirme sua senha para marcar este registro como substituído pelo registro escolhido. O registro original é mantido, apenas deixa de aparecer como pendente."
        textoConfirmar="Marcar como substituído"
        onAssinar={async () => {
          await marcar.mutateAsync({ id: pendente.id, substitutoId: escolhido, motivo: motivo.trim() });
          onFechar();
        }}
        onCancelar={() => setPedirSenha(false)}
        testId="modal-substituir-absorcao"
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Registro substituído por outro" data-testid="substituir-absorcao">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-xl border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Absorção de água em andamento</p>
            <p className="font-semibold">Este registro foi substituído por outro</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="shrink-0 opacity-80 hover:opacity-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          <p className="text-muted-foreground">Escolha o registro já finalizado que refez esta mesma amostra. O sistema destaca os que têm os mesmos pesos iniciais.</p>

          {isLoading && <p className="text-muted-foreground">Carregando…</p>}
          {!isLoading && ordenados.length === 0 && (
            <p className="rounded-md border border-warning bg-warning/10 p-3 text-xs">Nenhum teste de absorção finalizado neste setor depois deste registro.</p>
          )}
          <ul className="space-y-2" role="radiogroup" aria-label="Registro substituto">
            {ordenados.map((c) => {
              const hora = ensureLocalTime(horaEfetiva(c)).time;
              const parecido = c.coincidencia.total > 0 && c.coincidencia.iguais / c.coincidencia.total >= 0.5;
              return (
                <li key={c.id}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 ${escolhido === c.id ? "border-primary bg-primary/5" : "border-hairline"}`}>
                    <input type="radio" name="substituto" className="mt-1" checked={escolhido === c.id} onChange={() => setEscolhido(c.id)} data-testid={`substituto-${c.id}`} />
                    <span className="min-w-0">
                      <span className="block font-bold">
                        {hora} · {nomes?.get(c.user_id) ?? "Inspetor"}
                      </span>
                      <span className={`block text-xs ${parecido ? "font-bold text-success" : "text-muted-foreground"}`}>
                        Mesmos pesos iniciais: {c.coincidencia.iguais} de {c.coincidencia.total}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="space-y-1">
            <Label htmlFor="motivo-substituicao">Motivo (obrigatório)</Label>
            <Textarea id="motivo-substituicao" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pesagem refeita pelo inspetor do turno seguinte" rows={2} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-3">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={!escolhido || !motivoValido} onClick={() => setPedirSenha(true)} data-testid="continuar-substituicao">
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
