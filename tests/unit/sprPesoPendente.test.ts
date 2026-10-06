import { describe, expect, it } from "vitest";
import { lotesSemPeso, motivosPreenchimentoCarcacas } from "@/modules/fichas/fields/preenchimentoSpr";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import type { CampoTemplate } from "@/shared/schema-campos";
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

const tanque = (prev: string, cur: string) => ({ prev, cur, ice: "0" });
const valor = (cargas: ChillerCarcacasValor["cargas"]): ChillerCarcacasValor =>
  ({
    cargas,
    tanques: { preChiller: tanque("100", "110"), chiller1: tanque("50", "60"), chiller2: tanque("30", "40") },
    condenasParcial: "0",
    condenasTotal: "0",
    totalAves: 100,
    totalAvesBruto: 100,
    pesoMedioCarcaca: 0,
    conformidade: true,
    detalhesRNC: null,
  }) as ChillerCarcacasValor;

describe("SPR Carcaças aguardando o peso das cargas (etapa 1)", () => {
  it("lotesSemPeso: só lote com aves e sem peso vivo; lote em branco e com peso não contam", () => {
    const v = valor([
      { id: "1", quantity: "5000", avgLiveWeight: "2.900", cargaId: "a", gta: "1" },
      { id: "2", quantity: "3000", avgLiveWeight: "", cargaId: "b", gta: "2" },
      { id: "3", quantity: "", avgLiveWeight: "" },
    ]);
    expect(lotesSemPeso(v).map((l) => l.id)).toEqual(["2"]);
    expect(lotesSemPeso(undefined)).toEqual([]);
    expect(lotesSemPeso(valor([{ id: "1", quantity: "10", avgLiveWeight: "2,9" }]))).toEqual([]);
  });

  it("bloqueio: o peso vivo em branco só é aceito na etapa 1", () => {
    const v = valor([{ id: "1", quantity: "5000", avgLiveWeight: "", cargaId: "a", gta: "1" }]);
    expect(motivosPreenchimentoCarcacas(v).some((m) => m.includes("Peso Vivo"))).toBe(true);
    expect(motivosPreenchimentoCarcacas(v, { permitirPesoPendente: true }).some((m) => m.includes("Peso Vivo"))).toBe(false);
    // o resto continua exigido na etapa 1: quantidade de aves, condenas
    const semAves = valor([{ id: "1", quantity: "", avgLiveWeight: "" }]);
    expect(motivosPreenchimentoCarcacas(semAves, { permitirPesoPendente: true }).some((m) => m.includes("Aves"))).toBe(true);
  });

  it("Partes e Miúdos esperam o peso de carcaça: a etapa 1 não os bloqueia por isso", () => {
    const campos = [
      { chave: "p", tipo: "chiller_partes", obrigatorio: true, label: "Partes" },
      { chave: "m", tipo: "mini_chillers", obrigatorio: true, label: "Miúdos" },
    ] as CampoTemplate[];
    const dados = {
      p: { tanques: { chiller1: tanque("1", "2"), chiller2: tanque("1", "2") }, pesoCarcacaIndisponivel: true },
      m: { tanques: { coracao: tanque("1", "2"), moela: tanque("1", "2"), figado: tanque("1", "2"), cabeca: tanque("1", "2"), pes: tanque("1", "2") }, pesoMiudoIndisponivel: true },
    };
    expect(motivosDeBloqueioSpr(campos, dados).filter((m) => m.includes("peso médio")).length).toBe(2);
    expect(motivosDeBloqueioSpr(campos, dados, { permitirPesoPendente: true }).filter((m) => m.includes("peso médio"))).toEqual([]);
  });
});
