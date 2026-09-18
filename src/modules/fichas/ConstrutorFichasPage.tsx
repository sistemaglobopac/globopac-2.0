import { useSetoresCadastrados } from "@/modules/admin/api";
import { ConstrutorFichas } from "./ConstrutorFichas";

/** Página de rota: resolve `setoresDisponiveis` a partir de app_config.setores_cadastrados
 * (única fonte de verdade de setores de inspeção) e injeta como prop no builder, que em si
 * não sabe de onde os setores vêm. */
export function ConstrutorFichasPage() {
  const { data: setoresDisponiveis, isLoading } = useSetoresCadastrados();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return <ConstrutorFichas setoresDisponiveis={setoresDisponiveis ?? []} />;
}
