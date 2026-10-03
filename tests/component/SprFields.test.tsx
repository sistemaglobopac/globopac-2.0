import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChillerCarcacasField } from "@/modules/fichas/fields/ChillerCarcacasField";
import { ChillerPartesField } from "@/modules/fichas/fields/ChillerPartesField";
import { LavagemFinalField } from "@/modules/fichas/fields/LavagemFinalField";
import { MiniChillersField } from "@/modules/fichas/fields/MiniChillersField";
import type {
  ChillerCarcacasValor,
  ChillerPartesValor,
  LavagemFinalValor,
  MiniChillersValor,
} from "@/modules/fichas/fields/tiposCompostos";

// O SPR Carcaças herda cargas via React Query (consulta ao Supabase): nestes testes não há
// QueryClientProvider nem rede, então as consultas viram respostas vazias.
vi.mock("@/modules/recepcao/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/recepcao/api")>()),
  useCargasRastreabilidade: () => ({ data: [] }),
  useCargasJaMonitoradas: () => ({ data: new Set<string>() }),
}));

const t = (prev: string) => ({ prev: "", cur: prev, ice: "0" });

// Monitoramento ANTERIOR do dia (só a leitura "atual" dele importa: vira a "anterior" de hoje).
const anteriorCarcacas = {
  tanques: { preChiller: t("100,000"), chiller1: t("50,000"), chiller2: t("30,000") },
} as unknown as ChillerCarcacasValor;
const anteriorPartes = { tanques: { chiller1: t("50,00"), chiller2: t("60,00") } } as unknown as ChillerPartesValor;
const anteriorMiudos = {
  tanques: { coracao: t("10,000"), moela: t("10,000"), figado: t("10,000"), cabeca: t("10,000"), pes: t("10,000") },
} as unknown as MiniChillersValor;
const anteriorChuveiro = { chuveiro: { prev: "", cur: "200,000" } } as unknown as LavagemFinalValor;

/** Os 4 campos na MESMA ficha: Partes, Miúdos e Chuveiro leem o SPR Carcaças AO VIVO. */
function Ficha({ segundoDoDia }: { segundoDoDia: boolean }) {
  const [carcacas, setCarcacas] = useState<ChillerCarcacasValor | undefined>();
  return (
    <div>
      <section data-testid="carcacas">
        <ChillerCarcacasField value={undefined} onChange={setCarcacas} prevAppointment={segundoDoDia ? anteriorCarcacas : undefined} />
      </section>
      <section data-testid="partes">
        <ChillerPartesField value={undefined} onChange={() => undefined} prevAppointment={segundoDoDia ? anteriorPartes : undefined} carcacasAtual={carcacas} />
      </section>
      <section data-testid="miudos">
        <MiniChillersField value={undefined} onChange={() => undefined} prevAppointment={segundoDoDia ? anteriorMiudos : undefined} carcacasAtual={carcacas} />
      </section>
      <section data-testid="chuveiro">
        <LavagemFinalField value={undefined} onChange={() => undefined} prevAppointment={segundoDoDia ? anteriorChuveiro : undefined} carcacasAtual={carcacas} />
      </section>
    </div>
  );
}

const hidr = (secao: string) => within(screen.getByTestId(secao)).getAllByPlaceholderText("Ex: 3718,72");

