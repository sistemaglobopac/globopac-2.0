import { useRef, useState } from "react";
import { FileText, Image as ImagemIcone, Paperclip, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ACEITA_ANEXOS_RNC, TAMANHO_MAXIMO_ANEXO_BYTES, urlAnexoRnc, useAnexosRnc, type AnexoRnc, type EtapaAnexoRnc } from "./api";

const ROTULO_ETAPA: Record<EtapaAnexoRnc, string> = {
  ABERTURA: "Anexado na abertura (inspetor)",
  TRATATIVA: "Anexado na resposta (gestor)",
};

function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Escolha de arquivos (fotos e documentos) ainda não enviados — o envio acontece quando a RNC
 * é gravada. Arquivos acima do limite são recusados na hora. */
export function SeletorAnexos({
  rotulo,
  arquivos,
  onChange,
  disabled,
  apenasImagens = false,
  testId,
}: {
  rotulo: string;
  arquivos: File[];
  onChange: (arquivos: File[]) => void;
  disabled?: boolean;
  apenasImagens?: boolean;
  testId?: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos: File[] = [];
    let recusados = 0;
    for (const arquivo of Array.from(lista)) {
      if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) recusados += 1;
      else novos.push(arquivo);
    }
    setErro(recusados > 0 ? `${recusados} arquivo(s) acima de 10 MB foram ignorados.` : null);
    onChange([...arquivos, ...novos]);
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => entrada.current?.click()}>
          <Paperclip className="h-4 w-4" />
          {rotulo}
        </Button>
        <input
          ref={entrada}
          type="file"
          multiple
          hidden
          data-testid={testId}
          accept={apenasImagens ? "image/*" : ACEITA_ANEXOS_RNC}
          capture={apenasImagens ? "environment" : undefined}
          onChange={(e) => adicionar(e.target.files)}
        />
        <span className="text-xs text-muted-foreground">{apenasImagens ? "Foto (até 10 MB)" : "Fotos, PDF, Word ou Excel (até 10 MB cada)"}</span>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
      {arquivos.length > 0 && (
        <ul className="space-y-1">
          {arquivos.map((arquivo, indice) => (
            <li key={`${arquivo.name}-${indice}`} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1 text-xs">
              <span className="truncate">
                {arquivo.name} <span className="text-muted-foreground">({tamanhoLegivel(arquivo.size)})</span>
              </span>
              <button type="button" aria-label={`Remover ${arquivo.name}`} onClick={() => onChange(arquivos.filter((_, i) => i !== indice))} disabled={disabled}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemAnexo({ anexo }: { anexo: AnexoRnc }) {
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState(false);
  const imagem = anexo.tipo_mime?.startsWith("image/");

  async function abrir() {
    setAbrindo(true);
    setErro(false);
    try {
      window.open(await urlAnexoRnc(anexo.caminho), "_blank", "noopener,noreferrer");
    } catch {
      setErro(true);
    } finally {
      setAbrindo(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded border bg-background px-2 py-1 text-xs">
      <span className="flex min-w-0 items-center gap-1.5">
        {imagem ? <ImagemIcone className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{anexo.nome}</span>
        <span className="shrink-0 text-muted-foreground">{tamanhoLegivel(anexo.tamanho_bytes)}</span>
      </span>
      <button type="button" className="shrink-0 font-semibold text-primary hover:underline" onClick={abrir} disabled={abrindo}>
        {abrindo ? "Abrindo…" : erro ? "Falhou — tentar de novo" : "Abrir"}
      </button>
    </li>
  );
}

/** Anexos já gravados da RNC, agrupados por etapa (abertura pelo inspetor / resposta do gestor). */
export function ListaAnexosRnc({ rncId }: { rncId: string }) {
  const { data: anexos } = useAnexosRnc(rncId);
  if (!anexos || anexos.length === 0) return null;
  const etapas: EtapaAnexoRnc[] = ["ABERTURA", "TRATATIVA"];
  return (
    <div className="space-y-2">
      {etapas.map((etapa) => {
        const doGrupo = anexos.filter((a) => a.etapa === etapa);
        if (doGrupo.length === 0) return null;
        return (
          <div key={etapa} className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{ROTULO_ETAPA[etapa]}</p>
            <ul className="space-y-1">
              {doGrupo.map((anexo) => (
                <ItemAnexo key={anexo.id} anexo={anexo} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
