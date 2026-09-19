import { useEffect, useState } from "react";
import { ModalShell } from "../ModalShell";
import { LIMITE_MIN_POR_TIPO_PAUSA, type PausaDetalhe, usePausasHojeDetalhado, usePerfisGestao } from "../api";

const ROTULO_TIPO: Record<PausaDetalhe["tipo_pausa"], string> = {
  CURTA_20M: "Pausa Curta (20 min)",
  ALMOCO_72M: "Almoço/Jantar (1h12)",
  JANTAR_72M: "Almoço/Jantar (1h12)",
};

function duracaoMin(inicio: string, fim: string | null, agoraMs: number): number {
  const fimMs = fim ? new Date(fim).getTime() : agoraMs;
  return Math.max(0, Math.round((fimMs - new Date(inicio).getTime()) / 60_000));
}

function ColunaPausas({ titulo, pausas, agoraMs }: { titulo: string; pausas: PausaDetalhe[]; agoraMs: number }) {
  const totalMin = pausas.reduce((soma, p) => soma + duracaoMin(p.hora_inicio, p.hora_fim, agoraMs), 0);

  return (
    <div className="flex-1 rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h4>
        <span className="text-xs font-bold text-ink">
          {pausas.length} · {totalMin} min
        </span>
      </div>
      {pausas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma pausa registrada.</p>}
      <ul className="space-y-1.5">
        {pausas.map((p) => {
          const duracao = duracaoMin(p.hora_inicio, p.hora_fim, agoraMs);
          const excedeu = duracao > LIMITE_MIN_POR_TIPO_PAUSA[p.tipo_pausa];
          const inicioFmt = new Date(p.hora_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const fimFmt = p.hora_fim ? new Date(p.hora_fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
                excedeu ? "border-hairline bg-destructive/10" : "border-hairline bg-canvas"
              }`}
            >
              <span className="text-ink">
                {inicioFmt} → {fimFmt}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`font-bold ${excedeu ? "text-destructive" : "text-ink"}`}>{duracao} min</span>
                {p.status === "EM_ANDAMENTO" && (
                  <span className="rounded-full bg-lime px-1.5 py-0.5 text-[10px] font-bold text-primary">em andamento</span>
                )}
                {excedeu && (
                  <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">excedeu</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ModalPausasInspetores({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = usePausasHojeDetalhado();
  const { data: perfis } = usePerfisGestao();
  const [agoraMs, setAgoraMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAgoraMs(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p.nome_completo]));

  const porInspetor = new Map<string, PausaDetalhe[]>();
  for (const id of data?.idsInspetoresAtivos ?? []) porInspetor.set(id, []);
  for (const pausa of data?.pausas ?? []) {
    const lista = porInspetor.get(pausa.user_id) ?? [];
    lista.push(pausa);
    porInspetor.set(pausa.user_id, lista);
  }

  const linhas = Array.from(porInspetor.entries())
    .map(([id, pausas]) => ({
      id,
      nome: nomePorId.get(id) ?? "—",
      curtas: pausas.filter((p) => p.tipo_pausa === "CURTA_20M"),
      refeicoes: pausas.filter((p) => p.tipo_pausa !== "CURTA_20M"),
      temEmAndamento: pausas.some((p) => p.status === "EM_ANDAMENTO"),
    }))
    .sort((a, b) => Number(b.temEmAndamento) - Number(a.temEmAndamento) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <ModalShell titulo="Pausa dos Inspetores" onClose={onClose} largura="max-w-3xl">
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhum inspetor ativo hoje.</p>}
      <div className="space-y-4">
        {linhas.map((linha) => (
          <div key={linha.id} className="rounded-xl border border-hairline p-3">
            <p className="mb-2 text-sm font-bold text-ink">{linha.nome}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ColunaPausas titulo={ROTULO_TIPO.CURTA_20M} pausas={linha.curtas} agoraMs={agoraMs} />
              <ColunaPausas titulo={ROTULO_TIPO.ALMOCO_72M} pausas={linha.refeicoes} agoraMs={agoraMs} />
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
