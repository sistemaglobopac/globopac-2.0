import { describe, expect, it } from "vitest";
import type { CampoTemplate } from "@/shared/schema-campos";
import { diffCorrecoes, podeCorrigirMonitoramento } from "@/modules/fichas/utils/correcaoInspetor";

const campoNumero = { chave: "temp", label: "Temperatura", tipo: "numero", obrigatorio: true } as unknown as CampoTemplate;
const campoDoa = { chave: "doa", label: "Rastreabilidade DOA", tipo: "rastreabilidade_doa", obrigatorio: true } as unknown as CampoTemplate;

describe("diffCorrecoes", () => {
  it("registra só o valor que o inspetor mudou, com antigo e novo", () => {
    const r = diffCorrecoes([campoNumero], { temp: 5 }, { temp: 7 });
    expect(r).toEqual({ temp: { old: 5, new: 7, rotulo: "Temperatura" } });
  });

  it("não registra nada quando nada mudou (vazio, texto vazio e NaN são a mesma coisa)", () => {
    expect(diffCorrecoes([campoNumero], { temp: 5 }, { temp: 5 })).toEqual({});
    expect(diffCorrecoes([campoNumero], { temp: undefined }, { temp: Number.NaN })).toEqual({});
    expect(diffCorrecoes([campoNumero], { temp: "" }, { temp: null })).toEqual({});
  });

  it("entra nos itens de lista pelo caminho campo.lista.indice.prop e ignora os dados calculados", () => {
    const antes = { doa: { dataAbate: "2026-10-10", totalMortas: 3, doaTotalPct: 1.5, cargas: [{ cargaId: "a", avesMortas: "3", doaPct: 1.5 }] } };
    const depois = { doa: { dataAbate: "2026-10-10", totalMortas: 9, doaTotalPct: 4.5, cargas: [{ cargaId: "a", avesMortas: "9", doaPct: 4.5 }] } };
    const r = diffCorrecoes([campoDoa], antes, depois);
    expect(Object.keys(r)).toEqual(["doa.cargas.0.avesMortas"]);
    expect(r["doa.cargas.0.avesMortas"]).toMatchObject({ old: "3", new: "9" });
  });

  it("item acrescentado numa lista vira uma correção do item inteiro", () => {
    const antes = { doa: { cargas: [{ cargaId: "a", avesMortas: "1" }] } };
    const depois = { doa: { cargas: [{ cargaId: "a", avesMortas: "1" }, { cargaId: "b", avesMortas: "2" }] } };
    const r = diffCorrecoes([campoDoa], antes, depois);
    expect(Object.keys(r)).toEqual(["doa.cargas.1"]);
    expect(r["doa.cargas.1"]).toMatchObject({ old: null, new: { cargaId: "b", avesMortas: "2" } });
  });
});

describe("podeCorrigirMonitoramento", () => {
  const inspetor = { id: "u1", nivelAcesso: "INSPETOR_QUALIDADE" };
  const registro = { id: "m1", user_id: "u1", verificado_por: null, status_ficha: "FINALIZADO" };

  it("o dono pode corrigir enquanto nada foi verificado", () => {
    expect(podeCorrigirMonitoramento([registro], inspetor)).toEqual({ pode: true });
  });

  it("outro inspetor não pode", () => {
    expect(podeCorrigirMonitoramento([registro], { id: "u2", nivelAcesso: "INSPETOR_QUALIDADE" }).pode).toBe(false);
  });

  it("depois de verificado (em qualquer versão) não pode", () => {
    const cadeia = [{ ...registro, verificado_por: "v1" }, { ...registro, id: "m2" }];
    expect(podeCorrigirMonitoramento(cadeia, inspetor).pode).toBe(false);
  });

  it("monitoramento aguardando a etapa 2 (chiller 2 ou peso) não pode", () => {
    expect(podeCorrigirMonitoramento([{ ...registro, dados_dinamicos: { aguardando_chiller2: true } }], inspetor).pode).toBe(false);
    expect(podeCorrigirMonitoramento([{ ...registro, dados_dinamicos: { aguardando_peso: true } }], inspetor).pode).toBe(false);
  });

  it("monitoramento em andamento não pode", () => {
    expect(podeCorrigirMonitoramento([{ ...registro, status_ficha: "EM_ANDAMENTO" }], inspetor).pode).toBe(false);
  });
});
