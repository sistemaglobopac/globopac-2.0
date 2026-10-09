import { describe, expect, it } from "vitest";
import { montarConferencia, resumirConferencia } from "@/modules/recepcao/conferenciaCargas";
import type { CargaRastreabilidade } from "@/modules/recepcao/api";

const c = (id: string, parcial: Partial<CargaRastreabilidade> = {}): CargaRastreabilidade => ({
  carga_id: id,
  gta: `G${id}`,
  integrado: "João",
  aviario: "1",
  nucleo: "",
  qtd_aves: 1000,
  placa: null,
  pendura_inicio_em: null,
  monitoramento_id: null,
  peso_medio_kg: null,
  ...parcial,
});

describe("conferência das cargas do dia", () => {
  const cargas = [
    c("a", { pendura_inicio_em: "2026-10-09T05:10", peso_medio_kg: "2,8", placa: "ABC1D23" }),
    c("b", { pendura_inicio_em: "2026-10-09T06:00" }),
    c("c"),
  ];
  const doa = new Map([["a", { avesRecebidas: "1000", avesMortas: "5", doaPct: 0.5 }]]);
  const linhas = montarConferencia(cargas, new Set(["a", "b"]), new Set(["a", "b"]), doa);

  it("lista todas as cargas programadas, na ordem recebida", () => {
    expect(linhas.map((l) => l.cargaId)).toEqual(["a", "b", "c"]);
  });

  it("carga completa não tem faltas", () => {
    expect(linhas[0]!.faltas).toEqual([]);
    expect(linhas[0]).toMatchObject({ recepcaoFeita: true, pesoCaixaFeito: true, doaApurada: true, doaPct: 0.5 });
  });

  it("peso por caixa feito sem peso médio (balança) e sem DOA aparece como falta", () => {
    expect(linhas[1]!.faltas).toEqual(["peso médio (aguardando a balança)", "DOA"]);
  });

  it("carga que não chegou: falta tudo", () => {
    expect(linhas[2]!.faltas).toEqual(["Recepção de Aves (transporte e jejum)", "Peso por Caixa (densidade)", "DOA"]);
  });

  it("DOA só vale apurada com aves recebidas e mortas informadas", () => {
    const meia = montarConferencia([c("a")], new Set(["a"]), new Set(["a"]), new Map([["a", { avesRecebidas: "10", avesMortas: "", doaPct: null }]]));
    expect(meia[0]!.doaApurada).toBe(false);
  });

  it("resume o dia", () => {
    expect(resumirConferencia(linhas)).toEqual({ total: 3, completas: 1, comPendencia: 2, semPesoMedio: 2, semPendura: 1 });
  });
});
