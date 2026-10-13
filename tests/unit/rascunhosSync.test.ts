import { describe, expect, it } from "vitest";
import { planejarSincronizacao, type RascunhoLocalMin, type RascunhoNuvemMin } from "@/lib/rascunhosSync";

const local = (id: string, salvoEm = "2026-10-13T10:00:00Z", status: RascunhoLocalMin["status"] = "rascunho"): RascunhoLocalMin => ({ id, salvoEm, status });
const nuvem = (id: string, status: RascunhoNuvemMin["status"] = "pendente", salvoEm = "2026-10-13T10:00:00Z"): RascunhoNuvemMin => ({ id, status, salvoEm });
const vazio = new Set<string>();

describe("planejarSincronizacao (rascunhos do aparelho × nuvem)", () => {
  it("o que só existe neste aparelho é enviado", () => {
    expect(planejarSincronizacao([local("a")], [], vazio)).toEqual({ enviar: ["a"], baixar: [], apagarLocal: [], marcarAssinadoNaNuvem: [] });
  });

  it("o que só existe na nuvem (feito em outro aparelho) é trazido para este", () => {
    expect(planejarSincronizacao([], [nuvem("b")], vazio)).toEqual({ enviar: [], baixar: ["b"], apagarLocal: [], marcarAssinadoNaNuvem: [] });
  });

  it("assinado ou descartado em outro aparelho sai deste e nunca ressuscita", () => {
    const p = planejarSincronizacao([local("a"), local("b")], [nuvem("a", "assinado"), nuvem("b", "descartado")], vazio);
    expect(p.apagarLocal.sort()).toEqual(["a", "b"]);
    expect(p.enviar).toEqual([]);
    // e a cópia descartada/assinada na nuvem não volta como pendente para um aparelho que não a tem
    expect(planejarSincronizacao([], [nuvem("c", "descartado"), nuvem("d", "assinado")], vazio).baixar).toEqual([]);
  });

  it("rascunho que já virou monitoramento sai do aparelho e é marcado como assinado na nuvem", () => {
    const comMonitoramento = new Set(["a", "b"]);
    const p = planejarSincronizacao([local("a")], [nuvem("a"), nuvem("b")], comMonitoramento);
    expect(p.apagarLocal).toEqual(["a"]);
    expect(p.marcarAssinadoNaNuvem.sort()).toEqual(["a", "b"]);
    expect(p.baixar).toEqual([]);
    // só existia aqui, sem cópia na nuvem: sai sem tentar marcar nada
    expect(planejarSincronizacao([local("z")], [], new Set(["z"]))).toEqual({ enviar: [], baixar: [], apagarLocal: ["z"], marcarAssinadoNaNuvem: [] });
  });

  it("nos dois lados vale o mais recente", () => {
    const maisNovoAqui = planejarSincronizacao([local("a", "2026-10-13T12:00:00Z")], [nuvem("a", "pendente", "2026-10-13T10:00:00Z")], vazio);
    expect(maisNovoAqui.enviar).toEqual(["a"]);
    const maisNovoNaNuvem = planejarSincronizacao([local("a", "2026-10-13T10:00:00Z")], [nuvem("a", "pendente", "2026-10-13T12:00:00Z")], vazio);
    expect(maisNovoNaNuvem.baixar).toEqual(["a"]);
    const iguais = planejarSincronizacao([local("a")], [nuvem("a")], vazio);
    expect(iguais).toEqual({ enviar: [], baixar: [], apagarLocal: [], marcarAssinadoNaNuvem: [] });
  });

  it("não mexe no rascunho que está sendo assinado agora", () => {
    const p = planejarSincronizacao([local("a", "2026-10-13T10:00:00Z", "assinando")], [nuvem("a", "descartado")], vazio);
    expect(p).toEqual({ enviar: [], baixar: [], apagarLocal: [], marcarAssinadoNaNuvem: [] });
  });
});