describe("1º monitoramento do dia (nenhum hidrômetro herdou leitura)", () => {
  it("pede só a Hidr. Atual, sem anterior/gelo/cargas/condenas, e mostra o aviso informativo", () => {
    render(<Ficha segundoDoDia={false} />);
    // 3 (carcaças) + 2 (partes) + 5 (miúdos) + 1 (chuveiro) campos, todos "Hidr. Atual".
    expect(screen.queryByText("Gelo Adicionado (kg)")).toBeNull();
    expect(screen.queryByText("Hidr. Anterior (m³)")).toBeNull();
    expect(screen.queryByText("Cargas Processadas no Período")).toBeNull();
    expect(screen.queryByText(/Carcaças Parcialmente/)).toBeNull();
    expect(hidr("carcacas")).toHaveLength(3);
    expect(hidr("partes")).toHaveLength(2);
    expect(hidr("miudos")).toHaveLength(5);
    expect(hidr("chuveiro")).toHaveLength(1);
    expect(screen.getAllByText(/Primeiro monitoramento do dia: informe apenas a leitura atual de cada hidrômetro\. Cargas\/volume processado e apuração de vazão começam a partir do próximo monitoramento\./)).toHaveLength(4);
    expect(screen.getAllByText("AGUARDANDO LEITURA")).toHaveLength(4);
  });

  it("não calcula nem bloqueia: com leitura atual o resultado é '—' e segue CONFORME", async () => {
    const user = userEvent.setup();
    render(<Ficha segundoDoDia={false} />);
    await user.type(hidr("carcacas")[0]!, "120,5");
    expect(within(screen.getByTestId("carcacas")).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("carcacas")).getByText("CONFORME")).toBeInTheDocument();
    expect(screen.queryByText(/Preencha primeiro/)).toBeNull();
  });
});

