import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ordem } from "@/modules/bpf/tipos";
import { useSessionStore } from "@/store/session";

let ordensAtuais: Ordem[] | undefined = [];
vi.mock("@/modules/bpf/api", () => ({ useOrdensProgramadas: () => ({ data: ordensAtuais }) }));

import { ModalObservacoesPcm } from "@/modules/bpf/ModalObservacoesPcm";
import { lerCienciaObservacoes } from "@/modules/bpf/cienciaObservacoes";

beforeEach(() => {
  const memoria = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
    clear: () => memoria.clear(),
  });
  useSessionStore.setState({ perfil: { id: "pcm1", nomeCompleto: "Paulo PCM", nivelAcesso: "INSPETOR_PCM", setoresPermitidos: [] } });
  ordensAtuais = [];
});
afterEach(() => {
  useSessionStore.setState({ perfil: null });
  vi.unstubAllGlobals();
});

const programacao = (criado_em: string) => ({ sequencia: 0, prazo: "2026-11-30", acao_corretiva: null, responsavel: null, justificativa: null, importada: false, programado_por_nome: "Paulo", hash_assinatura: null, criado_em });
const verificacao = (id: string, observacao: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  ordem_id: "o",
  data_verificacao: "2026-10-27",
  hora_verificacao: "08:15:00",
  resultado: "NP",
  prazo_vigente: "2026-11-30",
  observacao,
  inspetor_nome: "Ana Inspetora",
  ...extra,
});
const ordem = (numero: string, verificacoes: unknown[], extra: Partial<Ordem> = {}): Ordem =>
  ({
    id: `id-${numero}`,
    numero_os: numero,
    status: "PROGRAMADA",
    descricao: `Descrição da OS ${numero}`,
    setor: "MANUTENÇÕES DIVERSAS",
    centro: { id: "c", codigo: "C1", nome: "Escaldagem" },
    constatado_por: "Ana Inspetora",
    local_detalhe: null,
    prazo_atual: "2099-12-31",
    programacoes: [programacao("2026-10-20T12:00:00Z")],
    verificacoes,
    ...extra,
  }) as unknown as Ordem;

const montar = () =>
  render(
    <MemoryRouter initialEntries={["/qualquer"]}>
      <Routes>
        <Route path="/qualquer" element={<ModalObservacoesPcm />} />
        <Route path="/bpf/pcm" element={<div>PAGINA DO PCM</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("ModalObservacoesPcm: observações do inspetor ao PCM que entra", () => {
  it("lista as OS com observação, com o texto, quem escreveu e quando", () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Instalaram o chuveiro, mas a fiação continua solta")]), ordem("OS-2", [verificacao("v2", null)])];
    montar();
    const modal = screen.getByTestId("modal-observacoes-pcm");
    expect(modal).toHaveTextContent("Observações do inspetor nas OS (1)");
    const cartao = screen.getByTestId("obs-pcm-OS-1");
    expect(cartao).toHaveTextContent("Descrição da OS OS-1");
    expect(cartao).toHaveTextContent("Instalaram o chuveiro, mas a fiação continua solta");
    expect(cartao).toHaveTextContent("Ana Inspetora");
    expect(cartao).toHaveTextContent("27/10/2026");
    expect(cartao).toHaveTextContent("08:15");
    expect(screen.queryByTestId("obs-pcm-OS-2")).toBeNull(); // sem observação
  });

  it("sem observação a ler, não aparece (nem enquanto carrega)", () => {
    ordensAtuais = undefined;
    const { unmount } = montar();
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
    unmount();
    ordensAtuais = [ordem("OS-2", [verificacao("v2", null)])];
    montar();
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
  });

  it('"Estou ciente" fecha e guarda a leitura: no próximo acesso só voltam observações novas', () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Material chega amanhã")])];
    const { unmount } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Estou ciente" }));
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
    expect(lerCienciaObservacoes("pcm1").has("v1")).toBe(true);
    unmount();

    montar(); // próximo acesso, mesma observação: não repete
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
    unmount();

    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Material chega amanhã"), verificacao("v3", "Material não chegou", { data_verificacao: "2026-10-28" })])];
    montar(); // observação nova na mesma OS: aparece
    expect(screen.getByTestId("obs-pcm-OS-1")).toHaveTextContent("Material não chegou");
  });

  it("fechar no X não conta como ciência: volta no próximo acesso", () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Conferir a fiação")])];
    const { unmount } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
    expect(lerCienciaObservacoes("pcm1").size).toBe(0);
    unmount();
    montar();
    expect(screen.getByTestId("modal-observacoes-pcm")).toBeInTheDocument();
  });

  it('"Ver na programação" leva à tela do PCM e também registra a leitura', () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Conferir a fiação")])];
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver na programação" }));
    expect(screen.getByText("PAGINA DO PCM")).toBeInTheDocument();
    expect(lerCienciaObservacoes("pcm1").has("v1")).toBe(true);
  });

  it("OS já reprogramada depois da observação não entra", () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Conferir a fiação")], { programacoes: [programacao("2026-10-20T12:00:00Z"), { ...programacao("2026-10-28T09:00:00Z"), sequencia: 1 }] })];
    montar();
    expect(screen.queryByTestId("modal-observacoes-pcm")).toBeNull();
  });

  it("observação que chega com o modal aberto não entra na lista na hora", () => {
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Primeira observação")])];
    const { rerender } = montar();
    ordensAtuais = [ordem("OS-1", [verificacao("v1", "Primeira observação")]), ordem("OS-9", [verificacao("v9", "Chegou agora")])];
    rerender(
      <MemoryRouter initialEntries={["/qualquer"]}>
        <Routes>
          <Route path="/qualquer" element={<ModalObservacoesPcm />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("modal-observacoes-pcm")).toHaveTextContent("Observações do inspetor nas OS (1)");
    expect(screen.queryByTestId("obs-pcm-OS-9")).toBeNull();
  });
});
