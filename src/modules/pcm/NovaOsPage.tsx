import { useEffect, useState } from "react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { useCriarOs } from "./api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export function NovaOsPage() {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: masterSetores } = useSetoresCadastrados();
  const setoresDoUsuario = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);
  const [setor, setSetor] = useState(setoresDoUsuario[0] ?? "");
  useEffect(() => {
    setSetor((atual) => (atual && setoresDoUsuario.includes(atual) ? atual : (setoresDoUsuario[0] ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, masterSetores]);
  const [descricao, setDescricao] = useState("");
  const [ativoReferencia, setAtivoReferencia] = useState("");
  const [slaEsperadoHoras, setSlaEsperadoHoras] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const criarOs = useCriarOs();

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    setSucesso(false);
    try {
      await criarOs.mutateAsync({
        descricao,
        setor,
        ativoReferencia: ativoReferencia || undefined,
        slaEsperadoHoras: slaEsperadoHoras ? Number(slaEsperadoHoras) : undefined,
        userId: perfil.id,
      });
      setDescricao("");
      setAtivoReferencia("");
      setSlaEsperadoHoras("");
      setSucesso(true);
    } catch {
      // erro já refletido em criarOs.isError, renderizado abaixo.
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nova Ordem de Serviço</h1>

      <Card>
        <CardHeader>
          <CardTitle>Dados da OS</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={aoEnviar} className="space-y-4" noValidate>
            {setoresDoUsuario.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="setor">Setor</Label>
                <Select id="setor" value={setor} onChange={(e) => setSetor(e.target.value)}>
                  {setoresDoUsuario.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição do serviço</Label>
              <Textarea
                id="descricao"
                required
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: troca do rolamento do motor da esteira 3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ativo_referencia">Ativo/equipamento (referência)</Label>
              <Input
                id="ativo_referencia"
                value={ativoReferencia}
                onChange={(e) => setAtivoReferencia(e.target.value)}
                placeholder="Identificador livre — cadastro de ativos vive no GLOBO SIGMA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sla_esperado_horas">SLA esperado (horas, opcional)</Label>
              <Input
                id="sla_esperado_horas"
                type="number"
                min="1"
                value={slaEsperadoHoras}
                onChange={(e) => setSlaEsperadoHoras(e.target.value)}
              />
            </div>

            {criarOs.isError && (
              <p className="text-sm text-destructive">Falha ao criar/assinar a OS. Tente novamente.</p>
            )}
            {sucesso && <p className="text-sm text-success">OS criada e assinada com sucesso.</p>}

            <Button type="submit" disabled={criarOs.isPending || descricao.trim().length === 0}>
              {criarOs.isPending ? "Salvando e assinando…" : "Abrir e assinar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
