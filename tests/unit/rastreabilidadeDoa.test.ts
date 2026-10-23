import { describe, expect, it } from "vitest";
import {
  doaPercentual,
  cargaAguardando,
  doaVazio,
  herdarComRegistradas,
  montarCargas,
  montarValorDoa,
  motivosBloqueioDoa,
  notaCorrecaoSaldo,
  ordenarPorInicioAbate,
  semCargasApagadas,
  type CargaHerdadaDoa,
} from "@/modules/fichas/fields/rastreabilidadeDoa";
import type { CargaDoa } from "@/modules/fichas/fields/tiposCompostos";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import { temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import type { CampoTemplate } from "@/shared/schema-campos";

function carga(id: string, pendura: string, qtd = 1000, placa = "ABC1D23"): CargaHerdadaDoa {
  return { cargaId: id, gta: `GTA-${id}`, integrado: "João", aviario: "12", nucleo: "3", qtdPrevista: qtd, placa, penduraInicioEm: pendura };
}

describe("DOA — percentual", () => {
  it("mortas ÷ recebidas, duas casas", () => {
    expect(doaPercentual(15, 1000)).toBe(1.5);
    expect(doaPercentual(1, 3)).toBe(33.33);
    expect(doaPercentual(0, 500)).toBe(0);
  });

  it("sem recebidas ou dado faltando não calcula", () => {
    expect(doaPercentual(1, 0)).toBeNull();
    expect(doaPercentual(null, 100)).toBeNull();
    expect(doaPercentual(1, null)).toBeNull();
  });
});

describe("DOA — nota de correção de saldo", () => {
  it("exatamente a quantidade da GTA: sem nota", () => {
    expect(notaCorrecaoSaldo(1000, 1000)).toBeNull();
  });

  it("pelo menos 1 ave a mais exige correção", () => {
    expect(notaCorrecaoSaldo(1000, 1001)).toMatch(/1 ave a mais.*correção do saldo/);
    expect(notaCorrecaoSaldo(1000, 1050)).toMatch(/50 aves a mais/);
  });

  it("10% a menos (ou mais) exige correção; 9,9% não", () => {
    expect(notaCorrecaoSaldo(1000, 900)).toMatch(/100 aves a menos \(10%\).*correção do saldo/);
    expect(notaCorrecaoSaldo(1000, 500)).not.toBeNull();
    expect(notaCorrecaoSaldo(1000, 901)).toBeNull();
    expect(notaCorrecaoSaldo(12000, 10800)).not.toBeNull();
    expect(notaCorrecaoSaldo(12000, 10801)).toBeNull();
  });

  it("sem recebidas informadas não gera nota", () => {
    expect(notaCorrecaoSaldo(1000, null)).toBeNull();
  });
});

describe("DOA — montagem das cargas do dia", () => {
  const herdadas = [carga("B", "2026-10-02T06:30"), carga("A", "2026-10-02T05:10"), carga("C", "")];

  it("ordena pela hora de início da pendura e numera 1, 2…", () => {
    const linhas = montarCargas(herdadas, { A: { avesRecebidas: "1000", avesMortas: "5" } });
    expect(linhas.map((l) => [l.gta, l.ordemPendura])).toEqual([["GTA-A", 1], ["GTA-B", 2], ["GTA-C", null]]);
  });

  it("todas as cargas programadas entram; a que não chegou fica no fim, aguardando chegada", () => {
    const linhas = montarCargas(herdadas, {});
    expect(linhas.map((l) => l.cargaId)).toEqual(["A", "B", "C"]);
    const c = linhas.find((l) => l.cargaId === "C")!;
    expect(c.ordemPendura).toBeNull();
    expect(cargaAguardando(c)).toBe(true);
    expect(cargaAguardando(linhas[0]!)).toBe(false);
    const digitada = montarCargas(herdadas, { C: { avesRecebidas: "10", avesMortas: "" } }).find((l) => l.cargaId === "C")!;
    expect(cargaAguardando(digitada)).toBe(false);
  });

  it("herda GTA, veículo, início e previstas; calcula % e nota por carga", () => {
    const [a] = montarCargas([carga("A", "2026-10-02T05:10", 1000, "XYZ9K88")], { A: { avesRecebidas: "880", avesMortas: "22" } });
    expect(a).toMatchObject({ placa: "XYZ9K88", qtdPrevista: 1000, penduraInicioEm: "2026-10-02T05:10", doaPct: 2.5, saldoDiferenca: -120 });
    expect(a!.notaSaldo).toMatch(/a menos/);
  });

  it("mantém linha salva cuja carga saiu da programação", () => {
    const salva = montarCargas([carga("Z", "2026-10-02T04:00")], { Z: { avesRecebidas: "100", avesMortas: "1" } });
    const linhas = montarCargas([carga("A", "2026-10-02T05:10")], {}, salva);
    expect(linhas.map((l) => l.cargaId).sort()).toEqual(["A", "Z"]);
  });

  it("total do dia soma só as cargas completas", () => {
    const linhas = montarCargas(herdadas, { A: { avesRecebidas: "1000", avesMortas: "10" }, B: { avesRecebidas: "500", avesMortas: "" } });
    const v = montarValorDoa("2026-10-02", linhas);
    expect(v).toMatchObject({ totalRecebidas: 1000, totalMortas: 10, doaTotalPct: 1, conformidade: true, detalhesRNC: null });
  });
});

describe("DOA — bloqueio de assinatura", () => {
  const campos: CampoTemplate[] = [{ chave: "doa", tipo: "rastreabilidade_doa", obrigatorio: true }];

  it("sem nenhuma carga bloqueia", () => {
    expect(motivosBloqueioDoa(doaVazio("2026-10-02"))).toHaveLength(1);
    expect(motivosDeBloqueioSpr(campos, { doa: null })).toHaveLength(1);
  });

  it("informa parcialmente: carga sem nada digitado (aguardando ou já pendurada) não trava o que já foi apurado", () => {
    const programadas = [carga("A", "2026-10-02T05:10"), carga("B", "2026-10-02T06:10"), carga("C", "")];
    const parcial = montarValorDoa("2026-10-02", montarCargas(programadas, { A: { avesRecebidas: "1000", avesMortas: "2" } }));
    expect(parcial.cargas).toHaveLength(3);
    expect(motivosBloqueioDoa(parcial)).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { doa: parcial })).toEqual([]);
    // a soma do dia conta só a carga informada
    expect(parcial).toMatchObject({ totalRecebidas: 1000, totalMortas: 2 });
  });

  it("sem nenhuma carga informada não há o que assinar", () => {
    const nenhuma = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10"), carga("C", "")], {}));
    expect(motivosBloqueioDoa(nenhuma)).toHaveLength(1);
    expect(motivosBloqueioDoa(nenhuma)[0]).toMatch(/ao menos uma carga/);
  });

  it("carga começada pela metade (só recebidas ou só mortas) continua travando", () => {
    const v = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10"), carga("B", "2026-10-02T06:10"), carga("C", "")], { A: { avesRecebidas: "1000", avesMortas: "1" }, C: { avesRecebidas: "10", avesMortas: "" } }));
    // B (nada digitado) não trava; C (recebidas sem mortas): 1 falta.
    expect(motivosBloqueioDoa(v)).toHaveLength(1);
    const soMortas = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10")], { A: { avesRecebidas: "", avesMortas: "3" } }));
    expect(motivosBloqueioDoa(soMortas)).toHaveLength(1);
  });

  it("sem as apurações anteriores do dia carregadas não se assina: o monitoramento tem de herdá-las", () => {
    const v = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10")], { A: { avesRecebidas: "1000", avesMortas: "1" } }));
    expect(motivosBloqueioDoa({ ...v, aguardandoApuracoesAnteriores: true })[0]).toMatch(/apurações anteriores/);
    expect(motivosDeBloqueioSpr(campos, { doa: { ...v, aguardandoApuracoesAnteriores: true } })).toHaveLength(1);
    expect(motivosBloqueioDoa(v)).toEqual([]);
  });

  it("carga informada exige recebidas e mortas (zero vale)", () => {
    const completo = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10")], { A: { avesRecebidas: "1000", avesMortas: "0" } }));
    expect(motivosBloqueioDoa(completo)).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { doa: completo })).toEqual([]);
  });

  it("mortas maiores que recebidas bloqueia", () => {
    const v = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10")], { A: { avesRecebidas: "10", avesMortas: "11" } }));
    expect(motivosBloqueioDoa(v).join(" ")).toMatch(/maior que as recebidas/);
  });

  it("DOA e divergência de saldo não tornam o registro não conforme", () => {
    const v = montarValorDoa("2026-10-02", montarCargas([carga("A", "2026-10-02T05:10")], { A: { avesRecebidas: "1200", avesMortas: "300" } }));
    expect(temNaoConformidade({ doa: v })).toBe(false);
  });
});

