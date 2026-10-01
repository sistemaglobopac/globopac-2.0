import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { supabase } from "@/lib/supabase";
import { useAbrirRnc, type SeveridadeRnc } from "./api";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

const SEVERIDADES: SeveridadeRnc[] = ["CRITICA", "ALTA", "MEDIA", "BAIXA"];

/** Ficha vinculada só para exibição de contexto (Painel de Bordo, seção 10) — duas leituras
 * simples em vez de embed, mesmo motivo do restante do app (ver comentário em fichas/api.ts:
 * inferência de tipo do embed do postgrest-js não é confiável sem tipos gerados de verdade). */
function useFichaDoMonitoramento(monitoramentoId: string | null) {
  return useQuery({
    queryKey: ["monitoramentos", "ficha-vinculo", monitoramentoId],
    enabled: monitoramentoId !== null,
    queryFn: async () => {
      const { data: monitoramento, error: erroMonitoramento } = await supabase
        .from("monitoramentos")
        .select("setor, ficha_template_id")
        .eq("id", monitoramentoId as string)
        .single()
        .overrideTypes<{ setor: string; ficha_template_id: string }, { merge: false }>();
      if (erroMonitoramento) throw erroMonitoramento;

      const { data: ficha, error: erroFicha } = await supabase
        .from("fichas_templates")
        .select("nome")
        .eq("id", monitoramento.ficha_template_id)
        .single()
        .overrideTypes<{ nome: string }, { merge: false }>();
      if (erroFicha) throw erroFicha;

      return { setor: monitoramento.setor, fichaNome: ficha.nome };
    },
  });
}

/** Abertura de RNC pelo próprio inspetor (seção 7/10 do Painel de Bordo) — a matriz de
 * permissões já previa isso ("INSPETOR_QUALIDADE — cria fichas/RNC em campo"), só faltava a
 * tela. `?vinculo=<monitoramentoId>` pré-preenche o setor a partir do monitoramento com desvio;
 * sem o parâmetro, a RNC nasce avulsa (rnc.monitoramento_id fica null). */
export function NovaRncPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const perfil = useSessionStore((s) => s.perfil);
  const abrirRnc = useAbrirRnc();

  const monitoramentoVinculo = searchParams.get("vinculo");
  const { data: vinculo } = useFichaDoMonitoramento(monitoramentoVinculo);
  const { data: masterSetores } = useSetoresCadastrados();
  const setoresDoUsuario = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);

  const [setor, setSetor] = useState(setoresDoUsuario[0] ?? "");
  const [severidade, setSeveridade] = useState<SeveridadeRnc>("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (vinculo) setSetor(vinculo.setor);
  }, [vinculo]);

  useEffect(() => {
    if (vinculo) return;
    setSetor((atual) => (atual && setoresDoUsuario.includes(atual) ? atual : (setoresDoUsuario[0] ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, masterSetores]);

  async function handleAbrirRnc(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    if (!descricao.trim()) {
      setMensagem({ tipo: "error", texto: "Descreva o desvio antes de abrir a RNC." });
      return;
    }

    try {
      await abrirRnc.mutateAsync({
        monitoramentoId: monitoramentoVinculo,
        descricao: descricao.trim(),
        setor,
        severidade,
        abertoPor: perfil.id,
      });
      setMensagem({ tipo: "success", texto: "RNC aberta com sucesso." });
      setTimeout(() => navigate("/painel"), 1200);
    } catch (erro) {
      setMensagem({ tipo: "error", texto: erro instanceof Error ? erro.message : "Falha ao abrir a RNC." });
    }
  }

  if (!perfil) return null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold">Registrar Desvio / Abertura de RNC</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {monitoramentoVinculo ? "RNC vinculada a um monitoramento com desvio" : "RNC avulsa"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {monitoramentoVinculo && (
            <p className="text-sm text-muted-foreground">
              Vinculada à ficha: <span className="font-medium text-foreground">{vinculo?.fichaNome ?? "carregando…"}</span>
            </p>
          )}

          {mensagem && (
            <p className={`text-sm ${mensagem.tipo === "success" ? "text-success" : "text-destructive"}`}>{mensagem.texto}</p>
          )}

          <form onSubmit={handleAbrirRnc} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setorRnc">Setor</Label>
              <Select id="setorRnc" value={setor} onChange={(e) => setSetor(e.target.value)} disabled={setoresDoUsuario.length <= 1}>
                {setoresDoUsuario.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severidadeRnc">Severidade</Label>
              <Select id="severidadeRnc" value={severidade} onChange={(e) => setSeveridade(e.target.value as SeveridadeRnc)}>
                {SEVERIDADES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricaoRnc">Descrição do Desvio</Label>
              <Textarea
                id="descricaoRnc"
                required
                placeholder="Descreva o que foi observado…"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={abrirRnc.isPending}>
              {abrirRnc.isPending ? "Abrindo…" : "Abrir RNC"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
