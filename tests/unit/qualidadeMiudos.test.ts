import { describe, expect, it } from "vitest";
import {
  avaliarQualidadeMiudos,
  defeitoAcimaDoMaximo,
  lerContagem,
  montarValorQualidadeMiudos,
  motivosBloqueioQualidadeMiudos,
  PARTES_MIUDOS,
  percentualDefeito,
  qualidadeMiudosVazio,
} from "@/modules/fichas/fields/qualidadeMiudos";

function preenchido(amostra = "100") {
  const v = qualidadeMiudosVazio();
  for (const p of PARTES_MIUDOS) {
    v.partes[p.chave].amostra = amostra;
    for (const d of p.defeitos) v.partes[p.chave].defeitos[d.chave] = "0";
  }
  return v;
}

describe("qualidade de miúdos e pertences", () => {
  it("tem as 5 partes e os 15 defeitos com os máximos pedidos", () => {
    const max = Object.fromEntries(PARTES_MIUDOS.map((p) => [p.chave, p.defeitos.map((d) => `${d.chave}:${d.maximoPct}`)]));
    expect(max).toEqual({
      cabeca: ["pena:3", "excessoEscalda:3"],
      pes: ["fraturaExposta:3", "corteIrregular:15", "cuticula:2", "excessoEscalda:0"],
      moela: ["ingesta:0", "proVentriculo:1", "lesoes:0"],
      figado: ["coloracaoPalida:1", "corpoEstranho:1", "pulmao:3"],
      coracao: ["baco:3", "pulmao:3", "ausenciaPartes:3"],
    });
  });

  it("lê contagens inteiras e calcula o percentual", () => {
    expect(lerContagem("12")).toBe(12);
    expect(lerContagem("")).toBeNull();
    expect(lerContagem("1,5")).toBeNull();
    expect(lerContagem("-1")).toBeNull();
    expect(percentualDefeito(3, 100)).toBe(3);
    expect(percentualDefeito(1, 0)).toBeNull();
    expect(percentualDefeito(null, 10)).toBeNull();
  });

  it("o limite exato é conforme e acima dele é não conforme", () => {
    expect(defeitoAcimaDoMaximo(3, 100, 3)).toBe(false);
    expect(defeitoAcimaDoMaximo(4, 100, 3)).toBe(true);
    expect(defeitoAcimaDoMaximo(15, 100, 15)).toBe(false);
    expect(defeitoAcimaDoMaximo(16, 100, 15)).toBe(true);
    expect(defeitoAcimaDoMaximo(1, 50, 2)).toBe(false);
    expect(defeitoAcimaDoMaximo(2, 50, 3)).toBe(true);
  });

  it("máximo de 0%: qualquer ocorrência reprova, nenhuma é conforme", () => {
    expect(defeitoAcimaDoMaximo(0, 100, 0)).toBe(false);
    expect(defeitoAcimaDoMaximo(1, 1000, 0)).toBe(true);
  });

  it("tudo zerado é conforme, sem detalhes de RNC", () => {
    expect(montarValorQualidadeMiudos(preenchido())).toMatchObject({ conformidade: true, detalhesRNC: null });
    expect(motivosBloqueioQualidadeMiudos(preenchido())).toEqual([]);
  });

  it("defeito acima do máximo reprova e lista parte, defeito, percentual e limite", () => {
    const v = preenchido();
    v.partes.pes.defeitos.corteIrregular = "20";
    v.partes.moela.defeitos.ingesta = "1";
    v.partes.cabeca.defeitos.pena = "3";
    const r = avaliarQualidadeMiudos(v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toEqual(["Pés — Corte irregular: 20% (máx. 15%)", "Moela — Ingesta: 1% (máx. 0%)"]);
    expect(montarValorQualidadeMiudos(v).detalhesRNC).toMatch(/^Qualidade de miúdos fora do limite — Pés — Corte irregular/);
  });

  it("bloqueia sem amostra, sem contagem ou com defeitos acima da amostra", () => {
    expect(motivosBloqueioQualidadeMiudos(undefined)).toHaveLength(1);
    expect(motivosBloqueioQualidadeMiudos(qualidadeMiudosVazio())).toHaveLength(5);
    const v = preenchido("10");
    v.partes.figado.defeitos.pulmao = "";
    v.partes.coracao.defeitos.baco = "11";
    const m = motivosBloqueioQualidadeMiudos(v);
    expect(m).toHaveLength(2);
    expect(m[0]).toContain("Pulmão");
    expect(m[1]).toContain("não pode passar");
    const semAmostra = preenchido("0");
    expect(motivosBloqueioQualidadeMiudos(semAmostra)).toHaveLength(5);
  });
});
