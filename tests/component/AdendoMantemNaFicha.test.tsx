import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { VerificarFichaPage } from "@/modules/fichas/VerificarFichaPage";
import { useSessionStore } from "@/store/session";

const abrirAdendo = vi.fn();
const registro = {
  id: "m1",
  ficha_template_id: "t1",
  versao_template: 1,
  user_id: "insp",
  setor: "SALA_CORTES",
  dados_dinamicos: { temperatura_celsius: 5 },
  conformidade: true,
  verificado_por: null,
  verificado_em: null,
  liberado_sif: false,
  origem_versao: "v2",
  aditivo_de: null,
  criado_em: "2026-10-07T14:00:00Z",
  capturado_em: null,
};
const dados = {
  monitoramentos: [registro],
  templatesPorId: new Map([["t1", { schema_campos: [{ chave: "temperatura_celsius", label: "Temperatura", tipo: "numero" }] }]]),
};

vi.mock("@/modules/fichas/api", () => ({
  useDadosRelatorio: () => ({ data: dados, isLoading: false, isError: false }),
  useAbrirAdendo: () => ({ mutateAsync: abrirAdendo, isPending: false }),
  useVerificarMonitoramento: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/modules/fichas/components/relatorio/RelatorioMonitoramento", () => ({ RelatorioMonitoramento: () => <div>RELATORIO</div> }));
vi.mock("@/modules/fichas/useTurnoDoRegistro", () => ({ useTurnoDoRegistro: () => () => "1º Turno" }));
vi.mock("@/modules/fichas/utils/turnoUtils", () => ({ turnosBloqueadosMap: async () => new Set<string>() }));

// Os rótulos do formulário de adendo não têm htmlFor: os campos são localizados pela ordem na tela.
async function preencherAdendo(user: ReturnType<typeof userEvent.setup>, novoValor: string, observacao: string) {
  await user.selectOptions(screen.getByRole("combobox"), "temperatura_celsius");
  const [valor, nota] = screen.getAllByRole("textbox");
  await user.type(valor!, novoValor);
  await user.type(nota!, observacao);
}

function pagina() {
  return render(
    <MemoryRouter initialEntries={["/verificacao/ficha?ids=m1"]}>
      <Routes>
        <Route path="/verificacao/ficha" element={<VerificarFichaPage />} />
        <Route path="/verificacao" element={<div>PAINEL DE VERIFICACAO</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("adendo solicitado pelo verificador não fecha a ficha", () => {
  beforeEach(() => {
    abrirAdendo.mockReset().mockResolvedValue(undefined);
    useSessionStore.setState({ perfil: { id: "ver", nomeCompleto: "Vera Verificadora", nivelAcesso: "VERIFICADOR", setoresPermitidos: ["Todos"] } });
  });
  afterEach(() => useSessionStore.setState({ perfil: null }));

  it("depois de enviar o adendo, continua na ficha com o aviso e as ações disponíveis (verificar, outro adendo, rejeitar)", async () => {
    const user = userEvent.setup();
    pagina();
    await user.click(screen.getByRole("button", { name: /Incluir Adendo/ }));
    await preencherAdendo(user, "6", "leitura digitada errada");
    await user.click(screen.getByRole("button", { name: "Enviar Adendo" }));

    await waitFor(() => expect(abrirAdendo).toHaveBeenCalledOnce());
    expect(abrirAdendo.mock.calls[0]![0]).toMatchObject({ monitoramentoId: "m1", campo: "temperatura_celsius", valorNovo: "6", notes: "leitura digitada errada" });

    // continua na ficha: aviso de sucesso, relatório na tela e as três ações de volta
    expect(await screen.findByTestId("adendo-enviado")).toHaveTextContent("Adendo enviado");
    expect(screen.queryByText("PAINEL DE VERIFICACAO")).not.toBeInTheDocument();
    expect(screen.getByText("RELATORIO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verificar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Incluir Adendo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rejeitar/ })).toBeInTheDocument();
  });

  it("começar outra ação apaga o aviso do adendo anterior", async () => {
    const user = userEvent.setup();
    pagina();
    await user.click(screen.getByRole("button", { name: /Incluir Adendo/ }));
    await preencherAdendo(user, "6", "x");
    await user.click(screen.getByRole("button", { name: "Enviar Adendo" }));
    await screen.findByTestId("adendo-enviado");

    await user.click(screen.getByRole("button", { name: /Incluir Adendo/ }));
    await waitFor(() => expect(screen.queryByTestId("adendo-enviado")).not.toBeInTheDocument());
  });
});
