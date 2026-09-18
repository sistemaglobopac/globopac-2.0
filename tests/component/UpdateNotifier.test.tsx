import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { UpdateNotifier } from "@/shared/UpdateNotifier";

describe("UpdateNotifier", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("não mostra nada enquanto o build-meta.json bate com a versão carregada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: __APP_BUILD_ID__ }) })
    );
    render(<UpdateNotifier />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.queryByText("Nova versão disponível.")).not.toBeInTheDocument();
  });

  it("mostra o aviso quando build-meta.json reporta um buildId diferente do carregado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ buildId: "outro-build-id" }) })
    );
    render(<UpdateNotifier />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    await waitFor(() => expect(screen.getByText("Nova versão disponível.")).toBeInTheDocument());
  });

  it("ignora silenciosamente falha de rede — não deve travar nem mostrar erro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<UpdateNotifier />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.queryByText("Nova versão disponível.")).not.toBeInTheDocument();
  });
});
