import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Fingerprint,
  Loader2,
  Search,
  ShieldCheck,
  ShieldX,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

interface Carimbo {
  emitido_em: string | null;
  tsa: string | null;
  tsr_base64: string;
}

interface ItemTrilha {
  tipo: string;
  nome: string;
  criado_em: string;
  carimbo: Carimbo | null;
}

interface RespostaVerificacao {
  tipo: "monitoramento" | "os";
  descricao?: string;
  trilha: ItemTrilha[];
  integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null;
  ficha?: { protocolo: string; documento: string; setor: string; criado_em: string };
  comparacao?: { registrado: string; atual: string; assinado_em: string } | null;
}

const TIPO_ROTULO: Record<string, string> = {
  INSPETOR: "Inspetor de Qualidade",
  VERIFICADOR: "Verificador",
  LIBERACAO_DIARIA: "Liberação ao SIF",
};

const FUSO = "America/Manaus";
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO });

function baixarTsr(base64: string, nomeArquivo: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/timestamp-reply" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 break-words text-sm font-semibold text-ink">{children}</p>
    </div>
  );
}

function SecaoTitulo({ icone, children, lateral }: { icone: ReactNode; children: ReactNode; lateral?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
        {icone}
        {children}
      </h2>
      {lateral}
    </div>
  );
}

