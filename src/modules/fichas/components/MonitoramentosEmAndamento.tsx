import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Hourglass } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { useFichasTemplatesTodas, useMonitoramentosEmAndamento } from "../api";
import { ALERTA_PESAGEM_FINAL_MIN, minutosAguardandoPesoFinal } from "../fields/calculosAbsorcao";
import { ensureLocalTime } from "../utils/tempo";

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** "Monitoramentos em andamento": absorções abertas (só pesagem inicial) do inspetor. Destaca as
 * que passaram de ALERTA_PESAGEM_FINAL_MIN ("aguardando peso final há 45 min"). Tocar abre o mesmo
 * registro na pesagem final. */
export function MonitoramentosEmAndamento() {
  const perfil = useSessionStore((s) => s.perfil);
  const navigate = useNavigate();
  const { data: emAndamento } = useMonitoramentosEmAndamento(perfil?.id);
  const { data: templates } = useFichasTemplatesTodas();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!emAndamento || emAndamento.length === 0) return null;
  const nomePorId = new Map((templates ?? []).map((t) => [t.id, t.nome]));

  return (
    <section className="space-y-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4" data-testid="monitoramentos-em-andamento">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-primary">
        <Hourglass className="h-4 w-4" /> Monitoramentos em andamento ({emAndamento.length})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {emAndamento.map((m) => {
          const minutos = minutosAguardandoPesoFinal(m.criado_em, agora);
          const atrasado = minutos >= ALERTA_PESAGEM_FINAL_MIN;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(`/fichas/continuar/${m.id}`)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                atrasado ? "border-destructive bg-destructive/10 hover:bg-destructive/20" : "border-primary/30 bg-background hover:bg-primary/5"
              }`}
            >
              <span className="block text-sm font-bold">{nomePorId.get(m.ficha_template_id) ?? "Absorção de água"}</span>
              <span className="block text-xs text-muted-foreground">
                {m.setor} · pesagem inicial às {ensureLocalTime(m.criado_em).time}
              </span>
              <span className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${atrasado ? "text-destructive" : "text-primary"}`}>
                {atrasado && <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />}
                Aguardando peso final há {duracao(minutos)} — toque para pesar
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
