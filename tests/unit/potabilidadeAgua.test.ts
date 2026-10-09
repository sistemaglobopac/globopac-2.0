import { describe, expect, it } from "vitest";
import {
  avaliarPotabilidade,
  lerMedida,
  montarValorPotabilidade,
  motivosBloqueioPotabilidade,
  potabilidadeInicial,
  proximoTanque,
  reiniciarSorteio,
  SISTEMAS_POTABILIDADE,
  sortearOutroTanque,
  todosTanquesParados,
} from "@/modules/fichas/fields/potabilidadeAgua";
import type { PotabilidadeAguaValor } from "@/modules/fichas/fields/tiposCompostos";

function preenchido(ph = "7", cloro = "1"): PotabilidadeAguaValor {
  const v = potabilidadeInicial();
  for (const s of SISTEMAS_POTABILIDADE) v.sistemas[s.chave] = { ...v.sistemas[s.chave], ph, cloro };
  return v;
}

describe("rodízio de tanques", () => {
  it("o primeiro monitoramento começa pelo primeiro tanque de cada sistema", () => {
    const v = potabilidadeInicial();
    expect(v.sistemas.carcacas.tanque).toBe("preChiller");
    expect(v.sistemas.partes.tanque).toBe("chillerPartes1");
    expect(v.sistemas.miudos.tanque).toBe("miniFigado");
  });

  it("avança para o seguinte e nunca repete o do monitoramento anterior", () => {
    let atual = potabilidadeInicial();
    for (let i = 0; i < 12; i += 1) {
      const proximo = potabilidadeInicial(atual);
      for (const s of SISTEMAS_POTABILIDADE) expect(proximo.sistemas[s.chave].tanque).not.toBe(atual.sistemas[s.chave].tanque);
      atual = proximo;
    }
  });

  it("passa por todos os tanques de cada sistema antes de repetir", () => {
    for (const s of SISTEMAS_POTABILIDADE) {
      const vistos = new Set<string>();
      let tanque = proximoTanque(s.chave, undefined);
      for (let i = 0; i < s.tanques.length; i += 1) {
        vistos.add(tanque);
        tanque = proximoTanque(s.chave, tanque);
      }
      expect(vistos.size).toBe(s.tanques.length);
    }
  });

  it("volta ao primeiro depois do último e tolera tanque anterior desconhecido", () => {
    expect(proximoTanque("carcacas", "chiller2")).toBe("preChiller");
    expect(proximoTanque("miudos", "miniPes")).toBe("miniFigado");
    expect(proximoTanque("partes", "inexistente")).toBe("chillerPartes1");
  });
});

