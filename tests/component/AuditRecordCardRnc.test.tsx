import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditRecordCard } from "@/modules/fichas/components/AuditRecordCard";
import type { AppointmentDisplay } from "@/modules/fichas/utils/recordGrouping";
import { urlAbrirRnc } from "@/modules/rnc/api";

function item(dados: Record<string, unknown>, conformidade: boolean | null = null): AppointmentDisplay {
  return {
    id: "m1",
    status: "aguardando",
    ordemDia: 1,
    appt: {
      id: "m1",
      ficha_template_id: "t1",
      user_id: "u1",
      setor: "Abate",
      dados_dinamicos: dados,
      conformidade,
      verificado_por: null,
      verificado_em: null,
      criado_em: "2026-10-09T12:00:00Z",
      capturado_em: null,
    },
  };
}

function renderizar(i: AppointmentDisplay, extras: { rncStatus?: "ABERTA" | "FECHADA"; autocorrigido?: boolean; onAbrirRnc?: () => void } = {}) {
  return render(
    <AuditRecordCard
      item={i}
      mode="verificacao"
      selectedIds={new Set()}
      toggleSelection={() => undefined}
      onPreview={() => undefined}
      onImprimir={() => undefined}
      pacPorTemplateId={new Map()}
      nomePorTemplateId={new Map([["t1", "Ficha X"]])}
      codigoPorTemplateId={new Map()}
      usersMap={new Map([["u1", "Maria"]])}
      blockedIds={new Set()}
      isAdmin={false}
      onEncerrarTurno={() => undefined}
      {...extras}
    />
  );
}

describe("Painel de Verificação: abrir RNC de um monitoramento não conforme", () => {
  it("mostra o botão quando o preenchimento tem não conformidade e ainda não há RNC", () => {
    const abrir = vi.fn();
    renderizar(item({ campo: { conformidade: false } }), { onAbrirRnc: abrir });
    fireEvent.click(screen.getByTestId("abrir-rnc-m1"));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("não mostra o botão se está conforme, já tem RNC ou foi autocorrigido", () => {
    const abrir = vi.fn();
    renderizar(item({ campo: { conformidade: true } }), { onAbrirRnc: abrir });
    expect(screen.queryByTestId("abrir-rnc-m1")).toBeNull();
  });

  it("com RNC existente ou autocorreção, o botão some", () => {
    const { unmount } = renderizar(item({ campo: { conformidade: false } }), { onAbrirRnc: () => undefined, rncStatus: "ABERTA" });
    expect(screen.queryByTestId("abrir-rnc-m1")).toBeNull();
    unmount();
    renderizar(item({ campo: { conformidade: false } }), { onAbrirRnc: () => undefined, autocorrigido: true });
    expect(screen.queryByTestId("abrir-rnc-m1")).toBeNull();
  });

  it("o link leva à RNC vinculada e volta para a verificação", () => {
    expect(urlAbrirRnc("abc")).toBe("/nova-rnc?vinculo=abc&voltar=%2Fverificacao");
  });
});
