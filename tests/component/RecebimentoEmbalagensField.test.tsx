import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecebimentoEmbalagensField } from "@/modules/fichas/fields/RecebimentoEmbalagensField";
import type { RecebimentoEmbalagensValor } from "@/modules/fichas/fields/tiposCompostos";

describe("RecebimentoEmbalagensField", () => {
  it("abre as perguntas do rótulo só quando há rótulo e marca não conforme", () => {
    const onChange = vi.fn();
    render(<RecebimentoEmbalagensField value={null} onChange={onChange} />);

    expect(screen.queryByText("Leiaute de acordo com a ficha técnica da embalagem?")).toBeNull();
    const grupo = screen.getByRole("radiogroup", { name: "Há rótulo na embalagem?" });
    fireEvent.click(grupo.querySelectorAll("input")[0]!); // Sim
    expect(screen.getByText("Leiaute de acordo com a ficha técnica da embalagem?")).toBeTruthy();
    expect(screen.getByText("Presença da descrição dos produtos?")).toBeTruthy();

    fireEvent.click(screen.getByRole("radiogroup", { name: "Situação do lote" }).querySelectorAll("input")[1]!); // Reprovado
    const ultimo = onChange.mock.calls.at(-1)![0] as RecebimentoEmbalagensValor;
    expect(ultimo.situacaoLote).toBe("reprovado");
    expect(ultimo.conformidade).toBe(false);
    expect(screen.getByText("NÃO CONFORME")).toBeTruthy();
    expect(screen.getAllByRole("textbox", { name: /amostra/i })).toHaveLength(20);
  });
});
