import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ChillerCarcacasField } from "@/modules/fichas/fields/ChillerCarcacasField";
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";
import type { CampoTemplate } from "@/shared/schema-campos";
import { desviosEspeciais, temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";

// O SPR Carcaças herda cargas via React Query (consulta ao Supabase): nestes testes não há
// QueryClientProvider nem rede, então as consultas viram respostas vazias.
vi.mock("@/modules/recepcao/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recepcao/api")>()),
  useCargasRastreabilidade: () => ({ data: [] }),
  useCargasJaMonitoradas: () => ({ data: new Set<string>() }),
}));

const t = (cur: string) => ({ prev: "", cur, ice: "0" });
const anterior = { tanques: { preChiller: t("100"), chiller1: t("50"), chiller2: t("30") } } as unknown as ChillerCarcacasValor;

let ultimo: ChillerCarcacasValor | undefined;
function Campo() {
  const [, setV] = useState<ChillerCarcacasValor>();
  return (
    <ChillerCarcacasField
      value={undefined}
      prevAppointment={anterior}
      onChange={(v) => {
        ultimo = v;
        setV(v);
      }}
    />
  );
}

describe("vazão não conforme chega ao detector de desvios (modal de confirmação / alerta de RNC)", () => {
  it("SPR Carcaças abaixo da meta: o widget grava conformidade=false e o desvio é detectado", async () => {
    const user = userEvent.setup();
    render(<Campo />);
    await user.type(screen.getAllByPlaceholderText("Ex: 4500")[0]!, "3900");
    await user.type(screen.getAllByPlaceholderText("Ex: 2,850")[0]!, "2520");
    // Pré-chiller: leitura atual só 1 m³ acima da anterior → água muito abaixo da meta.
    await user.type(screen.getAllByPlaceholderText("Ex: 3718,72")[1]!, "101");

    expect(ultimo?.conformidade).toBe(false);
    const campos = [{ chave: "carcacas", tipo: "chiller_carcacas", obrigatorio: true, label: "SPR Carcaças" }] as CampoTemplate[];
    expect(desviosEspeciais(campos, { carcacas: ultimo })).toHaveLength(1);
    expect(temNaoConformidade({ carcacas: ultimo })).toBe(true);
  });
});
