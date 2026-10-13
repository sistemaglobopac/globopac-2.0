import { CheckCircle2, Clock, Egg } from "lucide-react";
import type { LinhaAvesVazao, ResumoAvesVazao, SituacaoCarga } from "./avesNaVazao";

const ROTULO: Record<SituacaoCarga, string> = {
  completa: "Completa",
  parcial: "Em andamento",
  nao_iniciada: "Não iniciada",
};

const COR: Record<SituacaoCarga, string> = {
  completa: "bg-success/15 text-success",
  parcial: "bg-warning/10 text-warning",
  nao_iniciada: "bg-secondary text-secondary-foreground",
};

function n(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

function Barra({ contadas, programadas }: { contadas: number; programadas: number }) {
  const pct = programadas > 0 ? Math.min(100, (contadas / programadas) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

function LinhaCarga({ linha }: { linha: LinhaAvesVazao }) {
  const origem = [linha.integrado, linha.aviario].filter(Boolean).join(" — ");
  return (
    <li className="space-y-1 py-2" data-testid={`aves-vazao-carga-${linha.gta}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          GTA {linha.gta || "—"}
          {origem && <span className="ml-1 font-normal text-muted-foreground">· {origem}</span>}
          {linha.placa && <span className="ml-1 font-normal text-muted-foreground">· {linha.placa}</span>}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">
            {n(linha.contadas)} de {n(linha.programadas)} aves
            {linha.aMao > 0 && (
              <span className="ml-1 text-[11px] font-bold text-warning" title="Aves digitadas à mão que o sistema atribuiu a esta carga pela ordem da pendura">
                ({n(linha.aMao)} à mão)
              </span>
            )}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${COR[linha.situacao]}`}>
            {linha.situacao === "completa" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {ROTULO[linha.situacao]}
          </span>
        </div>
      </div>
      <Barra contadas={linha.contadas} programadas={linha.programadas} />
    </li>
  );
}

/** Painel de Bordo: aves programadas para o abate × aves já consideradas nos monitoramentos de vazão, carga a carga.
 * Só informa — não impede finalizar o turno. */
export function CartaoAvesVazao({ resumo }: { resumo: ResumoAvesVazao }) {
  return (
    <section className="space-y-3 rounded-xl border border-hairline bg-card p-4 shadow-sm" data-testid="aves-vazao">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-muted-foreground">
            <Egg className="h-4 w-4" /> Aves na vazão
          </h2>
          <p className="text-xs text-muted-foreground">Aves programadas para o abate já consideradas nos monitoramentos de vazão.</p>
        </div>
        <p className="text-lg font-black text-ink" data-testid="aves-vazao-total">
          {n(resumo.totalContadas)} de {n(resumo.totalProgramadas)} aves
        </p>
      </div>
      <Barra contadas={resumo.totalContadas} programadas={resumo.totalProgramadas} />
      {resumo.incompletas > 0 ? (
        <p className="text-xs text-muted-foreground">
          {resumo.incompletas === 1 ? "1 carga ainda não entrou por inteiro." : `${resumo.incompletas} cargas ainda não entraram por inteiro.`}
        </p>
      ) : (
        <p className="text-xs font-bold text-success">Todas as aves programadas foram consideradas.</p>
      )}
      {resumo.totalAMao > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-ink" data-testid="aves-vazao-a-mao">
          {n(resumo.totalAMao)} aves foram digitadas à mão (sem carga). O sistema as atribuiu às cargas pela ordem da pendura e refaz essa atribuição sozinho
          quando o Bem-Estar Animal registra ou corrige o horário da pendura.
          {resumo.aMaoExcedente > 0 && (
            <strong className="block text-destructive">
              {n(resumo.aMaoExcedente)} aves digitadas à mão passam do total programado — confira a quantidade digitada.
            </strong>
          )}
        </p>
      )}
      <ul className="divide-y divide-hairline">
        {resumo.linhas.map((l) => (
          <LinhaCarga key={l.cargaId} linha={l} />
        ))}
      </ul>
    </section>
  );
}
