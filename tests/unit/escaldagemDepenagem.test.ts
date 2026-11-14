import { describe, expect, it } from "vitest";
import {
  avaliarEscaldagem,
  defeitoAcimaDoMaximo,
  DEFEITOS_ESCALDAGEM,
  escaldagemVazio,
  formatarPct,
  lerContagem,
  montarValorEscaldagem,
  motivosBloqueioEscaldagem,
  percentualDefeito,
} from "@/modules/fichas/fields/escaldagemDepenagem";
import { desviosEspeciais, temNaoConformidade } from "@/modules/fichas/utils/desviosEspeciais";
import { caminhoDaNaoConformidade } from "@/modules/fichas/utils/alvoNaoConformidade";
import { refazerConformidadeDosCamposCorrigidos } from "@/modules/fichas/utils/conformidadeDoAdendo";
import { motivosDeBloqueioSpr } from "@/modules/fichas/utils/bloqueiosSpr";
import { alvosDoCampo } from "@/modules/fichas/utils/adendoCampos";
import { campoTemplateSchema, valoresIniciaisDe, zodFromSchemaCampos, type CampoTemplate } from "@/shared/schema-campos";
import type { EscaldagemDepenagemValor } from "@/modules/fichas/fields/tiposCompostos";

/** Registro completo e conforme: 100 aves avaliadas, todos os defeitos em 0. */
const base = (p: Partial<EscaldagemDepenagemValor> = {}, defeitos: Record<string, string> = {}): EscaldagemDepenagemValor => {
  const v = escaldagemVazio();
  return {
    ...v,
    velocidadeNoreaAvesHora: "9000",
    tempoEscaldagemMin: "2,5",
    temperaturaDepiladorPatasC: "60",
    temperaturaTanqueEscaldagemC: "57,5",
    avesAvaliadas: "100",
    defeitos: { ...Object.fromEntries(DEFEITOS_ESCALDAGEM.map((d) => [d.chave, "0"])), ...defeitos },
    ...p,
  };
};
const campos = [{ chave: "e", tipo: "escaldagem_depenagem", obrigatorio: true, label: "Escaldagem" }] as CampoTemplate[];

describe("escaldagem/depenagem — limites de cada defeito", () => {
  it("tem os 18 defeitos pedidos, cada um com o seu máximo", () => {
    const max = Object.fromEntries(DEFEITOS_ESCALDAGEM.map((d) => [d.chave, d.maximoPct]));
    expect(DEFEITOS_ESCALDAGEM).toHaveLength(18);
    for (const k of ["penasAsas", "penasPontasAsas", "penasPernas", "penasAbdomen", "penasSambiquira", "penasCabeca", "penasCostelas"]) expect(max[k]).toBe(5);
    for (const k of ["peliculaAbdomen", "peliculaPeito", "peliculaCostelas", "peliculaPernas", "imperfeicoesPeito", "imperfeicoesDorso", "pododermatites"]) expect(max[k]).toBe(5);
    expect(max.pesMalDepilados).toBe(2);
    expect(max.corteIrregularPes).toBe(15);
    expect(max.excessoEscaldaPes).toBe(3);
    expect(max.falhaDesacoplamentoPes).toBe(3);
  });

  it("calcula o percentual sobre as aves avaliadas", () => {
    expect(percentualDefeito(3, 200)).toBe(1.5);
    expect(percentualDefeito(0, 100)).toBe(0);
    expect(percentualDefeito(null, 100)).toBeNull();
    expect(percentualDefeito(3, null)).toBeNull();
    expect(percentualDefeito(3, 0)).toBeNull();
  });

  it("exatamente o máximo é conforme; acima é não conforme (sem erro de ponto flutuante)", () => {
    expect(defeitoAcimaDoMaximo(5, 100, 5)).toBe(false);
    expect(defeitoAcimaDoMaximo(6, 100, 5)).toBe(true);
    expect(defeitoAcimaDoMaximo(2, 100, 2)).toBe(false);
    expect(defeitoAcimaDoMaximo(3, 100, 2)).toBe(true);
    expect(defeitoAcimaDoMaximo(15, 100, 15)).toBe(false);
    expect(defeitoAcimaDoMaximo(21, 700, 3)).toBe(false);
    expect(defeitoAcimaDoMaximo(22, 700, 3)).toBe(true);
    expect(defeitoAcimaDoMaximo(null, 100, 5)).toBe(false);
  });

  it("pés mal depilados tem máximo 2%, menor que o dos demais", () => {
    expect(avaliarEscaldagem(base({}, { pesMalDepilados: "2" })).conformidade).toBe(true);
    expect(avaliarEscaldagem(base({}, { pesMalDepilados: "3" })).conformidade).toBe(false);
    expect(avaliarEscaldagem(base({}, { penasAsas: "3" })).conformidade).toBe(true);
  });

  it("formata o percentual em pt-BR", () => {
    expect(formatarPct(1.5)).toBe("1,5%");
    expect(formatarPct(0)).toBe("0%");
    expect(formatarPct(null)).toBe("—");
  });

  it("lerContagem aceita só inteiro não negativo", () => {
    expect(lerContagem("0")).toBe(0);
    expect(lerContagem("1,5")).toBeNull();
    expect(lerContagem("")).toBeNull();
  });
});

