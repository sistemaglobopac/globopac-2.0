import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Hourglass, Scale } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { aguardaPesoDaBalanca, useFichasTemplatesTodas, useMonitoramentosEmAndamento, useTemplatesPorIds } from "../api";
import { ALERTA_PESAGEM_FINAL_MIN, minutosAguardandoPesoFinal } from "../fields/calculosAbsorcao";
import { ALERTA_PESO_PENDENTE_MIN } from "../fields/pesoCaixa";
import { ensureLocalTime } from "../utils/tempo";
import { horaEfetiva } from "../utils/horaMonitoramento";

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** "Monitoramentos em andamento": (1) absorções abertas (só pesagem inicial) do inspetor, destacadas após
 * ALERTA_PESAGEM_FINAL_MIN; (2) monitoramentos de peso por caixa AGUARDANDO O PESO DA BALANÇA, de qualquer
 * inspetor do setor, destacados após ALERTA_PESO_PENDENTE_MIN. Tocar abre o registro para completar. */
export function MonitoramentosEmAndamento() {
  const perfil = useSessionStore((s) => s.perfil);
  const navigate = useNavigate();
  const { data: masterSetores } = useSetoresCadastrados();
  const setores = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);
  const { data: emAndamento } = useMonitoramentosEmAndamento(perfil?.id, setores);
  const { data: templates } = useFichasTemplatesTodas();
  const { data: templatesDosRegistros } = useTemplatesPorIds((emAndamento ?? []).map((m) => m.ficha_template_id));
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!emAndamento || emAndamento.length === 0) return null;
  const nomePorId = new Map([...(templatesDosRegistros ?? []), ...(templates ?? [])].map((t) => [t.id, t.nome]));

  return (
    <section className="space-y-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4" data-testid="monitoramentos-em-andamento">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-primary">
        <Hourglass className="h-4 w-4" /> Monitoramentos em andamento ({emAndamento.length})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {emAndamento.map((m) => {
          const peso = aguardaPesoDaBalanca(m);
          const inicio = horaEfetiva(m);
          const minutos = minutosAguardandoPesoFinal(inicio, agora);
          const atrasado = minutos >= (peso ? ALERTA_PESO_PENDENTE_MIN : ALERTA_PESAGEM_FINAL_MIN);
          return (
            <button
              key={m.id}
              type="button"
              data-testid={peso ? "aguardando-peso" : "aguardando-pesagem-final"}
              onClick={() => navigate(peso ? `/fichas/peso/${m.id}` : `/fichas/continuar/${m.id}`)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                atrasado ? "border-destructive bg-destructive/10 hover:bg-destructive/20" : "border-primary/30 bg-background hover:bg-primary/5"
              }`}
            >
              <span className="block text-sm font-bold">{nomePorId.get(m.ficha_template_id) ?? (peso ? "Peso por caixa" : "Absorção de água")}</span>
              <span className="block text-xs text-muted-foreground">
                {m.setor} · {peso ? "monitoramento realizado" : "pesagem inicial"} às {ensureLocalTime(inicio).time}
              </span>
              <span className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${atrasado ? "text-destructive" : "text-primary"}`}>
                {atrasado && <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />}
                {peso && <Scale className="h-3.5 w-3.5" />}
                {peso ? `Aguardando o peso da balança há ${duracao(minutos)} — toque para completar` : `Aguardando peso final há ${duracao(minutos)} — toque para pesar`}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
