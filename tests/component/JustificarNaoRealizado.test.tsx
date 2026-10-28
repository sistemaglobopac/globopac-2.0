import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FichaAtivaResumo } from "@/modules/bordo/api";
import type { JustificativaHorario } from "@/modules/fichas/utils/justificativaHorario";

const registrar = vi.fn();
/** Quando preenchido, o registro falha com esta mensagem (função comum, sem rastreio do spy, para o erro ser tratado só pelo componente). */
let falhaDoBanco: string | null = null;

vi.mock("@/modules/bordo/api", async (original) => ({
  ...(await original<typeof import("@/modules/bordo/api")>()),
  useRegistrarMonitoramentoNaoRealizado: () => ({
    mutateAsync: async (entrada: unknown) => {
      registrar(entrada);
      if (falhaDoBanco) throw new Error(falhaDoBanco);
    },
    isPending: false,
  }),
}));

import { JustificativasDoTurno, ModalJustificarNaoRealizado } from "@/modules/bordo/JustificarNaoRealizado";

const ficha = (id: string, codigo: string, nome: string): FichaAtivaResumo =>
  ({ id, codigo, nome, tipo_apontamento: "Recorrente", tempo_entre_apontamentos_min: 60, locais_aplicacao: ["Pré-resfriamento"], pac_correspondente: "PAC 11" }) as FichaAtivaResumo;

const fichas = [ficha("f3", "RAC 003/011", "Absorção - Dados do Processo"), ficha("f4", "RAC 004/011", "Qualidade dos Miúdos e Pertences")];

function abrir(props: Partial<React.ComponentProps<typeof ModalJustificarNaoRealizado>> = {}) {
  const onFechar = vi.fn();
  const onRegistrado = vi.fn();
  render(<ModalJustificarNaoRealizado fichas={fichas} userSetores={["Pré-resfriamento"]} onFechar={onFechar} onRegistrado={onRegistrado} {...props} />);
  return { onFechar, onRegistrado };
}

const escolher = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const horaPassada = () => {
  const d = new Date(Date.now() - 3 * 3600_000);
  // mesmo formato do campo datetime-local, em horário de Manaus
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return f.replace(" ", "T");
};

