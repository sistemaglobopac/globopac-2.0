import { Controller, type Control, type FieldErrors, type FieldValues, type UseFormRegister } from "react-hook-form";
import type { CampoTemplate } from "@/shared/schema-campos";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { ChillerCarcacasField } from "./fields/ChillerCarcacasField";
import { ChillerPartesField } from "./fields/ChillerPartesField";
import { LavagemFinalField } from "./fields/LavagemFinalField";
import { MiniChillersField } from "./fields/MiniChillersField";
import { AbsorcaoAguaField } from "./fields/AbsorcaoAguaField";
import { DrippingTestField } from "./fields/DrippingTestField";
import { ParadaEquipamentoField } from "./fields/ParadaEquipamentoField";
import type {
  AbsorcaoAguaValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  DrippingTestValor,
  LavagemFinalValor,
  MiniChillersValor,
  ParadaEquipamentoValor,
} from "./fields/tiposCompostos";

interface DynamicFieldProps {
  campo: CampoTemplate;
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
  /** Só usado pelos widgets "Especial SIF" (chiller_carcacas, etc.) — os demais tipos de
   * campo continuam simples inputs não controlados via `register`. */
  control: Control<FieldValues>;
  /** dados_dinamicos[chave] do monitoramento mais recente de hoje desta ficha+setor, quando
   * o widget precisa herdar uma leitura anterior (ver useUltimoRegistroFicha). */
  prevAppointment?: Record<string, unknown>;
  /** Valor AO VIVO do campo chiller_carcacas desta mesma ficha (útil via useWatch em
   * FichaForm) — chiller_partes/lavagem_final/mini_chillers dependem dele, não de uma busca
   * no banco (igual ao v1: NovoRegistro.jsx lê o "campo irmão" do próprio formData). */
  carcacasAtual?: ChillerCarcacasValor;
}

/** Renderiza um campo de formulário a partir da definição declarativa de schema_campos —
 * o mesmo dado que gera o Zod de validação (src/shared/schema-campos.ts), garantindo que
 * UI e validação nunca divirjam (seção 7.1 do PROMPT MESTRE). */
export function DynamicField({ campo, register, errors, control, prevAppointment, carcacasAtual }: DynamicFieldProps) {
  const erro = errors[campo.chave]?.message as string | undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={campo.chave}>
        {campo.label ?? campo.chave}
        {campo.obrigatorio && <span className="text-destructive"> *</span>}
        {campo.tipo === "numero" && campo.unidade && (
          <span className="text-muted-foreground"> ({campo.unidade})</span>
        )}
      </Label>

      {campo.tipo === "numero" && (
        <Input id={campo.chave} type="number" step="any" {...register(campo.chave, { valueAsNumber: true })} />
      )}
      {campo.tipo === "inteiro" && (
        <Input id={campo.chave} type="number" step="1" {...register(campo.chave, { valueAsNumber: true })} />
      )}
      {campo.tipo === "decimal" && (
        <Input id={campo.chave} type="number" step="any" {...register(campo.chave, { valueAsNumber: true })} />
      )}
      {(campo.tipo === "texto" || campo.tipo === "hora") && (
        <Input id={campo.chave} type={campo.tipo === "hora" ? "time" : "text"} {...register(campo.chave)} />
      )}
      {campo.tipo === "texto_longo" && <Textarea id={campo.chave} {...register(campo.chave)} />}
      {(campo.tipo === "booleano" || campo.tipo === "simples") && (
        <input id={campo.chave} type="checkbox" className="h-4 w-4" {...register(campo.chave)} />
      )}
      {(campo.tipo === "selecao" || campo.tipo === "unica_escolha") && (
        <Select id={campo.chave} {...register(campo.chave)}>
          <option value="">Selecione…</option>
          {campo.opcoes.map((opcao) => (
            <option key={opcao} value={opcao}>
              {opcao}
            </option>
          ))}
        </Select>
      )}
      {campo.tipo === "chiller_carcacas" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => (
            <ChillerCarcacasField
              value={field.value as ChillerCarcacasValor | undefined}
              onChange={field.onChange}
              prevAppointment={prevAppointment?.[campo.chave] as ChillerCarcacasValor | undefined}
            />
          )}
        />
      )}

      {campo.tipo === "chiller_partes" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => (
            <ChillerPartesField
              value={field.value as ChillerPartesValor | undefined}
              onChange={field.onChange}
              prevAppointment={prevAppointment?.[campo.chave] as ChillerPartesValor | undefined}
              carcacasAtual={carcacasAtual}
            />
          )}
        />
      )}

      {campo.tipo === "lavagem_final" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => (
            <LavagemFinalField
              value={field.value as LavagemFinalValor | undefined}
              onChange={field.onChange}
              prevAppointment={prevAppointment?.[campo.chave] as LavagemFinalValor | undefined}
              carcacasAtual={carcacasAtual}
            />
          )}
        />
      )}

      {campo.tipo === "mini_chillers" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => (
            <MiniChillersField
              value={field.value as MiniChillersValor | undefined}
              onChange={field.onChange}
              prevAppointment={prevAppointment?.[campo.chave] as MiniChillersValor | undefined}
              carcacasAtual={carcacasAtual}
            />
          )}
        />
      )}

      {campo.tipo === "absorcao_agua" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => <AbsorcaoAguaField value={field.value as AbsorcaoAguaValor | undefined} onChange={field.onChange} />}
        />
      )}

      {campo.tipo === "dripping_test" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => <DrippingTestField value={field.value as DrippingTestValor | undefined} onChange={field.onChange} />}
        />
      )}

      {campo.tipo === "parada_equipamento" && (
        <Controller
          name={campo.chave}
          control={control}
          render={({ field }) => <ParadaEquipamentoField value={field.value as ParadaEquipamentoValor | undefined} onChange={field.onChange} />}
        />
      )}

      {(campo.tipo === "foto" || campo.tipo === "assinatura") && (
        <p className="text-sm text-muted-foreground">Este campo ainda não tem tela dedicada nesta versão — em construção.</p>
      )}

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
