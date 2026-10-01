import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DynamicField } from "@/modules/fichas/DynamicField";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import { valoresIniciaisDe, zodFromSchemaCampos, type CampoTemplate } from "@/shared/schema-campos";
import type { ChillerCarcacasValor } from "@/modules/fichas/fields/tiposCompostos";

const campos = [{ chave: "vazao", tipo: "chiller_carcacas", obrigatorio: true, label: "Vazão Carcaças" }] as CampoTemplate[];
const t = (cur: string) => ({ prev: "", cur, ice: "0" });
const anterior = { tanques: { preChiller: t("100"), chiller1: t("50"), chiller2: t("30") } } as unknown as ChillerCarcacasValor;

let enviados: FieldValues | null = null;
let avisos: string[] = [];

function Formulario() {
  const { register, control, handleSubmit, formState } = useForm<FieldValues>({
    resolver: zodResolver(zodFromSchemaCampos(campos)),
    defaultValues: valoresIniciaisDe(campos),
  });
  return (
    <form
      onSubmit={handleSubmit((dados) => {
        enviados = dados;
        avisos = desviosEspeciais(campos, dados);
      })}
    >
      <DynamicField campo={campos[0]!} register={register} errors={formState.errors} control={control} prevAppointment={{ vazao: anterior }} />
      <button type="submit">enviar</button>
    </form>
  );
}

describe("formulário real (RHF + zod + DynamicField): vazão NC chega ao detector no submit", () => {
  it("o objeto do widget sobrevive à validação e o desvio é detectado", async () => {
    const user = userEvent.setup();
    render(<Formulario />);
    await user.type(screen.getAllByPlaceholderText("Ex: 4500")[0]!, "3900");
    await user.type(screen.getAllByPlaceholderText("Ex: 2,850")[0]!, "2520");
    await user.type(screen.getAllByPlaceholderText("Ex: 3718,72")[1]!, "101");
    await user.click(screen.getByText("enviar"));

    expect(enviados).not.toBeNull();
    expect((enviados as unknown as { vazao: { conformidade: boolean } }).vazao.conformidade).toBe(false);
    expect(avisos).toHaveLength(1);
  });
});
