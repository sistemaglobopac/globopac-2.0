import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Droplet, Hourglass, Scale, Waves } from "lucide-react";
import { useSessionStore } from "@/store/session";
import { resolverSetoresEfetivos, useSetoresCadastrados } from "@/modules/admin/api";
import { aguardaChiller2, aguardaDripping, aguardaPesoDaBalanca, useFichasTemplatesTodas, useMonitoramentosEmAndamento, useTemplatesPorIds, useUsuariosMap, type MonitoramentoEmAndamento } from "../api";
import { SubstituirAbsorcaoModal } from "./SubstituirAbsorcaoModal";
import { ALERTA_PESAGEM_FINAL_MIN, duracaoDrenagemMin, minutosAguardandoPesoFinal, tempoMinimoDrenagemMax } from "../fields/calculosAbsorcao";
import type { DrippingTestValor } from "../fields/tiposCompostos";
import { ALERTA_PESO_PENDENTE_MIN } from "../fields/pesoCaixa";
import { ALERTA_CHILLER2_MIN } from "../fields/controleAbsorcao";
import { ensureLocalTime } from "../utils/tempo";
import { horaEfetiva } from "../utils/horaMonitoramento";

function ehValorDripping(v: unknown): v is DrippingTestValor {
  return typeof v === "object" && v !== null && Array.isArray((v as DrippingTestValor).items) && "horaInicio" in v && "lote" in v;
}

function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** "Monitoramentos em andamento": (1) absorções abertas (só pesagem inicial) de qualquer inspetor do setor — quem assume o
 * turno finaliza a do colega —, destacadas após ALERTA_PESAGEM_FINAL_MIN; (2) monitoramentos de peso por caixa AGUARDANDO O PESO DA BALANÇA, de qualquer
 * inspetor do setor, destacados após ALERTA_PESO_PENDENTE_MIN. Tocar abre o registro para completar. */
export function MonitoramentosEmAndamento() {
  const perfil = useSessionStore((s) => s.perfil);
  const navigate = useNavigate();
  const { data: masterSetores } = useSetoresCadastrados();
  const setores = resolverSetoresEfetivos(perfil?.setoresPermitidos ?? [], masterSetores);
  const { data: emAndamento } = useMonitoramentosEmAndamento(perfil?.id, setores);
  const { data: nomes } = useUsuariosMap();
  const [substituindo, setSubstituindo] = useState<MonitoramentoEmAndamento | null>(null);
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
          const chiller2 = aguardaChiller2(m);
          const dripping = aguardaDripping(m);
          const inicio = horaEfetiva(m);
          // Dripping: a drenagem conta da Hora Início digitada pelo inspetor; destaca quando a carcaça de maior peso já cumpriu o
          // tempo mínimo (hora de retirar).
          const valoresDripping = dripping ? Object.values(m.dados_dinamicos).filter(ehValorDripping) : [];
          const drenagem = tempoMinimoDrenagemMax(valoresDripping.flatMap((v) => v.items));
          const minutos =
            valoresDripping[0] && valoresDripping[0].horaInicio
              ? (duracaoDrenagemMin(valoresDripping[0].horaInicio, ensureLocalTime(agora.toISOString()).time) ?? minutosAguardandoPesoFinal(inicio, agora))
              : minutosAguardandoPesoFinal(inicio, agora);
          const atrasado = dripping ? drenagem !== null && minutos >= drenagem : minutos >= (chiller2 ? ALERTA_CHILLER2_MIN : peso ? ALERTA_PESO_PENDENTE_MIN : ALERTA_PESAGEM_FINAL_MIN);
          const doColega = !!perfil && m.user_id !== perfil.id;
          const absorcao = !chiller2 && !peso && !dripping;
          return (
            <div key={m.id} className="flex flex-col gap-1">
            <button
              type="button"
              data-testid={dripping ? "aguardando-dripping" : chiller2 ? "aguardando-chiller2" : peso ? "aguardando-peso" : "aguardando-pesagem-final"}
              onClick={() => navigate(dripping ? `/fichas/dripping/${m.id}` : chiller2 ? `/fichas/chiller2/${m.id}` : peso ? `/fichas/peso/${m.id}` : `/fichas/continuar/${m.id}`)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                atrasado ? "border-destructive bg-destructive/10 hover:bg-destructive/20" : "border-primary/30 bg-background hover:bg-primary/5"
              }`}
            >
              <span className="block text-sm font-bold">{nomePorId.get(m.ficha_template_id) ?? (dripping ? "Dripping Test" : chiller2 ? "Controle de absorção" : peso ? "Peso por caixa" : "Absorção de água")}</span>
              <span className="block text-xs text-muted-foreground">
                {m.setor} · {dripping ? "1ª etapa (lote, lacre, M0 e M1)" : chiller2 ? "etapa 1 (pré-chiller e chiller 01)" : peso ? "monitoramento realizado" : "pesagem inicial"} às {ensureLocalTime(inicio).time}
              </span>
              <span className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${atrasado ? "text-destructive" : "text-primary"}`}>
                {atrasado && <AlertTriangle className="h-3.5 w-3.5 animate-pulse" />}
                {dripping && <Droplet className="h-3.5 w-3.5" />}
                {chiller2 && <Waves className="h-3.5 w-3.5" />}
                {peso && !chiller2 && <Scale className="h-3.5 w-3.5" />}
                {dripping
                  ? atrasado
                    ? `Drenagem cumprida (${duracao(minutos)} de banho-maria) — toque para registrar a retirada`
                    : `Em drenagem há ${duracao(minutos)} — toque para registrar a retirada`
                  : chiller2
                  ? `Aguardando o chiller 02 há ${duracao(minutos)} — toque para informar`
                  : peso
                    ? `Aguardando o peso da balança há ${duracao(minutos)} — toque para completar`
                    : `Aguardando peso final há ${duracao(minutos)} — toque para pesar`}
              </span>
              {doColega && <span className="mt-1 block text-xs text-muted-foreground">Iniciado por {nomes?.get(m.user_id) ?? "outro inspetor"} (do seu setor)</span>}
            </button>
            {absorcao && (
              <button
                type="button"
                className="self-start rounded px-1 text-xs font-semibold text-muted-foreground underline hover:text-primary"
                data-testid={`substituido-${m.id}`}
                onClick={() => setSubstituindo(m)}
              >
                Já foi refeito em outro registro? Marcar como substituído
              </button>
            )}
            </div>
          );
        })}
      </div>
      {substituindo && <SubstituirAbsorcaoModal pendente={substituindo} onFechar={() => setSubstituindo(null)} />}
    </section>
  );
}
