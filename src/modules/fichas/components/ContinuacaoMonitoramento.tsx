import { History } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { CONTINUACAO_JANELA_HORAS, type RegistroContinuavel } from "../api";

export const MOTIVO_CONTINUACAO_MIN_CARACTERES = 10;

const formatar = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", dateStyle: "short", timeStyle: "short" });

interface Props {
  registro: RegistroContinuavel;
  ativo: boolean;
  motivo: string;
  onMotivo: (motivo: string) => void;
  onAtivar: () => void;
  onCancelar: () => void;
}

/** Quando o turno/dia anterior terminou antes do lançamento (ou o sistema falhou), o monitoramento de
 * hoje pode ser registrado como CONTINUAÇÃO do último de ontem: herda as leituras anteriores dele e
 * grava, no registro assinado, a referência e o motivo. A data do registro continua sendo a real. */
export function ContinuacaoMonitoramento({ registro, ativo, motivo, onMotivo, onAtivar, onCancelar }: Props) {
  return (
    <section className="space-y-2 rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm" data-testid="continuacao-monitoramento">
      <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
        <History className="h-4 w-4" /> Continuação de monitoramento anterior
      </h3>
      {!ativo ? (
        <>
          <p className="text-xs text-muted-foreground">
            O último monitoramento desta ficha foi em <strong>{formatar(registro.criado_em)}</strong> (nas últimas {CONTINUACAO_JANELA_HORAS}h). Se este registro dá
            continuidade a ele (turno encerrado, falha do sistema), herde as leituras anteriores.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onAtivar}>
            Continuar do monitoramento de {formatar(registro.criado_em)}
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs">
            Este registro será gravado como <strong>continuação</strong> do monitoramento de <strong>{formatar(registro.criado_em)}</strong>. As leituras anteriores
            foram herdadas dele.
          </p>
          <Textarea
            value={motivo}
            onChange={(e) => onMotivo(e.target.value)}
            placeholder="Motivo da continuação (obrigatório). Ex.: turno encerrado antes do lançamento; falha do sistema."
            rows={2}
            aria-label="Motivo da continuação"
          />
          <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar continuação
          </Button>
        </>
      )}
    </section>
  );
}
