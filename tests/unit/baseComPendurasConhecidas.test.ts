import { describe, expect, it } from "vitest";
import { baseParaProximo, calcularPeriodo, corrigirBaseComPendurasConhecidas, type CargaDoDia } from "@/modules/fichas/fields/cargasDoPeriodo";

// Caso real de 07/10/2026 (Manaus = UTC-4): a GTA 052610 (3.591 aves) começou a pendura às 11:55, mas a pendura só foi
// registrada depois do monitoramento das 11:50 — que estimou 2.693 aves dela pelo andamento da linha, que na verdade
// estava parada desde o fim da carga 052607.
const carga = (id: string, qtd: number, pendura: string | null): CargaDoDia => ({ carga_id: id, gta: id, qtd_aves: qtd, pendura_inicio_em: pendura, peso_medio_kg: null });
const manaus = (hhmm: string) => new Date(`2026-10-07T${hhmm}:00-04:00`);

const anteriores = [carga("052597", 3591, "2026-10-07T10:07"), carga("052607", 3780, "2026-10-07T10:39")];
const semPendura = [...anteriores, carga("052610", 3591, null), carga("052614", 4104, null)];
const registradas = [...anteriores, carga("052610", 3591, "2026-10-07T11:55"), carga("052614", 4104, "2026-10-07T13:09")];

describe("base do monitoramento anterior corrigida pelas penduras já registradas", () => {
  const anterior = calcularPeriodo(semPendura, manaus("11:50"), {}).chegada;

  it("reproduz o problema: o anterior contou aves de uma carga que ainda não tinha começado", () => {
    expect(anterior.porCarga.find((c) => c.cargaId === "052610")?.aves).toBeGreaterThan(2000);
  });

  it("sem a correção só entra o restante da carga; com a correção entram todas as aves da carga", () => {
    const base = baseParaProximo(anterior);
    const sem = calcularPeriodo(registradas, manaus("13:50"), base);
    const com = calcularPeriodo(registradas, manaus("13:50"), corrigirBaseComPendurasConhecidas(base, registradas, anterior.corteEm));
    expect(sem.lotes.find((l) => l.cargaId === "052610")?.aves).toBeLessThan(1500);
    const lote = com.lotes.find((l) => l.cargaId === "052610");
    expect(lote).toMatchObject({ aves: 3591, completa: true });
  });

  it("não mexe em carga que já tinha começado antes do corte do anterior", () => {
    const base = { "052597": 3591, "052607": 3780, "052610": 100 };
    const corte = manaus("11:36").toISOString();
    const c = corrigirBaseComPendurasConhecidas(base, registradas, corte);
    expect(c).toEqual({ "052597": 3591, "052607": 3780 });
    expect(corrigirBaseComPendurasConhecidas(base, registradas, undefined)).toBe(base);
  });
});