describe("herdarComRegistradas", () => {
  const fresca = { cargaId: "c1", gta: "G1", integrado: "J", aviario: "1", nucleo: "", qtdPrevista: 1000, placa: "", pesoMedioKg: "", penduraInicioEm: "2026-10-03T05:40" };

  it("carga já gravada (travada) mantém o peso gravado, inclusive o corrigido por adendo", () => {
    const anterior = { pesoMedioKg: "2,85", placa: "AAA1A11" } as CargaDoa;
    expect(herdarComRegistradas({ ...fresca, pesoMedioKg: "2,5", placa: "BBB2B22" }, anterior)).toMatchObject({ pesoMedioKg: "2,85", placa: "AAA1A11" });
  });

  it("carga já gravada mantém o início da pendura (hora do abate) corrigido por adendo e a ordem segue a hora corrigida", () => {
    const anterior = { penduraInicioEm: "2026-10-03T07:10" } as CargaDoa;
    const herdada = herdarComRegistradas({ ...fresca, penduraInicioEm: "2026-10-03T05:40" }, anterior);
    expect(herdada.penduraInicioEm).toBe("2026-10-03T07:10");
    const outra = { ...fresca, cargaId: "c2", gta: "G2", penduraInicioEm: "2026-10-03T06:30" };
    const linhas = montarCargas([herdada, outra], {});
    expect(linhas.map((l) => l.cargaId)).toEqual(["c2", "c1"]);
  });

  it("início da pendura gravado vazio usa o herdado fresco", () => {
    expect(herdarComRegistradas(fresca, { penduraInicioEm: "" } as CargaDoa).penduraInicioEm).toBe("2026-10-03T05:40");
  });

  it("carga travada sem peso gravado usa o herdado fresco", () => {
    expect(herdarComRegistradas({ ...fresca, pesoMedioKg: "2,5" }, { pesoMedioKg: "" } as CargaDoa)).toMatchObject({ pesoMedioKg: "2,5" });
  });

  it("carga editável usa o herdado fresco e cai no gravado da própria ficha se faltar", () => {
    expect(herdarComRegistradas({ ...fresca, pesoMedioKg: "2,5" }, undefined, { pesoMedioKg: "2,9" } as CargaDoa).pesoMedioKg).toBe("2,5");
    expect(herdarComRegistradas(fresca, undefined, { pesoMedioKg: "2,9" } as CargaDoa).pesoMedioKg).toBe("2,9");
  });
});

