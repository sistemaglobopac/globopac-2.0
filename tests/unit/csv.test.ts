import { describe, expect, it } from "vitest";
import { linhasParaCsv } from "@/lib/csv";

describe("linhasParaCsv", () => {
  it("gera cabeçalho e linhas na ordem das colunas declaradas", () => {
    const csv = linhasParaCsv(
      [
        { chave: "id", rotulo: "ID" },
        { chave: "nome", rotulo: "Nome" },
      ],
      [{ id: "1", nome: "Ana" }]
    );
    expect(csv).toBe("ID,Nome\r\n1,Ana");
  });

  it("escapa campos com vírgula, aspas ou quebra de linha entre aspas duplas", () => {
    const csv = linhasParaCsv(
      [{ chave: "descricao", rotulo: "Descrição" }],
      [{ descricao: 'contém, vírgula e "aspas"' }, { descricao: "linha\nquebrada" }]
    );
    expect(csv).toBe('Descrição\r\n"contém, vírgula e ""aspas"""\r\n"linha\nquebrada"');
  });

  it("converte null/undefined em campo vazio, não em 'null'/'undefined' literal", () => {
    const csv = linhasParaCsv([{ chave: "valor", rotulo: "Valor" }], [{ valor: null }, { valor: undefined }]);
    expect(csv).toBe("Valor\r\n\r\n");
  });
});