describe("ModalJustificarNaoRealizado", () => {
  beforeEach(() => {
    registrar.mockReset();
    falhaDoBanco = null;
  });

  it("registra a justificativa de um horário que já passou e fecha", async () => {
    const { onFechar, onRegistrado } = abrir();
    escolher("Ficha", "f3");
    escolher(/Horário em que o monitoramento deveria/, horaPassada());
    escolher("Por que não foi realizado?", "Equipamento em manutenção");
    fireEvent.change(screen.getByLabelText("Detalhes (opcional)"), { target: { value: "Bomba do chiller 2 parada" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));

    await waitFor(() => expect(registrar).toHaveBeenCalledOnce());
    const enviado = registrar.mock.calls[0]![0];
    expect(enviado).toMatchObject({ fichaCodigo: "RAC 003/011", setor: "Pré-resfriamento", motivo: "Equipamento em manutenção", detalhes: "Bomba do chiller 2 parada" });
    expect(enviado.horario).toBeInstanceOf(Date);
    expect(enviado.horario.getTime()).toBeLessThan(Date.now());
    expect(onRegistrado).toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });

  it("não registra sem ficha, sem motivo ou com horário no futuro, e diz o que falta", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Escolha a ficha/);

    escolher("Ficha", "f3");
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    expect(await screen.findByText(/Escolha por que o monitoramento não foi realizado/)).toBeInTheDocument();

    escolher("Por que não foi realizado?", "Processo parado");
    escolher(/Horário em que o monitoramento deveria/, "2099-01-01T10:00");
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    expect(await screen.findByText(/não pode estar no futuro/)).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
  });

  it('"Outro" exige a descrição do motivo', async () => {
    abrir({ fichaInicialId: "f4" });
    escolher("Por que não foi realizado?", "Outro");
    expect(screen.getByLabelText("Descreva o motivo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    expect(await screen.findByText(/Descreva o motivo \(mínimo de 5 caracteres\)/)).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Descreva o motivo"), { target: { value: "Queda do gerador" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    await waitFor(() => expect(registrar).toHaveBeenCalledOnce());
    expect(registrar.mock.calls[0]![0]).toMatchObject({ fichaCodigo: "RAC 004/011", motivo: "Outro", detalhes: "Queda do gerador" });
  });

  it("vem com a ficha e o horário escolhidos quando abre pelo card em atraso", () => {
    abrir({ fichaInicialId: "f3", horarioInicial: new Date("2026-10-28T13:00:00Z") });
    expect(screen.getByLabelText("Ficha")).toHaveValue("f3");
    expect(screen.getByLabelText(/Horário em que o monitoramento deveria/)).toHaveValue("2026-10-28T09:00");
  });

  it("com uma só ficha aplicável, já vem escolhida", () => {
    abrir({ fichas: [fichas[0]!] });
    expect(screen.getByLabelText("Ficha")).toHaveValue("f3");
  });

  it("erro do banco aparece no formulário e o modal continua aberto", async () => {
    falhaDoBanco = "O horário da justificativa não pode estar no futuro.";
    const { onFechar } = abrir({ fichaInicialId: "f3" });
    escolher("Por que não foi realizado?", "Processo parado");
    fireEvent.click(screen.getByRole("button", { name: "Registrar justificativa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não pode estar no futuro/);
    expect(onFechar).not.toHaveBeenCalled();
  });
});

describe("JustificativasDoTurno", () => {
  const just = (extra: Partial<JustificativaHorario> = {}): JustificativaHorario => ({
    ficha_codigo: "RAC 003/011",
    setor: "Pré-resfriamento",
    horario_devido: "2026-10-28T13:00:00Z",
    motivo: "Processo parado",
    detalhes: null,
    registrado_por: "u1",
    registrado_em: "2026-10-28T13:30:00Z",
    ...extra,
  });

  it("sem ficha do PAC 11 para o inspetor, não aparece", () => {
    const { container } = render(<JustificativasDoTurno fichas={[]} justificativas={[just()]} onJustificar={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lista as justificativas (a mais recente por horário) com ficha, motivo e quem registrou, e abre o modal pelo botão", () => {
    const onJustificar = vi.fn();
    render(
      <JustificativasDoTurno
        fichas={fichas}
        justificativas={[just({ motivo: "Processo parado", registrado_em: "2026-10-28T13:10:00Z" }), just({ motivo: "Intervenção do SIF", detalhes: "Auditoria na sala", registrado_em: "2026-10-28T13:40:00Z" }), just({ ficha_codigo: "RAC 999/999" })]}
        nomesUsuarios={new Map([["u1", "Ana Inspetora"]])}
        onJustificar={onJustificar}
      />
    );
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(1); // o mesmo horário vale uma vez; ficha que não é do PAC 11 fica de fora
    expect(itens[0]).toHaveTextContent("Absorção - Dados do Processo");
    expect(itens[0]).toHaveTextContent("Intervenção do SIF");
    expect(itens[0]).toHaveTextContent("Auditoria na sala");
    expect(itens[0]).toHaveTextContent("Ana Inspetora");
    expect(itens[0]).not.toHaveTextContent("Processo parado");

    fireEvent.click(screen.getByTestId("justificar-nao-realizado"));
    expect(onJustificar).toHaveBeenCalled();
  });

  it("botão desligado durante a pausa do inspetor", () => {
    render(<JustificativasDoTurno fichas={fichas} justificativas={[]} bloqueado onJustificar={vi.fn()} />);
    expect(screen.getByTestId("justificar-nao-realizado")).toBeDisabled();
    expect(screen.queryByTestId("lista-justificativas")).toBeNull();
  });
});
