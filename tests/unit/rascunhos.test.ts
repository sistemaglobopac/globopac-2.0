import { beforeEach, describe, expect, it, vi } from "vitest";
import { isoDeManaus, validarHoraMonitoramento, horaEfetiva } from "@/modules/fichas/utils/horaMonitoramento";
import { combinarAnterior } from "@/modules/fichas/utils/rascunhosAnterior";
import { listarRascunhos, rascunhoExpirado, removerRascunho, salvarRascunho, type Rascunho } from "@/lib/rascunhos";

const sincronizarUmaFicha = vi.fn();
vi.mock("@/modules/fichas/sincronizacaoOffline", () => ({ sincronizarUmaFicha: (item: unknown) => sincronizarUmaFicha(item) }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const AGORA = new Date("2026-10-06T16:00:00Z"); // 12:00 em Manaus

describe("hora do monitoramento (informada manualmente)", () => {
  it("converte data+hora de Manaus (UTC-4) para ISO", () => {
    expect(isoDeManaus("2026-10-06", "08:30")).toBe("2026-10-06T12:30:00.000Z");
    expect(isoDeManaus("2026-10-06", "")).toBeNull();
    expect(isoDeManaus("", "08:30")).toBeNull();
  });

  it("obrigatória, não futura e dentro de 7 dias", () => {
    expect(validarHoraMonitoramento({ hora: null, agora: AGORA })).toMatch(/Informe/);
    expect(validarHoraMonitoramento({ hora: "2026-10-06T17:00:00Z", agora: AGORA })).toMatch(/futura/);
    expect(validarHoraMonitoramento({ hora: "2026-10-06T16:03:00Z", agora: AGORA })).toBeNull(); // folga de 5 min
    expect(validarHoraMonitoramento({ hora: "2026-09-29T15:59:00Z", agora: AGORA })).toMatch(/7 dias/);
    expect(validarHoraMonitoramento({ hora: "2026-09-29T16:30:00Z", agora: AGORA })).toBeNull();
  });

  it("posterior ao anterior e respeitando o intervalo mínimo, contado da hora do anterior", () => {
    const anterior = "2026-10-06T12:00:00Z"; // 08:00 Manaus
    expect(validarHoraMonitoramento({ hora: "2026-10-06T11:00:00Z", agora: AGORA, anteriorEm: anterior })).toMatch(/posterior/);
    expect(validarHoraMonitoramento({ hora: "2026-10-06T12:30:00Z", agora: AGORA, anteriorEm: anterior, intervaloMin: 60 })).toMatch(/intervalo mínimo/);
    // o intervalo conta da hora em que o anterior foi REALIZADO, não de quando foi assinado
    expect(validarHoraMonitoramento({ hora: "2026-10-06T13:00:00Z", agora: AGORA, anteriorEm: anterior, intervaloMin: 60 })).toBeNull();
    expect(validarHoraMonitoramento({ hora: "2026-10-06T13:00:00Z", agora: AGORA, anteriorEm: anterior, intervaloMin: null })).toBeNull();
  });

  it("horaEfetiva: a informada; registro antigo cai em criado_em", () => {
    expect(horaEfetiva({ hora_monitoramento: "2026-10-06T12:00:00Z", criado_em: "2026-10-06T20:00:00Z" })).toBe("2026-10-06T12:00:00Z");
    expect(horaEfetiva({ hora_monitoramento: null, criado_em: "2026-10-06T20:00:00Z" })).toBe("2026-10-06T20:00:00Z");
  });
});

const rascunho = (id: string, hora: string, extra: Partial<Rascunho> = {}): Omit<Rascunho, "salvoEm" | "status"> => ({
  id,
  fichaTemplateId: "t1",
  codigo: "RAC 001",
  nomeFicha: "Ficha",
  versaoTemplate: 1,
  userId: "u1",
  setor: "S1",
  dadosDinamicos: { campo: id, hora_monitoramento: hora },
  horaMonitoramento: hora,
  naoConforme: false,
  motivosNc: [],
  ...extra,
});

describe("rascunhos locais", () => {
  beforeEach(async () => {
    for (const r of await listarRascunhos("u1")) await removerRascunho(r.id);
    for (const r of await listarRascunhos("u2")) await removerRascunho(r.id);
    sincronizarUmaFicha.mockReset();
  });

  it("salva, lista por usuário e ordena pela hora do monitoramento", async () => {
    await salvarRascunho(rascunho("b", "2026-10-06T13:00:00Z"));
    await salvarRascunho(rascunho("a", "2026-10-06T11:00:00Z"));
    await salvarRascunho(rascunho("x", "2026-10-06T12:00:00Z", { userId: "u2" }));
    expect((await listarRascunhos("u1")).map((r) => r.id)).toEqual(["a", "b"]);
    expect((await listarRascunhos("u2")).map((r) => r.id)).toEqual(["x"]);
  });

  it("expira 7 dias depois da hora do monitoramento", () => {
    const r = { horaMonitoramento: "2026-09-29T12:00:00Z" };
    expect(rascunhoExpirado(r, new Date("2026-10-06T11:59:00Z"))).toBe(false);
    expect(rascunhoExpirado(r, new Date("2026-10-06T12:01:00Z"))).toBe(true);
  });

  it("o próximo monitoramento herda do rascunho mais recente (mesma ficha, setor, dia e turno)", async () => {
    const r1 = await salvarRascunho(rascunho("r1", "2026-10-06T12:00:00Z"));
    const r2 = await salvarRascunho(rascunho("r2", "2026-10-06T14:00:00Z"));
    const outraFicha = await salvarRascunho(rascunho("o", "2026-10-06T15:00:00Z", { codigo: "OUTRA" }));
    const servidor = { id: "s", dados_dinamicos: { campo: "servidor" }, criado_em: "2026-10-06T10:00:00Z" };

    const ant = combinarAnterior(servidor, [r1, r2, outraFicha], "RAC 001", "S1", "1º Turno", AGORA);
    expect(ant?.id).toBe("r2");
    // sem rascunho mais novo, vale o do servidor
    expect(combinarAnterior(servidor, [], "RAC 001", "S1", "1º Turno", AGORA)?.id).toBe("s");
    // nada em lugar nenhum
    expect(combinarAnterior(null, [], "RAC 001", "S1", "1º Turno", AGORA)).toBeNull();
    expect(combinarAnterior(undefined, undefined, "RAC 001", "S1", "1º Turno", AGORA)).toBeUndefined();
    // rascunho de outro dia não é herdado
    const ontem = await salvarRascunho(rascunho("ontem", "2026-10-05T14:00:00Z"));
    expect(combinarAnterior(null, [ontem], "RAC 001", "S1", "1º Turno", AGORA)).toBeNull();
    // em continuação (monitoramentos pendentes de ontem), o rascunho de ontem É o anterior, de qualquer dia/turno
    const ontem2 = await salvarRascunho(rascunho("ontem2", "2026-10-05T22:00:00Z"));
    expect(combinarAnterior({ id: "s", dados_dinamicos: {}, criado_em: "2026-10-05T19:32:00Z" }, [ontem, ontem2], "RAC 001", "S1", undefined, AGORA, "continuacao")?.id).toBe("ontem2");
  });

  it("assinatura em lote: o que falha continua como rascunho; o vencido não é enviado", async () => {
    const { assinarRascunhosEmLote } = await import("@/modules/fichas/useRascunhos");
    const agoraReal = Date.now();
    const h = (min: number) => new Date(agoraReal - min * 60_000).toISOString();
    await salvarRascunho(rascunho("ok", h(30)));
    await salvarRascunho(rascunho("falha", h(20)));
    await salvarRascunho(rascunho("vencido", h(169 * 60)));
    sincronizarUmaFicha.mockImplementation(async (item: { id: string }) => {
      if (item.id === "falha") throw new Error("sem rede");
    });

    const progresso: number[] = [];
    const lote = await listarRascunhos("u1");
    const r = await assinarRascunhosEmLote(lote, "u1", (atual) => progresso.push(atual));

    expect(r.assinados).toEqual(["ok"]);
    expect(r.falharam).toEqual([{ id: "falha", erro: "sem rede" }]);
    expect(r.expirados).toEqual(["vencido"]);
    expect(progresso).toEqual([1, 2, 3]);
    expect(sincronizarUmaFicha).toHaveBeenCalledTimes(2);
    // enviou com a hora do monitoramento nos dados assinados
    expect(sincronizarUmaFicha.mock.calls[0]![0]).toMatchObject({ id: "ok", dadosDinamicos: { hora_monitoramento: expect.any(String) } });

    const restantes = (await listarRascunhos("u1")).map((x) => [x.id, x.status]);
    expect(restantes).toEqual([
      ["vencido", "rascunho"],
      ["falha", "falhou"],
    ]);
  });
});
