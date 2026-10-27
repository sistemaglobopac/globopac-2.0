import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Image as ImagemIcone, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { enviarFotosSolicitacao, urlFotoSolicitacao, useFotosSolicitacao } from "./api";
import { MAX_FOTOS_SOLICITACAO, TAMANHO_MAXIMO_FOTO_BYTES } from "./tipos";

/** Fotos ainda não enviadas: o inspetor tira na câmera ou escolhe da galeria. O envio acontece depois que
 * a SS é gravada (precisa do id dela). `maximo` desconta as fotos que a SS já tem. */
export function SeletorFotos({
  fotos,
  onChange,
  disabled,
  maximo = MAX_FOTOS_SOLICITACAO,
}: {
  fotos: File[];
  onChange: (fotos: File[]) => void;
  disabled?: boolean;
  maximo?: number;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);

  function adicionar(lista: FileList | null, entrada: HTMLInputElement | null) {
    if (entrada) entrada.value = "";
    if (!lista) return;
    const avisos: string[] = [];
    const aceitas: File[] = [];
    for (const arquivo of Array.from(lista)) {
      if (!arquivo.type.startsWith("image/")) avisos.push("só imagens são aceitas");
      else if (arquivo.size > TAMANHO_MAXIMO_FOTO_BYTES) avisos.push("foto acima de 10 MB ignorada");
      else aceitas.push(arquivo);
    }
    const cabem = Math.max(0, maximo - fotos.length);
    if (aceitas.length > cabem) avisos.push(`máximo de ${maximo} fotos por solicitação`);
    setAviso(avisos.length > 0 ? `Atenção: ${[...new Set(avisos)].join("; ")}.` : null);
    onChange([...fotos, ...aceitas.slice(0, cabem)]);
  }

  const cheio = fotos.length >= maximo;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || cheio} onClick={() => camera.current?.click()}>
          <Camera className="h-4 w-4" />
          Tirar foto
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || cheio} onClick={() => galeria.current?.click()}>
          <ImagemIcone className="h-4 w-4" />
          Escolher da galeria
        </Button>
        <span className="text-xs text-muted-foreground">
          {fotos.length}/{maximo} fotos · até 10 MB cada
        </span>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="bpf-foto-camera"
          onChange={(e) => adicionar(e.target.files, e.target)}
        />
        <input
          ref={galeria}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="bpf-foto-galeria"
          onChange={(e) => adicionar(e.target.files, e.target)}
        />
      </div>
      {aviso && <p className="text-xs text-destructive">{aviso}</p>}
      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {fotos.map((foto, indice) => (
            <li key={`${foto.name}-${indice}`} className="relative aspect-square overflow-hidden rounded border bg-muted">
              <img src={previas[indice]} alt={foto.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remover ${foto.name}`}
                disabled={disabled}
                onClick={() => onChange(fotos.filter((_, i) => i !== indice))}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniaturaFoto({ caminho, nome }: { caminho: string; nome: string }) {
  const { data: url, isError } = useQuery({
    queryKey: ["bpf", "foto-url", caminho],
    queryFn: () => urlFotoSolicitacao(caminho),
    staleTime: 4 * 60 * 1000,
  });
  return (
    <li className="aspect-square overflow-hidden rounded border bg-muted">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${nome}`}>
          <img src={url} alt={nome} loading="lazy" className="h-full w-full object-cover" />
        </a>
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
          {isError ? "Falha ao carregar" : "Carregando…"}
        </span>
      )}
    </li>
  );
}

/** Fotos já gravadas da SS, vistas por inspetor, administrador e PCM. Sem fotos, não ocupa espaço. */
export function FotosDaSolicitacao({ solicitacaoId }: { solicitacaoId: string }) {
  const { data: fotos } = useFotosSolicitacao(solicitacaoId);
  if (!fotos || fotos.length === 0) return null;
  return (
    <ul className="grid grid-cols-4 gap-2 pt-2 sm:grid-cols-6" aria-label="Fotos da solicitação">
      {fotos.map((f) => (
        <MiniaturaFoto key={f.id} caminho={f.caminho} nome={f.nome} />
      ))}
    </ul>
  );
}

/** Acrescenta fotos a uma SS já aberta (para quando o envio no ato falhou, ou o inspetor lembrou depois). */
export function AdicionarFotos({ solicitacaoId, userId, aoEnviar }: { solicitacaoId: string; userId: string; aoEnviar: (falhas: number) => void }) {
  const queryClient = useQueryClient();
  const { data: gravadas } = useFotosSolicitacao(solicitacaoId);
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const jaTem = gravadas?.length ?? 0;

  async function enviar() {
    setEnviando(true);
    try {
      const falhas = await enviarFotosSolicitacao(solicitacaoId, fotos, userId);
      setFotos([]);
      await queryClient.invalidateQueries({ queryKey: ["bpf", "fotos", solicitacaoId] });
      aoEnviar(falhas);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2 pt-2">
      <SeletorFotos fotos={fotos} onChange={setFotos} disabled={enviando} maximo={Math.max(0, MAX_FOTOS_SOLICITACAO - jaTem)} />
      {fotos.length > 0 && (
        <Button type="button" size="sm" onClick={() => void enviar()} disabled={enviando}>
          {enviando ? "Enviando…" : `Enviar ${fotos.length} foto(s)`}
        </Button>
      )}
    </div>
  );
}
