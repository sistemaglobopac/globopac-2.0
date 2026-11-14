import { describe, expect, it } from "vitest";
import {
  acimaDoLimite,
  avaliarHematomas,
  cargaHematomasVazia,
  formatarPctHematomas,
  hematomasVazio,
  LIMITE_HEMATOMAS_PCT,
  lerContagem,
  lesaoAcimaDoLimite,
  lesoesAcimaDoLimite,
  montarValorHematomas,
  motivosBloqueioHematomas,
  percentualDaLesao,
  percentualHematomas,
  totalDeLesoes,
} from "@/modules/fichas/fields/hematomas";
import { desviosEspeciais, temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import { caminhoDaNaoConformidade } from "@/modules/fichas/utils/alvoNaoConformidade";
import { refazerConformidadeDosCamposCorrigidos } from "@/modules/fichas/utils/conformidadeDoAdendo";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import { alvosDoCampo } from "@/modules/fichas/utils/adendoCampos";
import { campoTemplateSchema, valoresIniciaisDe, zodFromSchemaCampos, type CampoTemplate } from "@/shared/schema-campos";
import type { CargaHematomas, HematomasCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

const carga = (p: Partial<CargaHematomas> = {}): CargaHematomas => ({
  ...cargaHematomasVazia(),
  cargaId: "c1",
  gta: "123",
  integrado: "João",
  carcacasAvaliadas: "100",
  contusoesAsas: "1",
  contusoesPeito: "1",
  contusoesCoxa: "1",
  fraturas: "0",
  ...p,
});
const valor = (...cargas: CargaHematomas[]): HematomasCarcacasValor => ({ ...hematomasVazio(), cargas });
const campos = [{ chave: "h", tipo: "hematomas_carcacas", obrigatorio: true, label: "Hematomas" }] as CampoTemplate[];

describe("hematomas nas carcaças — cálculo do percentual", () => {
  it("calcula o percentual de cada tipo de lesão sobre as carcaças avaliadas", () => {
    const c = carga({ carcacasAvaliadas: "200", contusoesAsas: "2", contusoesPeito: "1", contusoesCoxa: "3", fraturas: "2" });
    expect(percentualDaLesao(c, "contusoesAsas")).toBe(1);
    expect(percentualDaLesao(c, "contusoesPeito")).toBe(0.5);
    expect(percentualDaLesao(c, "contusoesCoxa")).toBe(1.5);
    expect(percentualDaLesao(c, "fraturas")).toBe(1);
    // o total (soma ÷ avaliadas) segue disponível, só como informação
    expect(totalDeLesoes(c)).toBe(8);
    expect(percentualHematomas(c)).toBe(4);
  });

  it("o limite de 4% vale para CADA tipo: exatamente 4% é conforme e acima disso não", () => {
    expect(LIMITE_HEMATOMAS_PCT).toBe(4);
    const zeradas = { contusoesAsas: "0", contusoesPeito: "0", contusoesCoxa: "0", fraturas: "0" };
    expect(acimaDoLimite(carga({ ...zeradas, contusoesAsas: "4" }))).toBe(false);
    expect(acimaDoLimite(carga({ ...zeradas, contusoesAsas: "5" }))).toBe(true);
    expect(acimaDoLimite(carga({ ...zeradas, contusoesPeito: "5" }))).toBe(true);
    expect(acimaDoLimite(carga({ ...zeradas, contusoesCoxa: "5" }))).toBe(true);
    // sem erro de ponto flutuante nas bordas (7 ÷ 175 = 4%)
    expect(acimaDoLimite(carga({ ...zeradas, carcacasAvaliadas: "175", contusoesAsas: "7" }))).toBe(false);
    expect(acimaDoLimite(carga({ ...zeradas, carcacasAvaliadas: "175", contusoesAsas: "8" }))).toBe(true);
  });

  it("a soma dos tipos NÃO é o critério: vários tipos no limite somam mais de 4% e a carga continua conforme", () => {
    const c = carga({ carcacasAvaliadas: "100", contusoesAsas: "4", contusoesPeito: "4", contusoesCoxa: "4", fraturas: "4" });
    expect(percentualHematomas(c)).toBe(16);
    expect(acimaDoLimite(c)).toBe(false);
    expect(lesoesAcimaDoLimite(c)).toEqual([]);
    expect(montarValorHematomas(valor(c)).conformidade).toBe(true);
  });

  it("fraturas também têm o limite de 4%", () => {
    const zeradas = { contusoesAsas: "0", contusoesPeito: "0", contusoesCoxa: "0" };
    expect(acimaDoLimite(carga({ ...zeradas, carcacasAvaliadas: "50", fraturas: "3" }))).toBe(true);
    expect(acimaDoLimite(carga({ ...zeradas, carcacasAvaliadas: "50", fraturas: "2" }))).toBe(false);
  });

  it("identifica exatamente quais tipos passaram do limite", () => {
    const c = carga({ carcacasAvaliadas: "100", contusoesAsas: "6", contusoesPeito: "1", contusoesCoxa: "9", fraturas: "4" });
    expect(lesoesAcimaDoLimite(c).map((l) => l.chave)).toEqual(["contusoesAsas", "contusoesCoxa"]);
    expect(lesaoAcimaDoLimite(c, "fraturas")).toBe(false);
  });

  it("cada tipo é avaliado sozinho: um tipo acima do limite reprova mesmo com os outros em branco", () => {
    const c = carga({ carcacasAvaliadas: "100", contusoesAsas: "9", contusoesPeito: "", contusoesCoxa: "", fraturas: "" });
    expect(lesaoAcimaDoLimite(c, "contusoesAsas")).toBe(true);
    expect(acimaDoLimite(c)).toBe(true);
    expect(totalDeLesoes(c)).toBeNull();
  });

  it("zero lesões é 0% e conforme; contagem em branco não vira zero", () => {
    const zero = carga({ contusoesAsas: "0", contusoesPeito: "0", contusoesCoxa: "0", fraturas: "0" });
    expect(percentualHematomas(zero)).toBe(0);
    expect(acimaDoLimite(zero)).toBe(false);
    const faltando = carga({ fraturas: "" });
    expect(totalDeLesoes(faltando)).toBeNull();
    expect(percentualHematomas(faltando)).toBeNull();
    expect(acimaDoLimite(faltando)).toBe(false);
  });

  it("sem carcaças avaliadas não há percentual", () => {
    expect(percentualHematomas(carga({ carcacasAvaliadas: "" }))).toBeNull();
    expect(percentualHematomas(carga({ carcacasAvaliadas: "0" }))).toBeNull();
  });

  it("lerContagem aceita só inteiro não negativo", () => {
    expect(lerContagem("0")).toBe(0);
    expect(lerContagem(" 12 ")).toBe(12);
    expect(lerContagem("1,5")).toBeNull();
    expect(lerContagem("-1")).toBeNull();
    expect(lerContagem("")).toBeNull();
  });

  it("formata o percentual em pt-BR", () => {
    expect(formatarPctHematomas(3.255)).toBe("3,26%");
    expect(formatarPctHematomas(4)).toBe("4%");
    expect(formatarPctHematomas(null)).toBe("—");
  });
});

describe("hematomas nas carcaças — veredito e RNC", () => {
  it("monta o valor com total, %, limite, veredito e o setor da RNC (Fomento Avícola)", () => {
    const v = montarValorHematomas(valor(carga({ carcacasAvaliadas: "100", contusoesAsas: "6", contusoesPeito: "2", contusoesCoxa: "1", fraturas: "0" })));
    expect(v.cargas[0]!.totalLesoes).toBe(9);
    expect(v.cargas[0]!.hematomasPct).toBe(9);
    expect(v.limitePct).toBe(4);
    expect(v.setorRnc).toBe("FOMENTO AVÍCOLA");
    expect(v.conformidade).toBe(false);
    expect(v.detalhesRNC).toContain("GTA 123");
    expect(v.detalhesRNC).toContain("contusões nas asas 6%");
    expect(v.detalhesRNC).not.toContain("peito");
    expect(v.detalhesRNC).toContain("FOMENTO AVÍCOLA");
  });

  it("a RNC lista cada tipo de lesão acima do limite, com o seu percentual", () => {
    const v = montarValorHematomas(valor(carga({ carcacasAvaliadas: "200", contusoesAsas: "10", contusoesPeito: "1", contusoesCoxa: "0", fraturas: "9" })));
    expect(v.detalhesRNC).toContain("contusões nas asas 5%");
    expect(v.detalhesRNC).toContain("fraturas 4,5%");
    expect(v.detalhesRNC).not.toContain("coxa");
  });

  it("carga dentro do limite fica conforme, sem texto de RNC", () => {
    const v = montarValorHematomas(valor(carga()));
    expect(v.conformidade).toBe(true);
    expect(v.detalhesRNC).toBeNull();
  });

  it("basta uma carga acima do limite para o monitoramento ficar não conforme, citando só ela", () => {
    const v = montarValorHematomas(valor(carga(), carga({ cargaId: "c2", gta: "999", contusoesAsas: "10" })));
    expect(v.conformidade).toBe(false);
    expect(avaliarHematomas(v).motivos).toHaveLength(1);
    expect(v.detalhesRNC).toContain("GTA 999");
    expect(v.detalhesRNC).not.toContain("GTA 123");
  });

  it("entra nos desvios do preenchimento (aviso antes de assinar e RNC após assinar)", () => {
    const nc = montarValorHematomas(valor(carga({ contusoesAsas: "10" })));
    expect(desviosEspeciais(campos, { h: nc })[0]).toContain("está não conforme");
    expect(temNaoConformidade({ h: nc })).toBe(true);
    expect(desviosEspeciais(campos, { h: montarValorHematomas(valor(carga())) })).toEqual([]);
  });

  it("aponta como alvo do adendo a contagem que mais pesa na carga acima do limite", () => {
    const nc = montarValorHematomas(valor(carga(), carga({ cargaId: "c2", contusoesAsas: "1", contusoesPeito: "9" })));
    expect(caminhoDaNaoConformidade("hematomas_carcacas", nc)).toBe("cargas.1.contusoesPeito");
    expect(caminhoDaNaoConformidade("hematomas_carcacas", montarValorHematomas(valor(carga())))).toBeUndefined();
  });

  it("o adendo refaz o veredito com a contagem corrigida", () => {
    const nc = montarValorHematomas(valor(carga({ contusoesPeito: "9" })));
    expect(nc.conformidade).toBe(false);
    const corrigido = { h: { ...nc, cargas: [{ ...nc.cargas[0]!, contusoesPeito: "1" }] } };
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "h.cargas.0.contusoesPeito": "1" }, [{ chave: "h", tipo: "hematomas_carcacas" }]);
    expect((refeito.h as HematomasCarcacasValor).conformidade).toBe(true);
    expect((refeito.h as HematomasCarcacasValor).detalhesRNC).toBeNull();
  });

  it("o adendo oferece as contagens para correção, mas não os dados calculados nem o setor da RNC", () => {
    const alvos = alvosDoCampo({ chave: "h", label: "Hematomas", tipo: "hematomas_carcacas" }, montarValorHematomas(valor(carga())));
    const caminhos = alvos.map((a) => a.caminho);
    expect(caminhos).toContain("h.cargas.0.carcacasAvaliadas");
    expect(caminhos).toContain("h.cargas.0.contusoesAsas");
    expect(caminhos).toContain("h.cargas.0.fraturas");
    expect(caminhos.some((c) => /totalLesoes|hematomasPct|setorRnc|limitePct|conformidade/.test(c))).toBe(false);
  });
});