describe("2º monitoramento do dia — exemplo numérico de referência", () => {
  it("herda a leitura anterior TRAVADA (com tooltip) e os gelos padrão de cada tanque", () => {
    render(<Ficha segundoDoDia />);
    const anteriores = within(screen.getByTestId("carcacas")).getAllByTitle("Herdado do monitoramento anterior — não pode ser alterado");
    expect(anteriores).toHaveLength(3);
    anteriores.forEach((el) => expect(el).toBeDisabled());
    expect(anteriores.map((el) => (el as HTMLInputElement).value)).toEqual(["100,000", "50,000", "30,000"]);
    const gelos = within(screen.getByTestId("carcacas")).getAllByPlaceholderText("0") as HTMLInputElement[];
    expect(gelos.map((g) => g.value)).toEqual(["1995", "2394", "1596"]);
    const gelosPartes = within(screen.getByTestId("partes")).getAllByPlaceholderText("0") as HTMLInputElement[];
    expect(gelosPartes.map((g) => g.value)).toEqual(["332", "332"]);
    const gelosMiudos = within(screen.getByTestId("miudos")).getAllByPlaceholderText("0") as HTMLInputElement[];
    expect(gelosMiudos.map((g) => g.value)).toEqual(["332", "332", "332", "332", "332"]);
    // Chuveiro: sem campo de gelo.
    expect(within(screen.getByTestId("chuveiro")).queryByText("Gelo Adicionado (kg)")).toBeNull();
  });

  it("bloqueia por falta da base do SPR Carcaças (Partes, Miúdos e Chuveiro) enquanto ela não é preenchida", () => {
    render(<Ficha segundoDoDia />);
    expect(within(screen.getByTestId("partes")).getByText(/Preencha primeiro o "Renovação da Água do SPR Carcaças"/)).toBeInTheDocument();
    expect(within(screen.getByTestId("miudos")).getAllByText(/Preencha primeiro o "Renovação da Água do SPR Carcaças"/)).toHaveLength(2);
    expect(within(screen.getByTestId("chuveiro")).getByText(/Preencha primeiro o "Renovação da Água do SPR Carcaças"/)).toBeInTheDocument();
  });

  it("reproduz os resultados de referência ao vivo, sem digitar a base de novo", async () => {
    const user = userEvent.setup();
    render(<Ficha segundoDoDia />);
    const carcacas = within(screen.getByTestId("carcacas"));

    // 1 lote de 10.000 aves, peso vivo digitado 2850 → máscara 2,850; parciais 40; totais 80.
    await user.type(carcacas.getByPlaceholderText("Ex: 4500"), "10000");
    const pesoVivo = carcacas.getByPlaceholderText("Ex: 2,850") as HTMLInputElement;
    await user.type(pesoVivo, "2850");
    expect(pesoVivo.value).toBe("2,850");
    await user.type(carcacas.getByPlaceholderText("Ex: 40"), "40");
    await user.type(carcacas.getByPlaceholderText("Ex: 80"), "80");

    expect(carcacas.getAllByText("9.880 aves").length).toBeGreaterThan(0);
    expect(carcacas.getByText("2,394 kg")).toBeInTheDocument();
    expect(carcacas.getByText(/carcaças = aves abatidas com 16% de perda de peso/)).toBeInTheDocument();

    // Pré-chiller 100,000 → 120,000 com gelo 1995 = 2,226 L/c (CONFORME, meta 1,5).
    await user.type(hidr("carcacas")[1]!, "120,000");
    expect(carcacas.getByText("2,226 L/c")).toBeInTheDocument();
    expect(carcacas.getByText("CONFORME")).toBeInTheDocument();

    // A base foi liberada: os alertas de bloqueio somem sem digitar nada nos outros campos.
    expect(screen.queryByText(/Preencha primeiro/)).toBeNull();

    // SPR Partes: massa 67,032 kg; 50,00 → 50,10 com gelo 332 = 6,445 L/kg.
    const partes = within(screen.getByTestId("partes"));
    await user.type(hidr("partes")[1]!, "50,10");
    expect(partes.getAllByText(/67,032 kg/).length).toBeGreaterThan(0);
    expect(partes.getByText("6,445 L/kg")).toBeInTheDocument();

    // Miúdos: coração base 108,7 kg (9880 × 0,011); 10,000 → 10,100 com gelo 332 = 3,975 L/kg.
    const miudos = within(screen.getByTestId("miudos"));
    await user.type(hidr("miudos")[1]!, "10,100");
    expect(miudos.getByText("3,975 L/kg")).toBeInTheDocument();
    expect(miudos.getByText(/Base: 108,7 kg \(0.011 kg\/un\)/)).toBeInTheDocument();

    // Chuveiro: parciais 30 → aves 9.890; 200,000 → 215,000 sem gelo = 1,517 L/carcaça.
    const chuveiro = within(screen.getByTestId("chuveiro"));
    await user.type(chuveiro.getByPlaceholderText("Ex: 30"), "30");
    await user.type(hidr("chuveiro")[1]!, "215,000");
    expect(chuveiro.getByText("9.890 un")).toBeInTheDocument();
    expect(chuveiro.getByText("1,517 L/carcaça")).toBeInTheDocument();
  });

  it("um tanque abaixo da meta torna o campo NÃO CONFORME e mostra o alerta; >10× a meta avisa (âmbar)", async () => {
    const user = userEvent.setup();
    render(<Ficha segundoDoDia />);
    const carcacas = within(screen.getByTestId("carcacas"));
    await user.type(carcacas.getByPlaceholderText("Ex: 4500"), "10000");
    await user.type(carcacas.getByPlaceholderText("Ex: 2,850"), "2850");
    // Pré-chiller: 100 → 100,5 com gelo 1995 = (500+1995)/10000 = 0,2495 L/ave, abaixo da meta 1,5.
    await user.clear(within(screen.getByTestId("carcacas")).getAllByPlaceholderText("0")[0]!);
    await user.type(within(screen.getByTestId("carcacas")).getAllByPlaceholderText("0")[0]!, "0");
    await user.type(hidr("carcacas")[1]!, "100,5");
    expect(carcacas.getByText("DESVIO DE VAZÃO REGISTRADO")).toBeInTheDocument();
    expect(carcacas.getByText("ATENÇÃO: DESVIO DETECTADO")).toBeInTheDocument();
    expect(carcacas.getByText(/ABAIXO DO MÍNIMO/)).toBeInTheDocument();

    // Leitura implausível: 100 → 5100 = 5.000.000 L / 10.000 = 500 L/ave (≫ 10× a meta).
    await user.clear(hidr("carcacas")[1]!);
    await user.type(hidr("carcacas")[1]!, "5100");
    expect(carcacas.getByText(/acima da meta — confira a leitura do hidrômetro \(casas decimais\/rolete de fração\) antes de assinar\./)).toBeInTheDocument();
  });
});
