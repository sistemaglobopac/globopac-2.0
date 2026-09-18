import type { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form";
import type { CampoTemplate } from "@/shared/schema-campos";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";

interface DynamicFieldProps {
  campo: CampoTemplate;
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
}

/** Renderiza um campo de formulário a partir da definição declarativa de schema_campos —
 * o mesmo dado que gera o Zod de validação (src/shared/schema-campos.ts), garantindo que
 * UI e validação nunca divirjam (seção 7.1 do PROMPT MESTRE). */
export function DynamicField({ campo, register, errors }: DynamicFieldProps) {
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
      {(campo.tipo === "foto" ||
        campo.tipo === "assinatura" ||
        campo.tipo === "chiller_carcacas" ||
        campo.tipo === "chiller_partes" ||
        campo.tipo === "mini_chillers" ||
        campo.tipo === "lavagem_final" ||
        campo.tipo === "absorcao_agua" ||
        campo.tipo === "dripping_test") && (
        <p className="text-sm text-muted-foreground">Este campo é preenchido em uma tela dedicada.</p>
      )}

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
