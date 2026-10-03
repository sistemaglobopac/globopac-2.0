import { DialogProvider } from "@/modules/gestao/dialogSystem";
import { ComunicadosPanel } from "@/modules/gestao/admin/ComunicadosPanel";

/** Rota /comunicados (menu lateral do Verificador): mesmo painel de comunicados do Painel de Gestão. */
export function ComunicadosPage() {
  return (
    <DialogProvider>
      <div className="gs-scope">
        <ComunicadosPanel />
      </div>
    </DialogProvider>
  );
}