describe("DOA — ordem pelo início do abate", () => {
  const linha = (cargaId: string, penduraInicioEm: string, ordemPendura: number | null) => ({ cargaId, penduraInicioEm, ordemPendura });

  it("a carga informada por último, com abate no meio, se encaixa e a numeração é refeita", () => {
    const gravadas = [linha("A", "2026-10-08T05:10", 1), linha("B", "2026-10-08T07:30", 2), linha("C", "2026-10-08T06:20", 3)];
    expect(ordenarPorInicioAbate(gravadas).map((c) => [c.cargaId, c.ordemPendura])).toEqual([["A", 1], ["C", 2], ["B", 3]]);
  });

  it("sem horário vai para o fim, sem número, na ordem em que veio", () => {
    const r = ordenarPorInicioAbate([linha("X", "", null), linha("B", "2026-10-08T07:30", 1), linha("Y", "", null), linha("A", "2026-10-08T05:10", 2)]);
    expect(r.map((c) => [c.cargaId, c.ordemPendura])).toEqual([["A", 1], ["B", 2], ["X", null], ["Y", null]]);
  });

  it("compara o instante, não o texto: formatos diferentes e virada de dia ordenam certo", () => {
    const r = ordenarPorInicioAbate([
      linha("T", "2026-10-09T01:00", 1), // madrugada do dia seguinte
      linha("U", "2026-10-08T23:30:00-04:00", 2),
      linha("V", "2026-10-09T03:15:00.000Z", 3), // 23:15 em Manaus
    ]);
    expect(r.map((c) => c.cargaId)).toEqual(["V", "U", "T"]);
  });

  it("montarCargas aplica a mesma regra (carga com pendura registrada depois entra na posição do horário)", () => {
    const l = montarCargas([carga("A", "2026-10-08T05:10"), carga("B", "2026-10-08T07:30"), carga("C", "2026-10-08T06:20")], {});
    expect(l.map((c) => [c.cargaId, c.ordemPendura])).toEqual([["A", 1], ["C", 2], ["B", 3]]);
  });
});

describe("carga apagada da programação sai do DOA", () => {
  const cargas = [{ cargaId: "a" }, { cargaId: "b" }, { cargaId: "c" }];
  it("mantém só as cargas que ainda existem; sem resposta da consulta não esconde nada", () => {
    expect(semCargasApagadas(cargas, new Set(["a", "c"]))).toEqual([{ cargaId: "a" }, { cargaId: "c" }]);
    expect(semCargasApagadas(cargas, new Set())).toEqual([]);
    expect(semCargasApagadas(cargas, undefined)).toEqual(cargas);
  });
});
