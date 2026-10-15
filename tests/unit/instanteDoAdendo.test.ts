import { beforeEach, describe, expect, it, vi } from "vitest";

const originais = vi.hoisted(() => ({ linhas: [] as unknown[], erro: null as unknown }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({ overrideTypes: () => Promise.resolve({ data: originais.erro ? null : originais.linhas, error: originais.erro }) }),
      }),
    }),
  },
}));

import { herdarInstanteDoOriginal } from "@/modules/fichas/utils/instanteDoAdendo";
import { chaveDossie } from "@/modules/fichas/utils/recordGrouping";
import { instanteDoRegistro } from "@/modules/fichas/utils/horaMonitoramento";

const tipo = () => "RAC 007/014";
const turno = () => "1º Turno";
const chave = (m: Parameters<typeof chaveDossie>[0]) => chaveDossie(m, tipo, turno);

// Monitoramento antigo (sem hora informada) do dia 05/10, e o adendo dele assinado só no dia 14/10 (06:33 em Manaus).
const original = { id: "orig", criado_em: "2026-10-05T17:01:25Z", hora_monitoramento: null, dados_dinamicos: {} };
const adendoDe05 = { id: "ad", user_id: "u", ficha_template_id: "t", criado_em: "2026-10-14T10:33:53Z", hora_monitoramento: null, dados_dinamicos: {}, aditivo_de: "orig" };
const doDia14 = { id: "d14", user_id: "u", ficha_template_id: "t", criado_em: "2026-10-14T19:36:45Z", hora_monitoramento: "2026-10-14T19:36:00Z", dados_dinamicos: {}, aditivo_de: null };

describe("adendo fica no dia do monitoramento original", () => {
  beforeEach(() => {
    originais.linhas = [original];
    originais.erro = null;
  });

  it("sem a herança, o adendo de 05/10 assinado em 14/10 cai no mesmo dossiê de 14/10 (o defeito)", () => {
    expect(chave(adendoDe05)).toBe(chave(doDia14));
  });

  it("o adendo sem hora própria herda o instante do original e sai do dossiê do dia da assinatura", async () => {
    const [ad] = await herdarInstanteDoOriginal([adendoDe05]);
    expect(instanteDoRegistro(ad!)).toBe(original.criado_em);
    expect(chave(ad!)).not.toBe(chave(doDia14));
    expect(chave(ad!)).toContain("2026-10-05");
  });

  it("herda a hora informada do original quando ele a tem", async () => {
    originais.linhas = [{ ...original, hora_monitoramento: "2026-10-05T13:00:00Z" }];
    const [ad] = await herdarInstanteDoOriginal([adendoDe05]);
    expect(instanteDoRegistro(ad!)).toBe("2026-10-05T13:00:00Z");
  });

  it("não mexe em quem já tem hora própria, nem em registros que não são adendo", async () => {
    const comHora = { ...adendoDe05, hora_monitoramento: "2026-10-05T18:00:00Z" };
    const r = await herdarInstanteDoOriginal([comHora, doDia14]);
    expect(r[0]).toBe(comHora);
    expect(r[1]).toBe(doDia14);
  });

  it("falha ao ler o original não derruba a tela: devolve os registros como vieram", async () => {
    originais.erro = new Error("rede");
    const r = await herdarInstanteDoOriginal([adendoDe05]);
    expect(r[0]).toBe(adendoDe05);
  });
});
