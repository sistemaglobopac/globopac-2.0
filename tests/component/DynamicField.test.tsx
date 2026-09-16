import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { DynamicField } from "@/modules/fichas/DynamicField";
import type { CampoTemplate } from "@/shared/schema-campos";

function Wrapper({ campo }: { campo: CampoTemplate }) {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <FieldHarness campo={campo} />
    </FormProvider>
  );
}

function FieldHarness({ campo }: { campo: CampoTemplate }) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  return <DynamicField campo={campo} register={register} errors={errors} />;
}

describe("DynamicField", () => {
  it("renderiza um input numérico com a unidade no rótulo", () => {
    render(
      <Wrapper campo={{ chave: "temperatura_celsius", tipo: "numero", obrigatorio: true, unidade: "celsius" }} />
    );
    expect(screen.getByText(/temperatura_celsius/)).toBeInTheDocument();
    // getByText (singular) falharia aqui: tanto o <label> quanto o <span> aninhado "(celsius)"
    // casam /celsius/ ao mesmo tempo — getAllByText é a escolha certa, não um contorno.
    expect(screen.getAllByText(/celsius/).length).toBeGreaterThan(0);
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("renderiza um select com as opções declaradas para campo de seleção", async () => {
    const user = userEvent.setup();
    render(
      <Wrapper
        campo={{ chave: "causa", tipo: "selecao", obrigatorio: true, opcoes: ["ARTRITE", "AEROSSACULITE"] }}
      />
    );
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "ARTRITE");
    expect((select as HTMLSelectElement).value).toBe("ARTRITE");
  });

  it("renderiza um checkbox para campo booleano", () => {
    render(<Wrapper campo={{ chave: "conforme", tipo: "booleano", obrigatorio: true }} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("marca o campo obrigatório com asterisco", () => {
    render(<Wrapper campo={{ chave: "obs", tipo: "texto", obrigatorio: true }} />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});
