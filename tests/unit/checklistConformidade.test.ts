import { describe, expect, it } from "vitest";
import {
  avaliarChecklist,
  CHECKLISTS,
  checklistVazio,
  itensDaSala,
  montarValorChecklist,
  motivosBloqueioChecklist,
  respostaNaoConforme,
  rotuloResposta,
  type TipoChecklist,
} from "@/modules/fichas/fields/checklistConformidade";

function tudoConforme(tipo: TipoChecklist) {
  const v = checklistVazio(tipo);
  for (const sala of Object.keys(v.salas) as ("carcacas" | "miudos" | "geral")[]) {
    for (const i of itensDaSala(tipo, sala)) v.salas[sala][i.chave] = i.modo === "sim_e_nc" ? "nao" : "conforme";
  }
  return v;
}

describe("checklists de conformidade", () => {
  it("Águas Residuais tem os 9 itens e Ventilação os 3 pedidos", () => {
    expect(CHECKLISTS.aguas_residuais.itens).toHaveLength(9);
    expect(CHECKLISTS.aguas_residuais.itens[0]).toMatchObject({ rotulo: "Excesso de água no piso", modo: "sim_e_nc" });
    expect(CHECKLISTS.ventilacao.itens.map((i) => i.rotulo)).toEqual(["Ausência de odores", "Ausência de condensações", "Ausência de vapores"]);
  });

  it("Águas Residuais: cada sala tem só os seus itens", () => {
    expect(itensDaSala("aguas_residuais", "carcacas").map((i) => i.chave)).toEqual([
      "excessoAguaPiso",
      "escoamentoCarcacas",
      "escoamentoPartes",
      "escoamentoEsteiraCones",
      "direcionamentoCanaletas",
      "canaletasDesobstruidas",
    ]);
    expect(itensDaSala("aguas_residuais", "miudos").map((i) => i.chave)).toEqual([
      "excessoAguaPiso",
      "escoamentoMiudos",
      "escoamentoEmbalagemMiudos",
      "escoamentoPiaMaos",
      "direcionamentoCanaletas",
      "canaletasDesobstruidas",
    ]);
    const v = checklistVazio("aguas_residuais");
    expect(Object.keys(v.salas.carcacas)).not.toContain("escoamentoPiaMaos");
    expect(Object.keys(v.salas.miudos)).not.toContain("escoamentoPartes");
    expect(itensDaSala("ventilacao", "miudos")).toHaveLength(3);
  });

  it("excesso de água no piso: Sim é não conforme e Não é conforme", () => {
    expect(respostaNaoConforme("sim_e_nc", "sim")).toBe(true);
    expect(respostaNaoConforme("sim_e_nc", "nao")).toBe(false);
    expect(rotuloResposta("sim_e_nc", "sim")).toBe("Sim");
    expect(rotuloResposta("conforme", "nao_conforme")).toBe("Não conforme");
    expect(rotuloResposta("conforme", "")).toBe("—");
  });

  it("'Não se aplica' não reprova", () => {
    const v = tudoConforme("aguas_residuais");
    v.salas.carcacas.escoamentoPartes = "na";
    expect(rotuloResposta("conforme", "na")).toBe("Não se aplica");
    expect(respostaNaoConforme("conforme", "na")).toBe(false);
    expect(avaliarChecklist("aguas_residuais", v).conformidade).toBe(true);
    expect(motivosBloqueioChecklist("aguas_residuais", v)).toEqual([]);
  });

  it("tudo conforme resulta em conforme, sem detalhes de RNC", () => {
    for (const tipo of ["aguas_residuais", "ventilacao", "higiene_habitos", "pso", "higiene_operacional", "higiene_colaboradores"] as const) {
      expect(montarValorChecklist(tipo, tudoConforme(tipo))).toMatchObject({ conformidade: true, detalhesRNC: null });
    }
  });

  it("qualquer item não conforme torna o monitoramento não conforme e lista os itens", () => {
    const v = tudoConforme("aguas_residuais");
    v.salas.carcacas.excessoAguaPiso = "sim";
    v.salas.miudos.canaletasDesobstruidas = "nao_conforme";
    const r = avaliarChecklist("aguas_residuais", v);
    expect(r.conformidade).toBe(false);
    expect(r.motivos).toEqual(["Carcaças — Excesso de água no piso", "Miúdos — Canaletas desobstruídas: não conforme"]);
    expect(montarValorChecklist("aguas_residuais", v).detalhesRNC).toMatch(/^Monitoramento de Águas Residuais — Carcaças — Excesso de água no piso;/);
  });

  it("ventilação com condensação não conforme", () => {
    const v = tudoConforme("ventilacao");
    v.salas.miudos.ausenciaCondensacao = "nao_conforme";
    expect(avaliarChecklist("ventilacao", v).motivos).toEqual(["Miúdos — Ausência de condensações: não conforme"]);
  });

  it("bloqueia a assinatura enquanto algum item não tiver resposta", () => {
    expect(motivosBloqueioChecklist("ventilacao", undefined)).toHaveLength(1);
    expect(motivosBloqueioChecklist("aguas_residuais", tudoConforme("aguas_residuais"))).toEqual([]);
    const v = tudoConforme("aguas_residuais");
    v.salas.carcacas.escoamentoPartes = "";
    v.salas.miudos.excessoAguaPiso = "";
    const m = motivosBloqueioChecklist("aguas_residuais", v);
    expect(m).toHaveLength(2);
    expect(m[0]).toContain("Sala de Pré-resfriamento de Carcaças");
    expect(m[1]).toContain("Sala de Pré-resfriamento de Miúdos");
  });
});

