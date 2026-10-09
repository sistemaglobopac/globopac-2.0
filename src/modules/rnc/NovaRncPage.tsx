import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { supabase } from "@/lib/supabase";
import { desviosEspeciais } from "@/modules/fichas/utils/desviosEspeciais";
import type { CampoTemplate } from "@/shared/schema-campos";
import { enviarAnexosRnc, useAbrirRnc, type SeveridadeRnc } from "./api";
import { SeletorAnexos } from "./AnexosRnc";
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
        .select("setor, ficha_template_id, dados_dinamicos")
        .eq("id", monitoramentoId as string)
        .single()
        .overrideTypes<{ setor: string; ficha_template_id: string; dados_dinamicos: Record<string, unknown> }, { merge: false }>();
      if (erroMonitoramento) throw erroMonitoramento;

      const { data: ficha, error: erroFicha } = await supabase
        .from("fichas_templates")
        .select("nome, schema_campos")
        .eq("id", monitoramento.ficha_template_id)
        .single()
        .overrideTypes<{ nome: string; schema_campos: CampoTemplate[] }, { merge: false }>();
      if (erroFicha) throw erroFicha;

      // O que estava não conforme no monitoramento (vazão abaixo da meta, absorção/dripping…): viaja
      // com a RNC para quem a recebe já saber do que se trata.
      const naoConformidades = desviosEspeciais(ficha.schema_campos ?? [], monitoramento.dados_dinamicos ?? {});
      return { setor: monitoramento.setor, fichaNome: ficha.nome, naoConformidades };
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
  // Inspetor registra o que fez na hora para conter o desvio; Verificador/Administrador abrem a RNC para que o
  // setor a trate e sane a não conformidade, sem ação imediata própria.
  const exigeAcaoImediata = perfil?.nivelAcesso === "INSPETOR_QUALIDADE";
  const voltarPara = searchParams.get("voltar");
  const destinoFinal = voltarPara && /^\/[A-Za-z0-9/_-]*$/.test(voltarPara) ? voltarPara : exigeAcaoImediata ? "/painel" : "/verificacao";
  const { data: vinculo } = useFichaDoMonitoramento(monitoramentoVinculo);
  const { data: masterSetores } = useSetoresCadastrados();
  const setoresDoUsuario = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);

  const [setor, setSetor] = useState(setoresDoUsuario[0] ?? "");
  const [severidade, setSeveridade] = useState<SeveridadeRnc>("MEDIA");
  const [descricao, setDescricao] = useState("");
  const [acaoImediata, setAcaoImediata] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  useEffect(() => {
    if (!vinculo) return;
    setSetor(vinculo.setor);
    // Pré-preenche a descrição com a não conformidade do monitoramento (o inspetor pode complementar).
    setDescricao((atual) => {
      if (atual) return atual;
      const linhas = [`Ficha: ${vinculo.fichaNome}`];
      if (vinculo.naoConformidades.length > 0) linhas.push("Não conformidade do monitoramento:", ...vinculo.naoConformidades.map((n) => `- ${n}`));
      return linhas.join("\n");
    });
  }, [vinculo]);

  // O inspetor indica o setor ONDE a não conformidade ocorre — qualquer setor cadastrado, não só os dele.
  const setoresParaEscolher = (masterSetores ?? []).length > 0 ? (masterSetores as string[]) : setoresDoUsuario;

  useEffect(() => {
    if (vinculo) return;
    setSetor((atual) => (atual && setoresParaEscolher.includes(atual) ? atual : (setoresDoUsuario[0] ?? setoresParaEscolher[0] ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, masterSetores]);

  async function handleAbrirRnc(e: FormEvent) {
    e.preventDefault();
    if (!perfil) return;
    if (!descricao.trim()) {
      setMensagem({ tipo: "error", texto: "Descreva o desvio antes de abrir a RNC." });
      return;
    }
    if (exigeAcaoImediata && !acaoImediata.trim()) {
      setMensagem({ tipo: "error", texto: "Informe a ação imediata tomada antes de abrir a RNC." });
      return;
    }

    try {
      const criada = await abrirRnc.mutateAsync({
        monitoramentoId: monitoramentoVinculo,
        descricao: descricao.trim(),
        acaoImediata: acaoImediata.trim() || null,
        setor,
        severidade,
        abertoPor: perfil.id,
      });
      let falhasFoto = 0;
      if (fotos.length > 0) falhasFoto = await enviarAnexosRnc(criada.id, "ABERTURA", fotos, perfil.id);
      setMensagem({
        tipo: falhasFoto > 0 ? "error" : "success",
        texto: falhasFoto > 0 ? `RNC aberta, mas ${falhasFoto} foto(s) não foram enviadas. Anexe de novo pela tela da RNC.` : "RNC aberta com sucesso.",
      });
      setTimeout(() => navigate(destinoFinal), falhasFoto > 0 ? 3500 : 1200);
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
              <Label htmlFor="setorRnc">Setor onde ocorre a não conformidade</Label>
              <Select id="setorRnc" value={setor} onChange={(e) => setSetor(e.target.value)} disabled={Boolean(vinculo)}>
                {setoresParaEscolher.map((s) => (
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

            <div className="space-y-2">
              <Label>Foto da não conformidade (opcional)</Label>
              <SeletorAnexos rotulo="Tirar/anexar foto" arquivos={fotos} onChange={setFotos} apenasImagens disabled={abrirRnc.isPending} testId="foto-nc" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acaoImediataRnc">{exigeAcaoImediata ? "Ação Imediata (obrigatório)" : "Ação Imediata (opcional)"}</Label>
              <Textarea
                id="acaoImediataRnc"
                required={exigeAcaoImediata}
                placeholder="Descreva o que foi feito imediatamente para conter o desvio…"
                value={acaoImediata}
                onChange={(e) => setAcaoImediata(e.target.value)}
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
