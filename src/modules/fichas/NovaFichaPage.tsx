import { useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSessionStore, type PerfilSessao } from "@/store/session";
import { zodFromSchemaCampos, valoresIniciaisDe, type CampoTemplate } from "@/shared/schema-campos";
import { useCriarMonitoramento, useTemplatesAtivos } from "./api";
import { useSincronizacaoOffline } from "./useSincronizacaoOffline";
import { DynamicField } from "./DynamicField";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const ROTULO_STATUS_FILA: Record<string, string> = {
  pendente: "Pendente de sincronização",
  sincronizando: "Sincronizando…",
  falhou: "Falha ao sincronizar — tentando de novo",
  falha_autenticacao: "Sessão expirada — faça login novamente",
};

function FilaOfflinePainel() {
  const { fila } = useSincronizacaoOffline();
  if (fila.length === 0) return null;

  return (
    <Card className="border-warning">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {fila.length} ficha(s) aguardando sincronização (ADR 0002/0014)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fila.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Capturada em {new Date(item.capturadoEm).toLocaleString("pt-BR")}
            </span>
            <Badge variant={item.status === "falha_autenticacao" ? "destructive" : "outline"}>
              {ROTULO_STATUS_FILA[item.status] ?? item.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function NovaFichaPage() {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: templates, isLoading } = useTemplatesAtivos();
  const [templateId, setTemplateId] = useState("");

  const templateSelecionado = templates?.find((t) => t.id === templateId);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nova ficha de monitoramento</h1>

      <FilaOfflinePainel />

      <div className="space-y-2">
        <Label htmlFor="template">Template</Label>
        <Select
          id="template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={isLoading}
        >
          <option value="">{isLoading ? "Carregando…" : "Selecione um template…"}</option>
          {templates?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome} (v{t.versao})
            </option>
          ))}
        </Select>
      </div>

      {templateSelecionado && perfil && (
        <FichaForm
          key={templateSelecionado.id}
          templateId={templateSelecionado.id}
          versaoTemplate={templateSelecionado.versao}
          campos={templateSelecionado.schema_campos as CampoTemplate[]}
          perfil={perfil}
        />
      )}
    </div>
  );
}

interface FichaFormProps {
  templateId: string;
  versaoTemplate: number;
  campos: CampoTemplate[];
  perfil: PerfilSessao;
}

function FichaForm({ templateId, versaoTemplate, campos, perfil }: FichaFormProps) {
  const [setor, setSetor] = useState(perfil.setoresPermitidos[0] ?? "");
  const [sucesso, setSucesso] = useState<"online" | "offline" | null>(null);
  const criarMonitoramento = useCriarMonitoramento();

  const schema = zodFromSchemaCampos(campos);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciaisDe(campos),
  });

  async function aoEnviar(dados: FieldValues) {
    setSucesso(null);
    try {
      const resultado = await criarMonitoramento.mutateAsync({
        fichaTemplateId: templateId,
        versaoTemplate,
        userId: perfil.id,
        setor,
        dadosDinamicos: dados,
      });
      reset(valoresIniciaisDe(campos));
      setSucesso(resultado.modo);
    } catch {
      // erro já refletido em criarMonitoramento.isError, renderizado abaixo.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da ficha</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4" noValidate>
          {perfil.setoresPermitidos.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="setor">Setor</Label>
              <Select id="setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
                {perfil.setoresPermitidos.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {campos.map((campo) => (
            <DynamicField key={campo.chave} campo={campo} register={register} errors={errors} />
          ))}

          {criarMonitoramento.isError && (
            <p className="text-sm text-destructive">
              Falha ao criar/assinar a ficha. Tente novamente.
            </p>
          )}
          {sucesso === "online" && <p className="text-sm text-success">Ficha criada e assinada com sucesso.</p>}
          {sucesso === "offline" && (
            <p className="text-sm text-warning">
              Sem conexão — ficha salva no dispositivo e será enviada e assinada automaticamente
              assim que a rede voltar.
            </p>
          )}

          <Button type="submit" disabled={isSubmitting || criarMonitoramento.isPending}>
            {isSubmitting || criarMonitoramento.isPending ? "Salvando e assinando…" : "Criar e assinar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