describe("escaldagem/depenagem — veredito e RNC", () => {
  it("tudo dentro do máximo: conforme, sem texto de RNC", () => {
    const v = montarValorEscaldagem(base({}, { penasAsas: "5", corteIrregularPes: "15" }));
    expect(v.conformidade).toBe(true);
    expect(v.detalhesRNC).toBeNull();
  });

  it("lista cada defeito acima do máximo com o %, e só eles", () => {
    const v = montarValorEscaldagem(base({}, { penasCabeca: "8", falhaDesacoplamentoPes: "4", penasAsas: "5" }));
    expect(v.conformidade).toBe(false);
    expect(avaliarEscaldagem(v).motivos).toHaveLength(2);
    expect(v.detalhesRNC).toContain("Penas na cabeça — PSO 06: 8% (máx. 5%)");
    expect(v.detalhesRNC).toContain("Falha no desacoplamento de pés: 4% (máx. 3%)");
    expect(v.detalhesRNC).not.toContain("Penas nas asas");
  });

  it("os parâmetros do processo (nórea, tempo, temperaturas) não geram não conformidade", () => {
    expect(avaliarEscaldagem(base({ velocidadeNoreaAvesHora: "1", temperaturaTanqueEscaldagemC: "999" })).conformidade).toBe(true);
  });

  it("não aponta setor de RNC: vale o setor do próprio monitoramento", async () => {
    const { setorDestinoDaRnc } = await import("@/shared/setor-rnc");
    expect(setorDestinoDaRnc({ e: montarValorEscaldagem(base({}, { penasAsas: "50" })) })).toBeNull();
  });

  it("entra nos desvios do preenchimento (aviso antes de assinar e RNC após assinar)", () => {
    const nc = montarValorEscaldagem(base({}, { pododermatites: "9" }));
    expect(desviosEspeciais(campos, { e: nc })[0]).toContain("está não conforme");
    expect(temNaoConformidade({ e: nc })).toBe(true);
    expect(desviosEspeciais(campos, { e: montarValorEscaldagem(base()) })).toEqual([]);
  });

  it("aponta como alvo do adendo o primeiro defeito acima do máximo", () => {
    const nc = montarValorEscaldagem(base({}, { peliculaPeito: "9", pesMalDepilados: "9" }));
    expect(caminhoDaNaoConformidade("escaldagem_depenagem", nc)).toBe("defeitos.peliculaPeito");
    expect(caminhoDaNaoConformidade("escaldagem_depenagem", montarValorEscaldagem(base()))).toBeUndefined();
  });

  it("o adendo refaz o veredito com a contagem corrigida", () => {
    const nc = montarValorEscaldagem(base({}, { penasAsas: "9" }));
    expect(nc.conformidade).toBe(false);
    const corrigido = { e: { ...nc, defeitos: { ...nc.defeitos, penasAsas: "1" } } };
    const refeito = refazerConformidadeDosCamposCorrigidos(corrigido, { "e.defeitos.penasAsas": "1" }, [{ chave: "e", tipo: "escaldagem_depenagem" }]);
    expect((refeito.e as EscaldagemDepenagemValor).conformidade).toBe(true);
    expect((refeito.e as EscaldagemDepenagemValor).detalhesRNC).toBeNull();
  });

  it("o adendo oferece parâmetros, aves avaliadas e cada defeito, com rótulos legíveis, sem os dados calculados", () => {
    const alvos = alvosDoCampo({ chave: "e", label: "Escaldagem", tipo: "escaldagem_depenagem" }, montarValorEscaldagem(base()));
    const porCaminho = new Map(alvos.map((a) => [a.caminho, a.rotulo]));
    expect(porCaminho.has("e.velocidadeNoreaAvesHora")).toBe(true);
    expect(porCaminho.has("e.temperaturaTanqueEscaldagemC")).toBe(true);
    expect(porCaminho.has("e.avesAvaliadas")).toBe(true);
    expect(porCaminho.get("e.defeitos.penasPontasAsas")).toBe("Escaldagem › Penas nas pontas das asas — PSO 06");
    expect(porCaminho.has("e.defeitos.falhaDesacoplamentoPes")).toBe(true);
    expect([...porCaminho.keys()].some((c) => /conformidade|detalhesRNC/.test(c))).toBe(false);
  });
});

