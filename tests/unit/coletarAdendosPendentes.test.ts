import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { coletarAdendosPendentes } from "@/modules/bordo/api";
import { idsAdendosConcluidos } from "@/modules/fichas/utils/adendosPendentes";

const adendo = (id: string, monitorId: string, status = "pending_monitor") => ({
  id,
  status,
  monitorId,
  verificadorName: "Andressa",
  notes: "Corrigir o horário",
  corrections: { campo: { old: "1", new: "2" } },
});
const registro = (id: string, adendos: unknown[]) => ({ id, dados_dinamicos: { adendos } as Record<string, unknown> });

describe("adendos que chegam ao inspetor", () => {
  it("o pedido de um registro ANTIGO (fora dos 50 mais recentes) chega: basta o registro estar na lista buscada no servidor", () => {
    const antigo = registro("antigo", [adendo("a1", "leidiane")]);
    const r = coletarAdendosPendentes([antigo], new Set(), "leidiane");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "a1", monitoramentoId: "antigo", verificadorName: "Andressa", notes: "Corrigir o horário" });
  });

  it("só os adendos destinados a ele (monitorId) e ainda pendentes", () => {
    const registros = [registro("r1", [adendo("a1", "leidiane"), adendo("a2", "kauan"), adendo("a3", "leidiane", "completed")])];
    expect(coletarAdendosPendentes(registros, new Set(), "leidiane").map((a) => a.id)).toEqual(["a1"]);
  });

  it("o adendo já assinado (concluído por um aditivo) deixa de ser pendência, mesmo que o original continue 'pending_monitor'", () => {
    const original = registro("r1", [adendo("a1", "leidiane")]);
    const aditivo = { aditivo_de: "r1", dados_dinamicos: { adendos: [adendo("a1", "leidiane", "completed")] } };
    const concluidos = idsAdendosConcluidos([original, aditivo]);
    expect(coletarAdendosPendentes([original], concluidos, "leidiane")).toEqual([]);
  });

  it("registro sem adendos ou com dado inesperado é ignorado", () => {
    const registros = [{ id: "x", dados_dinamicos: null }, { id: "y", dados_dinamicos: { adendos: "texto" } as Record<string, unknown> }, registro("z", [])];
    expect(coletarAdendosPendentes(registros, new Set(), "leidiane")).toEqual([]);
  });
});
