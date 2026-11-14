import { describe, expect, it } from "vitest";
import { SETOR_FOMENTO_AVICOLA, setorCadastradoDe, setorDestinoDaRnc } from "@/shared/setor-rnc";

describe("setor de destino da RNC", () => {
  it("campo não conforme com setorRnc manda a RNC para esse setor", () => {
    expect(setorDestinoDaRnc({ a: { conformidade: true }, h: { conformidade: false, setorRnc: SETOR_FOMENTO_AVICOLA } })).toBe("FOMENTO AVÍCOLA");
  });

  it("campo conforme não muda o setor (mesmo com setorRnc gravado)", () => {
    expect(setorDestinoDaRnc({ h: { conformidade: true, setorRnc: SETOR_FOMENTO_AVICOLA } })).toBeNull();
  });

  it("sem setorRnc, vale o setor do monitoramento", () => {
    expect(setorDestinoDaRnc({ x: { conformidade: false } })).toBeNull();
    expect(setorDestinoDaRnc({ x: "texto", y: 3, z: null, w: [1] })).toBeNull();
    expect(setorDestinoDaRnc(null)).toBeNull();
    expect(setorDestinoDaRnc(undefined)).toBeNull();
    expect(setorDestinoDaRnc({ h: { conformidade: false, setorRnc: "  " } })).toBeNull();
  });

  it("usa a grafia do cadastro de setores, ignorando acento, caixa e espaços", () => {
    expect(setorCadastradoDe("FOMENTO AVÍCOLA", ["Recepção", "Fomento Avicola"])).toBe("Fomento Avicola");
    expect(setorCadastradoDe("FOMENTO AVÍCOLA", ["Recepção", "fomento  avícola "])).toBe("fomento  avícola ");
    expect(setorCadastradoDe("FOMENTO AVÍCOLA", ["Fomento Avícola"])).toBe("Fomento Avícola");
  });

  it("sem correspondência no cadastro, mantém o nome do destino", () => {
    expect(setorCadastradoDe("FOMENTO AVÍCOLA", ["Recepção"])).toBe("FOMENTO AVÍCOLA");
    expect(setorCadastradoDe("FOMENTO AVÍCOLA", undefined)).toBe("FOMENTO AVÍCOLA");
  });
});
