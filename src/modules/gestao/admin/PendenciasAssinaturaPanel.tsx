import { AlertTriangle, CheckCircle2, Clock, FileSignature } from "lucide-react";
import { useUsuariosMap } from "@/modules/fichas/api";
import { PRAZO_ASSINATURA_HORAS } from "@/modules/fichas/utils/horaMonitoramento";
import { useRascunhosPendentes, useRegistrosSemAssinatura } from "../pendenciasAssinaturaApi";

const HORA_MS = 3_600_000;

function formatar(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function Prazo({ horaMonitoramento }: { horaMonitoramento: string }) {
  const limite = new Date(horaMonitoramento).getTime() + PRAZO_ASSINATURA_HORAS * HORA_MS;
  const restanteH = (limite - Date.now()) / HORA_MS;
  if (restanteH <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">
        <AlertTriangle className="h-3 w-3" /> Vencido
      </span>
    );
  }
  const urgente = restanteH <= 24;
  const texto = restanteH >= 24 ? `${Math.floor(restanteH / 24)} d ${Math.floor(restanteH % 24)} h` : `${Math.max(1, Math.floor(restanteH))} h`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${urgente ? "bg-warning/10 text-warning" : "bg-secondary text-secondary-foreground"}`}>
      <Clock className="h-3 w-3" /> Vence em {texto}
    </span>
  );
}

/** Aba "Pendências de Assinatura": o que cada inspetor ainda não assinou. Rascunhos (preenchidos e não assinados, de qualquer
 * aparelho) vencem 7 dias depois da hora do monitoramento. Registros já gravados sem assinatura não podem ser assinados depois. */
export function PendenciasAssinaturaPanel() {
  const rascunhos = useRascunhosPendentes();
  const semAssinatura = useRegistrosSemAssinatura();
  const { data: nomes } = useUsuariosMap();
  const nome = (id: string) => nomes?.get(id) ?? "Inspetor";

  return (
    <div className="space-y-5 rounded-2xl border border-hairline bg-card p-5 shadow-sm" data-testid="pendencias-assinatura">
      <div className="flex items-start gap-3">
        <FileSignature className="h-7 w-7 shrink-0 text-primary" />
        <div>
          <h2 className="text-lg font-bold text-ink">Pendências de Assinatura</h2>
          <p className="text-sm text-muted-foreground">O que cada inspetor ainda não assinou, para você cobrar antes do prazo vencer.</p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Rascunhos aguardando assinatura ({rascunhos.data?.length ?? 0})</h3>
        <p className="text-xs text-muted-foreground">
          Monitoramentos preenchidos e ainda não assinados. O inspetor assina de qualquer aparelho, pelo Painel de Bordo. O prazo é de 7 dias a partir da hora em que o
          monitoramento foi realizado. Rascunhos feitos antes desta atualização só aparecem aqui depois que o inspetor abrir o aplicativo, com internet, no aparelho em que os fez.
        </p>
        {rascunhos.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {rascunhos.isError && <p className="text-sm text-destructive">Não foi possível carregar os rascunhos.</p>}
        {!rascunhos.isLoading && !rascunhos.isError && (rascunhos.data ?? []).length === 0 && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Nenhum rascunho pendente de assinatura.
          </p>
        )}
        {(rascunhos.data ?? []).length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft">
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Inspetor</th>
                  <th className="px-4 py-2">Ficha</th>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Realizado em</th>
                  <th className="px-4 py-2">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {(rascunhos.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-hairline" data-testid="rascunho-pendente">
                    <td className="px-4 py-2 font-bold text-ink">{nome(r.user_id)}</td>
                    <td className="px-4 py-2">
                      {r.conteudo.nomeFicha ?? "Ficha"}
                      {r.conteudo.naoConforme && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-bold text-destructive">Não conforme</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{r.setor}</td>
                    <td className="px-4 py-2 text-xs">{formatar(r.hora_monitoramento)}</td>
                    <td className="px-4 py-2">
                      <Prazo horaMonitoramento={r.hora_monitoramento} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Registros gravados sem a assinatura do inspetor ({semAssinatura.data?.length ?? 0})</h3>
        <p className="text-xs text-muted-foreground">
          Monitoramentos que já estão no sistema, mas sem a assinatura eletrônica do inspetor. O sistema não permite assinar um registro depois de gravado: esta lista serve para
          você saber o que ficou sem assinatura e decidir com a qualidade como regularizar.
        </p>
        {semAssinatura.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {semAssinatura.isError && <p className="text-sm text-destructive">Não foi possível carregar os registros.</p>}
        {!semAssinatura.isLoading && !semAssinatura.isError && (semAssinatura.data ?? []).length === 0 && (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Todos os registros têm a assinatura do inspetor.
          </p>
        )}
        {(semAssinatura.data ?? []).length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-surface-soft">
                <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Inspetor</th>
                  <th className="px-4 py-2">Ficha</th>
                  <th className="px-4 py-2">Setor</th>
                  <th className="px-4 py-2">Realizado em</th>
                  <th className="px-4 py-2">Verificado</th>
                </tr>
              </thead>
              <tbody>
                {(semAssinatura.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-hairline" data-testid="registro-sem-assinatura">
                    <td className="px-4 py-2 font-bold text-ink">{nome(r.user_id)}</td>
                    <td className="px-4 py-2">{r.ficha}</td>
                    <td className="px-4 py-2 text-xs">{r.setor}</td>
                    <td className="px-4 py-2 text-xs">{formatar(r.realizado_em)}</td>
                    <td className="px-4 py-2 text-xs">{r.verificado ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
