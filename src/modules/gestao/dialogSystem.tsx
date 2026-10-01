import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "@/shared/ui/button";

type DialogIcone = "info" | "warning" | "success" | "error";

interface DialogState {
  aberto: boolean;
  modo: "alert" | "confirm";
  titulo: string;
  mensagem: string;
  icone: DialogIcone;
  aoConfirmar?: () => void;
}

interface AppDialogApi {
  alert: (input: { titulo: string; mensagem: string; icone?: DialogIcone }) => void;
  confirm: (input: { titulo: string; mensagem: string; icone?: DialogIcone; aoConfirmar: () => void }) => void;
  /** Atalho para o caso mais comum: mostrar o erro de uma escrita no banco de forma amigável
   * (seção "Dados e Tempo Real": "nunca falhar silenciosamente"). */
  erro: (mensagemOuErro: unknown, titulo?: string) => void;
  sucesso: (mensagem: string, titulo?: string) => void;
}

const DialogContext = createContext<AppDialogApi | null>(null);

const ESTADO_INICIAL: DialogState = { aberto: false, modo: "alert", titulo: "", mensagem: "", icone: "info" };

const ICONE_POR_TIPO: Record<DialogIcone, { Icon: typeof Info; className: string }> = {
  info: { Icon: Info, className: "bg-primary/10 text-primary" },
  warning: { Icon: AlertTriangle, className: "bg-warning/10 text-warning" },
  success: { Icon: CheckCircle2, className: "bg-lime text-primary" },
  error: { Icon: XCircle, className: "bg-destructive/10 text-destructive" },
};

/** Substituto de alert()/confirm() nativos (seção "Sistema de Diálogos") — um único estado,
 * reutilizado por qualquer painel administrativo dentro do Painel de Gestão via
 * useAppDialog(). Escopado ao próprio Painel de Gestão (o provider é montado em
 * PainelGestao.tsx), não precisa ser global ao app inteiro. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<DialogState>(ESTADO_INICIAL);

  const fechar = useCallback(() => setEstado(ESTADO_INICIAL), []);

  const api = useMemo<AppDialogApi>(
    () => ({
      alert: ({ titulo, mensagem, icone = "info" }) => setEstado({ aberto: true, modo: "alert", titulo, mensagem, icone }),
      confirm: ({ titulo, mensagem, icone = "warning", aoConfirmar }) =>
        setEstado({ aberto: true, modo: "confirm", titulo, mensagem, icone, aoConfirmar }),
      erro: (mensagemOuErro, titulo = "Não foi possível concluir") =>
        setEstado({
          aberto: true,
          modo: "alert",
          titulo,
          mensagem: mensagemOuErro instanceof Error ? mensagemOuErro.message : String(mensagemOuErro),
          icone: "error",
        }),
      sucesso: (mensagem, titulo = "Feito!") => setEstado({ aberto: true, modo: "alert", titulo, mensagem, icone: "success" }),
    }),
    []
  );

  const { Icon, className: iconeClassName } = ICONE_POR_TIPO[estado.icone];

  return (
    <DialogContext.Provider value={api}>
      {children}
      {estado.aberto && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-background shadow-2xl">
            <div className="flex items-start gap-3 p-5">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconeClassName}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="text-base font-bold text-ink">{estado.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{estado.mensagem}</p>
              </div>
              <button type="button" onClick={fechar} aria-label="Fechar" className="shrink-0 text-ink opacity-50 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline p-3">
              {estado.modo === "confirm" && (
                <Button type="button" variant="outline" onClick={fechar}>
                  Cancelar
                </Button>
              )}
              <Button
                type="button"
                onClick={() => {
                  if (estado.modo === "confirm") estado.aoConfirmar?.();
                  fechar();
                }}
              >
                {estado.modo === "confirm" ? "Confirmar" : "OK"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useAppDialog precisa estar dentro de <DialogProvider>");
  return ctx;
}
