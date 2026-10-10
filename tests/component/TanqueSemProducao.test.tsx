import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChillerPartesField } from "@/modules/fichas/fields/ChillerPartesField";
import { MiniChillersField } from "@/modules/fichas/fields/MiniChillersField";
import type { ChillerCarcacasValor, ChillerPartesValor, MiniChillersValor } from "@/modules/fichas/fields/tiposCompostos";

const carcacas = { totalAves: 1000, totalAvesBruto: 1000, pesoMedioCarcaca: 2.3, condenasParcial: "10" } as unknown as ChillerCarcacasValor;
const anteriorPartes = { tanques: { chiller1: { prev: "10", cur: "20", ice: "332" }, chiller2: { prev: "30", cur: "40", ice: "332" } } } as unknown as ChillerPartesValor;
const anteriorMiudos = {
  tanques: Object.fromEntries(["coracao", "moela", "figado", "cabeca", "pes"].map((k) => [k, { prev: "1", cur: "2", ice: "332" }])),
} as unknown as MiniChillersValor;

let ultimoPartes: ChillerPartesValor | undefined;
let ultimoMiudos: MiniChillersValor | undefined;

function HarnessPartes() {
  const [valor, setValor] = useState<ChillerPartesValor | undefined>();
  return (
    <ChillerPartesField
      value={valor}
      prevAppointment={anteriorPartes}
      carcacasAtual={carcacas}
      onChange={(v) => {
        ultimoPartes = v;
        setValor(v);
      }}
    />
  );
}

function HarnessMiudos() {
  const [valor, setValor] = useState<MiniChillersValor | undefined>();
  return (
    <MiniChillersField
      value={valor}
      prevAppointment={anteriorMiudos}
      carcacasAtual={carcacas}
      onChange={(v) => {
        ultimoMiudos = v;
        setValor(v);
      }}
    />
  );
}

describe("Sem produção por tanque", () => {
  it("Partes: marcar o chiller 2 esconde os campos dele, descarta a leitura e grava a marca", () => {
    render(<HarnessPartes />);
    expect(screen.getAllByText("Hidr. Atual (m³)")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("sem-producao-chiller2"));

    expect(screen.getAllByText("Hidr. Atual (m³)")).toHaveLength(1);
    expect(screen.getByTestId("aviso-sem-producao")).toBeTruthy();
    expect(ultimoPartes?.tanquesSemProducao).toEqual({ chiller2: true });
    expect(ultimoPartes?.tanques.chiller2.cur).toBe("");
    // a leitura anterior continua guardada para o próximo monitoramento
    expect(ultimoPartes?.tanques.chiller2.prev).toBe("40");
  });

  it("Partes: desmarcar traz os campos de volta e remove a marca", () => {
    render(<HarnessPartes />);
    fireEvent.click(screen.getByTestId("sem-producao-chiller2"));
    fireEvent.click(screen.getByTestId("sem-producao-chiller2"));

    expect(screen.getAllByText("Hidr. Atual (m³)")).toHaveLength(2);
    expect(ultimoPartes?.tanquesSemProducao).toBeUndefined();
    expect(ultimoPartes?.tanques.chiller2.ice).toBe("332");
  });

  it("Miúdos: só o tanque marcado fica sem produção", () => {
    render(<HarnessMiudos />);
    fireEvent.click(screen.getByTestId("sem-producao-moela"));

    expect(screen.getAllByText("Hidr. Atual (m³)")).toHaveLength(4);
    expect(ultimoMiudos?.tanquesSemProducao).toEqual({ moela: true });
    expect(ultimoMiudos?.tanques.moela.cur).toBe("");
    expect(ultimoMiudos?.conformidade).toBe(true);
  });
});