describe("limites de pH e cloro", () => {
  it("lê medida com vírgula ou ponto; vazio é null", () => {
    expect(lerMedida("6,5")).toBe(6.5);
    expect(lerMedida("")).toBeNull();
    expect(lerMedida("x")).toBeNull();
  });

  it("limites são inclusivos: pH 6,0 a 9,0 e cloro 0,2 a 5,0 ppm", () => {
    expect(avaliarPotabilidade(preenchido("6", "0,2")).conformidade).toBe(true);
    expect(avaliarPotabilidade(preenchido("9", "5")).conformidade).toBe(true);
  });

  it("pH ou cloro fora do limite é não conforme, indicando sistema e tanque", () => {
    const v = preenchido();
    v.sistemas.carcacas.ph = "5,9";
    v.sistemas.partes.cloro = "5,1";
    v.sistemas.miudos.cloro = "0,1";
    v.sistemas.miudos.ph = "9,1";
    const r = avaliarPotabilidade(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toHaveLength(4);
    expect(r.motivos[0]).toContain("Carcaças — Pré-chiller: pH 5,9");
    expect(montarValorPotabilidade(v).detalhesRNC).toMatch(/^Potabilidade da água fora do limite — /);
  });

  it("bloqueia a assinatura enquanto faltar pH ou cloro de algum sistema", () => {
    expect(motivosBloqueioPotabilidade(undefined)).toHaveLength(1);
    expect(motivosBloqueioPotabilidade(preenchido())).toEqual([]);
    const v = preenchido();
    v.sistemas.partes.ph = "";
    v.sistemas.miudos.cloro = "";
    expect(motivosBloqueioPotabilidade(v)).toHaveLength(2);
  });
});

describe("tanque parado: refazer o sorteio", () => {
  it("pula o tanque parado e vai para o seguinte do rodízio, sem repetir o anterior", () => {
    // Anterior: Chiller 02; a vez era o Pré-chiller (parado) → Chiller 01.
    const vez = { tanque: "preChiller", ph: "7", cloro: "1" };
    const novo = sortearOutroTanque("carcacas", vez, "chiller2");
    expect(novo).toMatchObject({ tanque: "chiller1", ph: "", cloro: "", tanquesParados: ["preChiller"] });
  });

  it("prefere um tanque diferente do anterior; se for o único funcionando, usa o anterior", () => {
    // Vez: Chiller 01 (parado); Pré-chiller foi o anterior; resta Chiller 02 → Chiller 02.
    expect(sortearOutroTanque("carcacas", { tanque: "chiller1", ph: "", cloro: "" }, "preChiller").tanque).toBe("chiller2");
    // Dois parados e só o anterior funcionando: testa o anterior em vez de ficar sem teste.
    const uma = sortearOutroTanque("carcacas", { tanque: "chiller1", ph: "", cloro: "", tanquesParados: ["chiller2"] }, "preChiller");
    expect(uma.tanque).toBe("preChiller");
    expect(uma.tanquesParados).toEqual(["chiller2", "chiller1"]);
  });

  it("pode refazer várias vezes e registra cada tanque parado", () => {
    let t = { tanque: "miniFigado", ph: "", cloro: "" } as ReturnType<typeof sortearOutroTanque>;
    t = sortearOutroTanque("miudos", t, null);
    t = sortearOutroTanque("miudos", t, null);
    expect(t.tanquesParados).toEqual(["miniFigado", "miniMoela"]);
    expect(t.tanque).toBe("miniCabeca");
  });

  it("com todos os tanques parados o sistema fica sem teste e não exige pH nem cloro", () => {
    let t = { tanque: "chillerPartes1", ph: "", cloro: "" } as ReturnType<typeof sortearOutroTanque>;
    t = sortearOutroTanque("partes", t, null);
    expect(todosTanquesParados("partes", t)).toBe(false);
    t = sortearOutroTanque("partes", t, null);
    expect(t.semTeste).toBe(true);
    expect(todosTanquesParados("partes", t)).toBe(true);

    const v = preenchido();
    v.sistemas.partes = t;
    v.sistemas.carcacas.ph = "";
    expect(motivosBloqueioPotabilidade(v).join(" ")).not.toMatch(/Partes/);
    expect(motivosBloqueioPotabilidade(v)).toHaveLength(1);
    v.sistemas.partes = { ...t, ph: "99", cloro: "99" };
    expect(avaliarPotabilidade(v).conformidade).toBe(true);
  });

  it("desfazer volta ao tanque da vez do rodízio", () => {
    expect(reiniciarSorteio("carcacas", "preChiller")).toEqual({ tanque: "chiller1", ph: "", cloro: "" });
    expect(reiniciarSorteio("carcacas", undefined).tanque).toBe("preChiller");
  });

  it("o tanque realmente testado é a base do rodízio seguinte", () => {
    const sorteado = { ...potabilidadeInicial(), sistemas: { ...potabilidadeInicial().sistemas, carcacas: sortearOutroTanque("carcacas", potabilidadeInicial().sistemas.carcacas, null) } };
    expect(sorteado.sistemas.carcacas.tanque).toBe("chiller1");
    expect(potabilidadeInicial(sorteado).sistemas.carcacas.tanque).toBe("chiller2");
  });
});
