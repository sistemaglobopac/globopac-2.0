import type { FieldErrors, FieldValues, UseFormRegister } from "react-hook-form";
import type { CampoTemplate } from "@/shared/schema-campos";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";

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
        {campo.chave}
        {campo.obrigatorio && <span className="text-destructive"> *</span>}
        {campo.tipo === "numero" && campo.unidade && (
          <span className="text-muted-foreground"> ({campo.unidade})</span>
        )}
      </Label>

      {campo.tipo === "numero" && (
        <Input id={campo.chave} type="number" step="any" {...register(campo.chave, { valueAsNumber: true })} />
      )}
      {campo.tipo === "texto" && <Input id={campo.chave} type="text" {...register(campo.chave)} />}
      {campo.tipo === "booleano" && (
        <input id={campo.chave} type="checkbox" className="h-4 w-4" {...register(campo.chave)} />
      )}
      {campo.tipo === "selecao" && (
        <Select id={campo.chave} {...register(campo.chave)}>
          <option value="">Selecione…</option>
          {campo.opcoes.map((opcao) => (
            <option key={opcao} value={opcao}>
              {opcao}
            </option>
          ))}
        </Select>
      )}

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