describe("Higiene e Hábitos Higiênicos (duas salas)", () => {
  it("cobre as duas salas, com os 13 itens em 2 blocos", () => {
    const v = checklistVazio("higiene_habitos");
    expect(Object.keys(v.salas)).toEqual(["carcacas", "miudos"]);
    const def = CHECKLISTS.higiene_habitos;
    expect(def.itens).toHaveLength(13);
    expect(def.itens.filter((i) => i.grupo === "Barreira sanitária")).toHaveLength(6);
    expect(def.itens.filter((i) => i.grupo === "Organização dos Setores")).toHaveLength(7);
  });

  it("materiais estranhos no setor: Sim é não conforme", () => {
    const v = tudoConforme("higiene_habitos");
    expect(avaliarChecklist("higiene_habitos", v).conformidade).toBe(true);
    v.salas.miudos.materiaisEstranhos = "sim";
    v.salas.miudos.lavadorBotas = "nao_conforme";
    expect(avaliarChecklist("higiene_habitos", v).motivos).toEqual(["Miúdos — Lavador de botas em pleno funcionamento?: não conforme", "Miúdos — Materiais estranhos no setor"]);
  });

  it("exige resposta de todos os itens das duas salas", () => {
    const v = tudoConforme("higiene_habitos");
    v.salas.carcacas.secadorMaos = "";
    v.salas.miudos.secadorMaos = "";
    expect(motivosBloqueioChecklist("higiene_habitos", v)).toEqual([
      'Higiene e Hábitos Higiênicos dos Colaboradores: responda "Secador de mãos?" (Sala de Pré-resfriamento de Carcaças).',
      'Higiene e Hábitos Higiênicos dos Colaboradores: responda "Secador de mãos?" (Sala de Pré-resfriamento de Miúdos).',
    ]);
  });
});

describe("PSO e Higiene Operacional", () => {
  it("PSO tem 7 itens em 3 blocos (PSO 25, 26 e 28), sem divisão por sala", () => {
    const def = CHECKLISTS.pso;
    expect(Object.keys(checklistVazio("pso").salas)).toEqual(["geral"]);
    expect(def.itens).toHaveLength(7);
    expect(def.itens.filter((i) => i.grupo === "PSO 25")).toHaveLength(1);
    expect(def.itens.filter((i) => i.grupo === "PSO 26")).toHaveLength(2);
    expect(def.itens.filter((i) => i.grupo === "PSO 28")).toHaveLength(4);
  });

  it("PSO não conforme cita só o item (sem sala) e bloqueia com item sem resposta", () => {
    const v = tudoConforme("pso");
    v.salas.geral.soldaEmbalagemKits = "nao_conforme";
    expect(avaliarChecklist("pso", v).motivos).toEqual(["Solda da embalagem dos kits de miúdos para frango inteiro: não conforme"]);
    v.salas.geral.kitsCompletos = "";
    expect(motivosBloqueioChecklist("pso", v)).toHaveLength(1);
    expect(motivosBloqueioChecklist("pso", v)[0]).not.toContain("Sala");
  });

  it("Higiene Operacional cobre as duas salas com piso e rodapés, paredes, equipamentos e calhas", () => {
    const def = CHECKLISTS.higiene_operacional;
    expect(def.itens.map((i) => i.rotulo)).toEqual(["Piso e rodapés", "Paredes", "Equipamentos", "Calhas"]);
    expect(Object.keys(checklistVazio("higiene_operacional").salas)).toEqual(["carcacas", "miudos"]);
    const v = tudoConforme("higiene_operacional");
    v.salas.miudos.calhas = "nao_conforme";
    expect(avaliarChecklist("higiene_operacional", v).motivos).toEqual(["Miúdos — Calhas: não conforme"]);
  });
});

describe("Higiene e Hábitos Higiênicos dos Colaboradores (vários setores)", () => {
  it("tem os 13 itens, sem divisão por sala", () => {
    const def = CHECKLISTS.higiene_colaboradores;
    expect(def.itens).toHaveLength(13);
    expect(def.itens.every((i) => i.modo === "conforme")).toBe(true);
    expect(Object.keys(checklistVazio("higiene_colaboradores").salas)).toEqual(["geral"]);
  });

  it("item não conforme reprova e fica sem prefixo de sala; falta de resposta bloqueia", () => {
    const v = tudoConforme("higiene_colaboradores");
    v.salas.geral.botasLimpas = "nao_conforme";
    expect(avaliarChecklist("higiene_colaboradores", v).motivos).toEqual(["Botas limpas: não conforme"]);
    v.salas.geral.ausenciaBarba = "na";
    expect(avaliarChecklist("higiene_colaboradores", v).conformidade).toBe(false);
    v.salas.geral.toucaAmarrada = "";
    expect(motivosBloqueioChecklist("higiene_colaboradores", v)).toHaveLength(1);
  });
});
