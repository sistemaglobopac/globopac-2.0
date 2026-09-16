import { useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { useSessionStore } from "@/store/session";
import { schemaCamposSchema, zodFromSchemaCampos, valoresIniciaisDe, type CampoTemplate } from "@/shared/schema-campos";
import { useCriarTemplate } from "./api";
import { DynamicField } from "./DynamicField";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const TIPOS: CampoTemplate["tipo"][] = ["numero", "texto", "booleano", "selecao"];

function novoCampo(): CampoTemplate {
  return { chave: "", tipo: "texto", obrigatorio: true };
}

/** Campo "limpo" para um tipo — usado ao trocar o tipo de um campo existente, para nunca
 * deixar campos de um tipo antigo (ex.: opcoes de selecao) pendurados num tipo novo que não
 * os espera (o que quebraria zodFromSchemaCampos em runtime). */
function campoBaseParaTipo(tipo: CampoTemplate["tipo"], chave: string, obrigatorio: boolean): CampoTemplate {
  switch (tipo) {
    case "numero":
      return { chave, tipo, obrigatorio };
    case "texto":
      return { chave, tipo, obrigatorio };
    case "booleano":
      return { chave, tipo, obrigatorio };
    case "selecao":
      return { chave, tipo, obrigatorio, opcoes: [] };
  }
}

export function TemplateBuilderPage() {
  const perfil = useSessionStore((s) => s.perfil);
  const criarTemplate = useCriarTemplate();

  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [pacCorrespondente, setPacCorrespondente] = useState("");
  const [campos, setCampos] = useState<CampoTemplate[]>([novoCampo()]);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function atualizarCampo(indice: number, atualizacao: Partial<CampoTemplate>) {
    setCampos((atual) =>
      atual.map((c, i) => (i === indice ? ({ ...c, ...atualizacao } as CampoTemplate) : c))
    );
  }

  function trocarTipoCampo(indice: number, novoTipo: CampoTemplate["tipo"]) {
    setCampos((atual) =>
      atual.map((c, i) => (i === indice ? campoBaseParaTipo(novoTipo, c.chave, c.obrigatorio) : c))
    );
  }

  function removerCampo(indice: number) {
    setCampos((atual) => atual.filter((_, i) => i !== indice));
  }

  async function salvarTemplate() {
    setErroValidacao(null);
    setSucesso(false);

    const validacao = schemaCamposSchema.safeParse(campos);
    if (!validacao.success) {
      setErroValidacao("Revise os campos: " + validacao.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const chavesUnicas = new Set(campos.map((c) => c.chave));
    if (chavesUnicas.size !== campos.length) {
      setErroValidacao("Cada campo precisa de uma chave única.");
      return;
    }
    if (!codigo || !nome || !pacCorrespondente || !perfil) {
      setErroValidacao("Preencha código, nome e PAC correspondente.");
      return;
    }

    await criarTemplate.mutateAsync({
      codigo,
      nome,
      pacCorrespondente,
      schemaCampos: campos,
      criadoPor: perfil.id,
    });
    setSucesso(true);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Builder de templates</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código</Label>
              <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pac">PAC correspondente</Label>
              <Input id="pac" value={pacCorrespondente} onChange={(e) => setPacCorrespondente(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {campos.map((campo, indice) => (
              <CampoEditor
                key={indice}
                campo={campo}
                onAlterar={(atualizacao) => atualizarCampo(indice, atualizacao)}
                onTrocarTipo={(novoTipo) => trocarTipoCampo(indice, novoTipo)}
                onRemover={() => removerCampo(indice)}
              />
            ))}
            <Button type="button" variant="outline" onClick={() => setCampos((c) => [...c, novoCampo()])}>
              + Adicionar campo
            </Button>
          </CardContent>
        </Card>

        {erroValidacao && <p className="text-sm text-destructive">{erroValidacao}</p>}
        {sucesso && <p className="text-sm text-success">Template criado com sucesso.</p>}

        <Button onClick={salvarTemplate} disabled={criarTemplate.isPending}>
          {criarTemplate.isPending ? "Salvando…" : "Salvar template"}
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Preview ao vivo</h2>
        <p className="text-sm text-muted-foreground">
          Como o formulário vai aparecer para o inspetor — a validação já usa o mesmo schema
          Zod gerado a partir dos campos ao lado.
        </p>
        <PreviewFormulario campos={campos} />
      </div>
    </div>
  );
}

interface CampoEditorProps {
  campo: CampoTemplate;
  onAlterar: (atualizacao: Partial<CampoTemplate>) => void;
  onTrocarTipo: (novoTipo: CampoTemplate["tipo"]) => void;
  onRemover: () => void;
}

function CampoEditor({ campo, onAlterar, onTrocarTipo, onRemover }: CampoEditorProps) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex gap-2">
        <Input
          placeholder="chave (ex.: temperatura_celsius)"
          value={campo.chave}
          onChange={(e) => onAlterar({ chave: e.target.value })}
        />
        <Select value={campo.tipo} onChange={(e) => onTrocarTipo(e.target.value as CampoTemplate["tipo"])}>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button type="button" variant="ghost" size="sm" onClick={onRemover}>
          remover
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={campo.obrigatorio}
          onChange={(e) => onAlterar({ obrigatorio: e.target.checked })}
        />
        Obrigatório
      </label>

      {campo.tipo === "numero" && (
        <div className="flex gap-2">
          <Input
            placeholder="min"
            type="number"
            onChange={(e) => onAlterar({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
          <Input
            placeholder="max"
            type="number"
            onChange={(e) => onAlterar({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
          <Input placeholder="unidade" onChange={(e) => onAlterar({ unidade: e.target.value || undefined })} />
        </div>
      )}
      {campo.tipo === "selecao" && (
        <Input
          placeholder="opções separadas por vírgula"
          onChange={(e) =>
            onAlterar({ opcoes: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
          }
        />
      )}
    </div>
  );
}

function PreviewFormulario({ campos }: { campos: CampoTemplate[] }) {
  const schema = zodFromSchemaCampos(campos);
  const {
    register,
    formState: { errors },
  } = useForm<FieldValues>({ defaultValues: valoresIniciaisDe(campos) });
  void schema; // validado no submit real (Nova Ficha); aqui é só demonstração visual dos campos

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {campos
          .filter((c) => c.chave)
          .map((campo) => (
            <DynamicField key={campo.chave} campo={campo} register={register} errors={errors} />
          ))}
        {campos.filter((c) => c.chave).length === 0 && (
          <p className="text-sm text-muted-foreground">Adicione campos com uma chave para ver o preview.</p>
        )}
      </CardContent>
    </Card>
  );
}