describe("escaldagem/depenagem — bloqueio de assinatura", () => {
  it("registro completo passa", () => {
    expect(motivosBloqueioEscaldagem(base())).toEqual([]);
  });

  it("sem nada preenchido, pede os parâmetros, as aves avaliadas e os defeitos", () => {
    expect(motivosBloqueioEscaldagem(null)).toHaveLength(1);
    const m = motivosBloqueioEscaldagem(escaldagemVazio());
    expect(m.some((t) => t.includes("velocidade da nórea"))).toBe(true);
    expect(m.some((t) => t.includes("tempo de escaldagem"))).toBe(true);
    expect(m.some((t) => t.includes("temperatura do depilador de patas"))).toBe(true);
    expect(m.some((t) => t.includes("temperatura do tanque de escaldagem"))).toBe(true);
    expect(m.some((t) => t.includes("aves avaliadas"))).toBe(true);
  });

  it("aceita temperatura e tempo com vírgula, e exige velocidade/tempo/aves maiores que zero", () => {
    expect(motivosBloqueioEscaldagem(base({ tempoEscaldagemMin: "2,25", temperaturaTanqueEscaldagemC: "57,5" }))).toEqual([]);
    expect(motivosBloqueioEscaldagem(base({ velocidadeNoreaAvesHora: "0" }))).toHaveLength(1);
    expect(motivosBloqueioEscaldagem(base({ tempoEscaldagemMin: "0" }))).toHaveLength(1);
    expect(motivosBloqueioEscaldagem(base({ avesAvaliadas: "0" }))).toHaveLength(1);
  });

  it("exige todos os defeitos (0 vale, em branco não) e não deixa passar das aves avaliadas", () => {
    expect(motivosBloqueioEscaldagem(base({}, { penasAsas: "" }))).toHaveLength(1);
    expect(motivosBloqueioEscaldagem(base({}, { penasAsas: "", penasCabeca: "" }))).toHaveLength(2);
    expect(motivosBloqueioEscaldagem(base({}, { penasAsas: "101" }))).toHaveLength(1);
    expect(motivosBloqueioEscaldagem(base({}, { penasAsas: "100" }))).toEqual([]);
  });

  it("entra no bloqueio geral de assinatura da ficha", () => {
    expect(motivosDeBloqueioSpr(campos, { e: base({}, { penasAsas: "" }) })).toHaveLength(1);
    expect(motivosDeBloqueioSpr(campos, { e: base() })).toEqual([]);
    expect(motivosDeBloqueioSpr(campos, { e: null })).toHaveLength(1);
  });
});

describe("escaldagem/depenagem — schema do campo", () => {
  it("o tipo é aceito no template e começa vazio (null)", () => {
    expect(campoTemplateSchema.safeParse(campos[0]).success).toBe(true);
    expect(valoresIniciaisDe(campos)).toEqual({ e: null });
  });

  it("o valor do widget passa na validação do formulário", () => {
    expect(zodFromSchemaCampos(campos).safeParse({ e: montarValorEscaldagem(base()) }).success).toBe(true);
  });
});
