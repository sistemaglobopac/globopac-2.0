import { beforeEach, describe, expect, it } from "vitest";
import { idDoDispositivo, jsonEstavel, montarConfirmacaoOffline, sha256Hex } from "@/lib/confirmacaoOffline";
import { listarFichasEnfileiradas, removerFichaEnfileirada } from "@/lib/offlineQueue";
import { listarRascunhos, removerRascunho, salvarRascunho } from "@/lib/rascunhos";
import { confirmarRascunhosOffline } from "@/modules/fichas/useRascunhos";

const USUARIO = "22222222-2222-2222-2222-222222222222";
const DADOS = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  fichaTemplateId: "11111111-1111-1111-1111-111111111111",
  versaoTemplate: 1,
  userId: USUARIO,
  setor: "SALA_CORTES",
  dadosDinamicos: { temperatura_celsius: 5, hora_monitoramento: "2026-10-07T10:00:00.000Z" },
  capturadoEm: "2026-10-07T10:00:00.000Z",
};

describe("evidência da confirmação offline", () => {
  it("o aparelho recebe um id estável (o servidor usa para provar quando ele esteve online)", () => {
    const a = idDoDispositivo();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(idDoDispositivo()).toBe(a);
  });

  it("o hash local independe da ordem das chaves e muda se um dado muda", async () => {
    expect(jsonEstavel({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe('{"a":[2,{"c":3,"d":4}],"b":1}');
    const h1 = await sha256Hex(jsonEstavel({ x: 1, y: 2 }));
    expect(await sha256Hex(jsonEstavel({ y: 2, x: 1 }))).toBe(h1);
    expect(await sha256Hex(jsonEstavel({ x: 1, y: 3 }))).not.toBe(h1);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("monta matrícula, onde a senha foi conferida, aparelho e hash dos dados", async () => {
    const c = await montarConfirmacaoOffline({ dados: DADOS, senhaConferidaEm: "aparelho", matricula: "1234", agora: new Date("2026-10-07T10:05:00.000Z") });
    expect(c).toMatchObject({ versao: 1, matricula: "1234", senha_conferida_em: "aparelho", confirmado_em: "2026-10-07T10:05:00.000Z" });
    expect(c.dispositivo_id).toBe(idDoDispositivo());
    expect(c.hash_local).toBe(await sha256Hex(jsonEstavel(DADOS)));
  });
});

describe("rascunhos confirmados sem internet entram na fila", () => {
  beforeEach(async () => {
    await Promise.all((await listarFichasEnfileiradas()).map((i) => removerFichaEnfileirada(i.id)));
    await Promise.all((await listarRascunhos(USUARIO)).map((r) => removerRascunho(r.id)));
  });

  function rascunho(id: string, hora: Date) {
    return {
      id,
      fichaTemplateId: DADOS.fichaTemplateId,
      codigo: "TEMP",
      nomeFicha: "Temperatura",
      versaoTemplate: 1,
      userId: USUARIO,
      setor: "SALA_CORTES",
      dadosDinamicos: { temperatura_celsius: 5, hora_monitoramento: hora.toISOString() },
      horaMonitoramento: hora.toISOString(),
      naoConforme: false,
      motivosNc: [],
    };
  }

  it("vai para a fila com a evidência e sai da lista de rascunhos; o vencido (7 dias) fica de fora", async () => {
    const agora = Date.now();
    await salvarRascunho(rascunho("r-novo", new Date(agora - 3_600_000)));
    await salvarRascunho(rascunho("r-vencido", new Date(agora - 170 * 3_600_000)));

    const rascunhos = await listarRascunhos(USUARIO);
    const r = await confirmarRascunhosOffline(rascunhos, USUARIO, { modo: "aparelho", matricula: "1234" });

    expect(r.enfileirados).toEqual(["r-novo"]);
    expect(r.expirados).toEqual(["r-vencido"]);

    const fila = await listarFichasEnfileiradas();
    expect(fila).toHaveLength(1);
    expect(fila[0].id).toBe("r-novo");
    expect(fila[0].confirmacaoOffline).toMatchObject({ senha_conferida_em: "aparelho", matricula: "1234" });
    expect(fila[0].capturadoEm).toBe(rascunhos.find((x) => x.id === "r-novo")!.horaMonitoramento);

    const restantes = (await listarRascunhos(USUARIO)).map((x) => x.id);
    expect(restantes).toEqual(["r-vencido"]);
  });
});
