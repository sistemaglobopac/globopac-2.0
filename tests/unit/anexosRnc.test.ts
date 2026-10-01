import { describe, expect, it } from "vitest";
import { nomeSeguroArquivo } from "@/modules/rnc/api";

describe("nomeSeguroArquivo", () => {
  it("remove acentos, espaços e caracteres especiais do nome no storage", () => {
    expect(nomeSeguroArquivo("Foto da câmara fria (1).jpg")).toBe("Foto_da_camara_fria_1_.jpg");
    expect(nomeSeguroArquivo("comprovação/ação.pdf")).toBe("comprovacao_acao.pdf");
  });

  it("limita o tamanho mantendo o final (extensão)", () => {
    const nome = nomeSeguroArquivo(`${"a".repeat(200)}.pdf`);
    expect(nome.length).toBeLessThanOrEqual(80);
    expect(nome.endsWith(".pdf")).toBe(true);
  });
});
