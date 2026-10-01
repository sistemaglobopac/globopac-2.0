import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

interface ItemTrilha {
  tipo: string;
  nome: string;
  criado_em: string;
  carimbo: { emitido_em: string | null; tsa: string | null } | null;
}

interface RespostaVerificacao {
  tipo: "monitoramento" | "os";
  descricao?: string;
  trilha: ItemTrilha[];
  integridade: "IDENTICO" | "VERSAO_ANTERIOR" | null;
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

  return (
    <div className="mx-auto min-h-screen max-w-xl space-y-4 p-6">
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
            Informe o identificador único (UUID) impresso no documento. A verificação é pública e
            não requer login.
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

      {id && isLoading && <p className="text-muted-foreground">Verificando…</p>}
      {id && isError && (
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            Documento não encontrado. Confira o link ou entre em contato com quem o enviou.
          </CardContent>
        </Card>
      )}

      {data && (
        <div className="space-y-4">
          {data.tipo === "os" && (
            <p className="text-sm text-muted-foreground">
              Ordem de Serviço de manutenção{data.descricao ? `: ${data.descricao}` : ""}
            </p>
          )}
          {data.integridade && (
            <Badge variant={data.integridade === "IDENTICO" ? "success" : "destructive"} className="text-sm">
              {data.integridade === "IDENTICO" ? "✓ IDÊNTICO ao original assinado" : "≠ VERSÃO ANTERIOR (integridade violada)"}
            </Badge>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trilha de assinaturas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.trilha.map((item, indice) => (
                <div
                  key={indice}
                  className="flex items-center justify-between border-b pb-3 text-sm last:border-0 last:pb-0"
                >
                  <div>
                    <div className="font-medium">{item.tipo}</div>
                    <div className="text-muted-foreground">{item.nome}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-muted-foreground">
                      {new Date(item.criado_em).toLocaleString("pt-BR")}
                    </div>
                    <Badge variant={item.carimbo ? "success" : "outline"}>
                      {item.carimbo ? "RFC 3161 ✓" : "carimbo pendente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