function BannerIntegridade({ dados }: { dados: RespostaVerificacao }) {
  const carimbos = dados.trilha.filter((t) => t.carimbo?.emitido_em);
  const carimbado = carimbos.length > 0;
  const tsa = carimbos[0]?.carimbo?.tsa;

  if (dados.integridade === "VERSAO_ANTERIOR") {
    return (
      <div className="flex items-center gap-4 rounded-xl border-2 border-down/40 bg-down-soft p-5">
        <ShieldX className="h-12 w-12 shrink-0 text-down" aria-hidden />
        <div>
          <p className="text-xl font-extrabold text-down">≠ VERSÃO ANTERIOR — integridade violada</p>
          <p className="mt-1 text-sm text-ink">
            O conteúdo atual do documento é diferente do que foi assinado eletronicamente. Compare os hashes abaixo.
          </p>
        </div>
      </div>
    );
  }
  if (dados.integridade === null) {
    return (
      <div className="flex items-center gap-4 rounded-xl border-2 border-warning/40 bg-warning/10 p-5">
        <AlertTriangle className="h-12 w-12 shrink-0 text-warning-foreground" aria-hidden />
        <div>
          <p className="text-xl font-extrabold text-warning-foreground">Documento sem assinatura</p>
          <p className="mt-1 text-sm text-ink">Não há assinatura eletrônica registrada para verificar a integridade.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-5">
      <ShieldCheck className="h-12 w-12 shrink-0 text-emerald-700" aria-hidden />
      <div className="min-w-0">
        <p className="text-xl font-extrabold text-emerald-700">✓ Documento Íntegro</p>
        <p className="mt-1 text-sm text-ink">
          IDÊNTICO ao original assinado — o conteúdo não foi alterado desde a última assinatura eletrônica registrada.
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
          <Clock className="h-3 w-3" aria-hidden />
          {carimbado ? `Âncora de Tempo Independente (RFC 3161${tsa ? ` — ${tsa}` : ""})` : "Carimbo de tempo RFC 3161 em processamento"}
        </span>
      </div>
    </div>
  );
}

function ItemDaTrilha({ item, protocolo }: { item: ItemTrilha; protocolo: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-hairline bg-gray-50 p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <UserCheck className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-bold text-ink">{TIPO_ROTULO[item.tipo] ?? item.tipo}</span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-primary">{item.tipo}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {item.nome} · <span className="font-mono text-xs">{dataHora(item.criado_em)}</span>
        </p>
        <div className="mt-2">
          {item.carimbo ? (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              RFC 3161 · {item.carimbo.tsa ?? "TSA"}
              {item.carimbo.emitido_em ? ` · ${dataHora(item.carimbo.emitido_em)}` : ""}
              <button
                type="button"
                onClick={() => baixarTsr(item.carimbo!.tsr_base64, `${protocolo}-${item.tipo}.tsr`)}
                className="inline-flex items-center gap-1 rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] hover:bg-emerald-100"
              >
                <Download className="h-3 w-3" aria-hidden />
                .tsr
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden />
              carimbo pendente
            </span>
          )}
        </div>
      </div>
      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
    </div>
  );
}

/** Portal público de verificação (seção 7.6) — /verificar?id=<uuid>, sem login. Chama a
 * Edge Function verificar-documento (verify_jwt=false), que decide o que é seguro revelar. */
export function VerificarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const id = searchParams.get("id");
  const [uuidDigitado, setUuidDigitado] = useState(id ?? "");

  function aoVerificar(evento: FormEvent) {
    evento.preventDefault();
    const valor = uuidDigitado.trim();
    if (valor) setSearchParams({ id: valor });
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["verificar-documento", id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("verificar-documento", { body: { id } });
      if (error) throw error;
      return data as RespostaVerificacao;
    },
    enabled: Boolean(id),
    retry: false,
  });

  const algumCarimbo = data?.trilha.some((t) => t.carimbo) ?? false;
  const protocolo = data?.ficha?.protocolo ?? id ?? "documento";

  return (
    <div className="page-wash min-h-screen">
      <div className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <img src="/logo-globopac.png" alt="GloboPac" className="h-9 w-auto" />
          <h1 className="text-2xl font-semibold">Verificação de documento</h1>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-5 w-5 text-primary" aria-hidden />
              Verificar Autenticidade de Documento
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Informe o identificador único (UUID) impresso no documento. A verificação é pública e não requer login.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={aoVerificar} className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={uuidDigitado}
                onChange={(e) => setUuidDigitado(e.target.value)}
                placeholder="Ex: 3f2a8bfa-0c1e-4d7b-9e2a-1b3c5d7e9f2a"
                aria-label="Identificador único (UUID) do documento"
              />
              <Button type="submit" className="shrink-0 gap-2">
                <Search className="h-4 w-4" aria-hidden />
                Verificar
              </Button>
            </form>
          </CardContent>
        </Card>

        {id && isLoading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Verificando…
          </p>
        )}
        {id && isError && (
          <Card>
            <CardContent className="flex items-start gap-3 pt-6 text-muted-foreground">
              <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-down" aria-hidden />
              <span>Documento não encontrado. Confira o link ou entre em contato com quem o enviou.</span>
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="space-y-4">
            <BannerIntegridade dados={data} />

            <Card>
              <CardContent className="space-y-4 pt-6">
                <SecaoTitulo icone={<FileText className="h-4 w-4" aria-hidden />}>
                  {data.tipo === "os" ? "Ordem de serviço de manutenção" : "Ficha de monitoramento"}
                </SecaoTitulo>
                {data.ficha ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Campo rotulo="Protocolo">
                      <span className="font-mono text-xs">{data.ficha.protocolo}</span>
                    </Campo>
                    <Campo rotulo="Documento">{data.ficha.documento}</Campo>
                    <Campo rotulo="Setor">{data.ficha.setor}</Campo>
                    <Campo rotulo="Data de criação">{dataHora(data.ficha.criado_em)}</Campo>
                  </div>
                ) : (
                  data.descricao && <p className="text-sm text-ink">{data.descricao}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-6">
                <SecaoTitulo
                  icone={<Fingerprint className="h-4 w-4" aria-hidden />}
                  lateral={
                    <span className="font-mono text-[10px] text-muted-foreground">Lei 14.063/2020 · Art. 4º §2º · SHA-256</span>
                  }
                >
                  Trilha de assinaturas eletrônicas avançadas
                </SecaoTitulo>
                {data.trilha.map((item, indice) => (
                  <ItemDaTrilha key={indice} item={item} protocolo={protocolo} />
                ))}

                {algumCarimbo && (
                  <div className="rounded-lg border border-hairline bg-gray-50 p-3 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      <strong className="text-ink">Opção 1 — Ferramenta online da FreeTSA:</strong> baixe o arquivo{" "}
                      <span className="font-mono">.tsr</span> do carimbo acima e envie em{" "}
                      <a className="text-primary underline" href="https://freetsa.org" target="_blank" rel="noreferrer">
                        freetsa.org
                      </a>{" "}
                      → seção "Online Signature" → aba "Verify". A verificação roda no seu navegador, sem depender do GloboPac.
                    </p>
                    <p className="mt-2">
                      <strong className="text-ink">Opção 2 — Linha de comando:</strong> baixe o <span className="font-mono">.tsr</span> e
                      execute:
                    </p>
                    <pre className="mt-1 overflow-x-auto rounded bg-white p-2 font-mono text-[10px] text-ink">
                      openssl ts -verify -in carimbo.tsr -digest &lt;hash-sha256&gt; -CAfile freetsa_cacert.pem -untrusted freetsa_tsa.crt
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {data.comparacao && (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <SecaoTitulo icone={<ShieldCheck className="h-4 w-4" aria-hidden />}>Comparação de integridade — SHA-256</SecaoTitulo>
                  <div className="space-y-2 rounded-lg border border-hairline bg-gray-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>Última assinatura registrada · {dataHora(data.comparacao.assinado_em)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold ${
                          data.integridade === "IDENTICO" ? "bg-emerald-100 text-emerald-700" : "bg-down-soft text-down"
                        }`}
                      >
                        {data.integridade === "IDENTICO" ? "✓ IDÊNTICO" : "≠ DIFERENTE"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Registrado</p>
                      <p className="break-all font-mono text-[11px] font-bold text-primary">{data.comparacao.registrado}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Atual</p>
                      <p
                        className={`break-all font-mono text-[11px] font-bold ${
                          data.integridade === "IDENTICO" ? "text-emerald-700" : "text-down"
                        }`}
                      >
                        {data.comparacao.atual}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="pb-4 text-center text-[11px] text-muted-foreground">
              Verificação gerada em {dataHora(new Date().toISOString())} · Sistema GloboPac — Kaefer Agro Industrial Ltda. · SIF 1606
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