describe("hematomas nas carcaças — bloqueio de assinatura", () => {
  it("sem nada preenchido, pede ao menos uma carga", () => {
    expect(motivosBloqueioHematomas(hematomasVazio())).toHaveLength(1);
    expect(motivosBloqueioHematomas(null)).toHaveLength(1);
  });

  it("exige carga, carcaças avaliadas e as quatro contagens (0 vale, em branco não)", () => {
    expect(motivosBloqueioHematomas(valor(carga()))).toEqual([]);
    expect(motivosBloqueioHematomas(valor(carga({ cargaId: "" })))).toHaveLength(1);
    expect(motivosBloqueioHematomas(valor(carga({ carcacasAvaliadas: "" })))).toHaveLength(1);
    expect(motivosBloqueioHematomas(valor(carga({ carcacasAvaliadas: "0" })))).toHaveLength(1);
    expect(motivosBloqueioHematomas(valor(carga({ fraturas: "" })))).toHaveLength(1);
    expect(motivosBloqueioHematomas(valor(carga({ contusoesAsas: "", contusoesCoxa: "" })))).toHaveLength(2);
  });

  it("ignora linha totalmente em branco quando há outra carga preenchida", () => {
    expect(motivosBloqueioHematomas(valor(carga(), cargaHematomasVazia()))).toEqual([]);
  });

  it("entra no bloqueio geral de assinatura da ficha", () => {
    expect(motivosDeBloqueioSpr(campos, { h: valor(carga({ fraturas: "" })) })).toHaveLength(1);
    expect(motivosDeBloqueioSpr(campos, { h: valor(carga()) })).toEqual([]);
  });
});

describe("hematomas nas carcaças — schema do campo", () => {
  it("o tipo é aceito no template e começa vazio (null)", () => {
    expect(campoTemplateSchema.safeParse(campos[0]).success).toBe(true);
    expect(valoresIniciaisDe(campos)).toEqual({ h: null });
  });

  it("o valor do widget passa na validação do formulário (a obrigatoriedade é conferida no bloqueio de assinatura, como no peso por caixa)", () => {
    const schema = zodFromSchemaCampos(campos);
    expect(schema.safeParse({ h: montarValorHematomas(valor(carga())) }).success).toBe(true);
    expect(motivosDeBloqueioSpr(campos, { h: null })).toHaveLength(1);
  });
});
