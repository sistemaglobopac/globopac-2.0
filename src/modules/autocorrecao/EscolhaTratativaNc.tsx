import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface EscolhaTratativaNcProps {
  /** Abre o registro da autocorreção imediata (caminho preferido). */
  onAutocorrigir: () => void;
  /** Vai para a abertura da RNC (última opção). */
  onRnc: () => void;
  /** Fecha sem tratar agora. */
  onDepois: () => void;
  /** Sem conexão: a autocorreção e a RNC dependem do registro já estar no servidor. */
  desabilitado?: boolean;
  /** Rótulo do botão da RNC (a tela do Painel de Bordo usa "Emitir RNC"). */
  rotuloRnc?: string;
}

/** Escolha da tratativa de um monitoramento finalizado NÃO CONFORME. A autocorreção imediata é o caminho preferido (o desvio é
 * corrigido na hora e o relatório registra isso), por isso ocupa o destaque da tela; a RNC fica como alternativa discreta, para
 * quando a ação imediata não resolveu. */
export function EscolhaTratativaNc({ onAutocorrigir, onRnc, onDepois, desabilitado = false, rotuloRnc = "Emitir RNC agora" }: EscolhaTratativaNcProps) {
  return (
    <div className="space-y-3" data-testid="escolha-tratativa-nc">
      <div className="space-y-2 rounded-xl border-2 border-success bg-success/10 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-success-foreground">Recomendado</span>
          <p className="text-sm font-bold text-ink">Já corrigiu o problema na hora?</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Registre a <strong>autocorreção imediata</strong>: a ação executada fica no relatório e a não conformidade é sanada <strong>sem abrir RNC</strong>.
        </p>
        <Button
          type="button"
          size="lg"
          className="h-12 w-full bg-success text-base font-bold text-success-foreground shadow-md hover:bg-success/90"
          disabled={desabilitado}
          onClick={onAutocorrigir}
          data-testid="nc-autocorrecao-imediata"
        >
          <ShieldCheck className="h-5 w-5" />
          Autocorreção imediata
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={onDepois}>
          Depois
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 border-destructive/40 text-xs font-medium text-destructive hover:bg-destructive/10"
          disabled={desabilitado}
          onClick={onRnc}
          data-testid="nc-emitir-rnc"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {rotuloRnc}
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Use a RNC só quando a ação imediata não restabelecer a conformidade.</p>
    </div>
  );
}
