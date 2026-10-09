import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DadosColetados } from "@/modules/fichas/components/DadosColetadosFicha";
import type { CampoTemplate } from "@/shared/schema-campos";

const campos = [
  { chave: "miudos", tipo: "qualidade_miudos", label: "Qualidade de Miúdos", obrigatorio: true },
  { chave: "obs", tipo: "texto", label: "Observação", obrigatorio: false },
] as unknown as CampoTemplate[];

const naoConforme = { miudos: { partes: {}, observacao: "", conformidade: false, detalhesRNC: "x" }, obs: "ok" };
const conforme = { miudos: { partes: {}, observacao: "", conformidade: true, detalhesRNC: null }, obs: "ok" };

describe("relatório: barra de ações sobre o campo não conforme", () => {
  it("mostra Incluir adendo e Abrir RNC acima do campo não conforme e dispara com a chave do campo", () => {
    const onAdendo = vi.fn();
    const onAbrirRnc = vi.fn();
    render(<DadosColetados dadosDinamicos={naoConforme} campos={campos} acoesNaoConformidade={{ onAdendo, onAbrirRnc }} />);
    fireEvent.click(screen.getByTestId("nc-adendo-miudos"));
    fireEvent.click(screen.getByTestId("nc-rnc-miudos"));
    expect(onAdendo).toHaveBeenCalledWith("miudos");
    expect(onAbrirRnc).toHaveBeenCalledWith("miudos");
  });

  it("só mostra o botão de ação disponível (sem adendo, só RNC)", () => {
    render(<DadosColetados dadosDinamicos={naoConforme} campos={campos} acoesNaoConformidade={{ onAbrirRnc: () => undefined }} />);
    expect(screen.queryByTestId("nc-adendo-miudos")).toBeNull();
    expect(screen.getByTestId("nc-rnc-miudos")).toBeInTheDocument();
  });

  it("não mostra nada em campo conforme nem quando a tela não passa as ações (impressão)", () => {
    const { unmount } = render(<DadosColetados dadosDinamicos={conforme} campos={campos} acoesNaoConformidade={{ onAdendo: () => undefined, onAbrirRnc: () => undefined }} />);
    expect(screen.queryByTestId("nc-acoes-miudos")).toBeNull();
    unmount();
    render(<DadosColetados dadosDinamicos={naoConforme} campos={campos} />);
    expect(screen.queryByTestId("nc-acoes-miudos")).toBeNull();
  });
});
