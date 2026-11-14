import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HematomasField } from "@/modules/fichas/fields/HematomasField";
import type { HematomasCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

const carga = (id: string, gta: string) => ({ id, gta, integrado: "I", aviario: "A", nucleo: "", qtd_aves: 5000, data_abate: "2026-11-14" });
vi.mock("@/modules/recepcao/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recepcao/api")>()),
  useCargasDoDia: () => ({ data: [carga("c1", "GTA-1"), carga("c2", "GTA-2")] }),
}));

/** Preenche a primeira carga e devolve o último valor emitido pelo campo. */
async function preencher(avaliadas: string, asas: string, peito: string, coxa: string, fraturas: string) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<HematomasField value={undefined} onChange={onChange} />);
  await user.selectOptions(screen.getByLabelText("Carga (GTA)"), "c1");
  await user.type(screen.getByLabelText("Carcaças avaliadas"), avaliadas);
  await user.type(screen.getByLabelText("Contusões nas asas"), asas);
  await user.type(screen.getByLabelText("Contusões no peito"), peito);
  await user.type(screen.getByLabelText("Contusões na coxa"), coxa);
  await user.type(screen.getByLabelText("Fraturas"), fraturas);
  return () => onChange.mock.calls.at(-1)![0] as HematomasCarcacasValor;
}

describe("HematomasField", () => {
  it("lista as cargas do dia para o inspetor selecionar", () => {
    render(<HematomasField value={undefined} onChange={() => undefined} />);
    const opcoes = within(screen.getByLabelText("Carga (GTA)")).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(opcoes.some((t) => t.includes("GTA-1"))).toBe(true);
    expect(opcoes.some((t) => t.includes("GTA-2"))).toBe(true);
  });

  it("dentro do limite: mostra o percentual calculado, CONFORME, e não aponta setor de RNC", async () => {
    const ultimo = await preencher("100", "1", "1", "1", "0");
    expect(screen.getByTestId("hematomas-pct-contusoesAsas-0").textContent).toContain("1%");
    const resumo = screen.getByTestId("hematomas-calculado-0").textContent ?? "";
    expect(resumo).toContain("Total de lesões: 3");
    expect(resumo).toContain("CONFORME");
    expect(screen.getByTestId("hematomas").textContent).not.toContain("FOMENTO AVÍCOLA");
    const v = ultimo();
    expect(v.conformidade).toBe(true);
    expect(v.cargas[0]!.totalLesoes).toBe(3);
  });

  it("a soma não decide: 4 tipos em 4% somam 16% e a carga segue CONFORME", async () => {
    const ultimo = await preencher("100", "4", "4", "4", "4");
    expect(screen.getByTestId("hematomas-calculado-0").textContent).toContain("CONFORME");
    expect(screen.getByTestId("hematomas-calculado-0").textContent).not.toContain("NÃO CONFORME");
    expect(ultimo().conformidade).toBe(true);
  });

  it("um tipo acima de 4%: NÃO CONFORME, destaca o tipo e avisa que a RNC vai para o Fomento Avícola", async () => {
    const ultimo = await preencher("100", "5", "0", "0", "0");
    expect(screen.getByTestId("hematomas-pct-contusoesAsas-0").textContent).toContain("5%");
    expect(screen.getByTestId("hematomas-pct-contusoesAsas-0").textContent).toContain("acima de 4%");
    expect(screen.getByTestId("hematomas-pct-contusoesPeito-0").textContent).not.toContain("acima de");
    expect(screen.getByTestId("hematomas-calculado-0").textContent).toContain("NÃO CONFORME: contusões nas asas");
    expect(screen.getByTestId("hematomas").textContent).toContain("FOMENTO AVÍCOLA");
    const v = ultimo();
    expect(v.conformidade).toBe(false);
    expect(v.setorRnc).toBe("FOMENTO AVÍCOLA");
    expect(v.detalhesRNC).toContain("contusões nas asas 5%");
  });

  it("mostra o percentual de cada tipo de lesão sobre as carcaças avaliadas", async () => {
    await preencher("200", "5", "0", "2", "1");
    expect(screen.getByTestId("hematomas-pct-contusoesAsas-0").textContent).toContain("2,5%");
    expect(screen.getByTestId("hematomas-pct-fraturas-0").textContent).toContain("0,5%");
  });

  it("só aceita dígitos nas contagens", async () => {
    const user = userEvent.setup();
    render(<HematomasField value={undefined} onChange={() => undefined} />);
    const campo = screen.getByLabelText("Fraturas") as HTMLInputElement;
    await user.type(campo, "1a,2");
    expect(campo.value).toBe("12");
  });
});
