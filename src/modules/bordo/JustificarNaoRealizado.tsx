import { useState, type FormEvent } from "react";
import { ClipboardX, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import {
  erroDaJustificativa,
  horarioLocalManaus,
  instanteDoHorarioLocal,
  justificativasVigentes,
  MOTIVO_OUTRO,
  MOTIVOS_NAO_REALIZADO,
  type JustificativaHorario,
} from "@/modules/fichas/utils/justificativaHorario";
import { setorDaFicha, useRegistrarMonitoramentoNaoRealizado, type FichaAtivaResumo } from "./api";

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

interface ModalJustificarNaoRealizadoProps {
  /** Fichas que aceitam a justificativa (PAC 11) e que o inspetor atende. */
  fichas: FichaAtivaResumo[];
  userSetores: string[];
  /** Ficha e horário já escolhidos (ex.: a partir do card de monitoramento em atraso). */
  fichaInicialId?: string;
  horarioInicial?: Date;
  onFechar: () => void;
  onRegistrado?: () => void;
}

/** Justificativa de monitoramento NÃO REALIZADO: o inspetor escolhe a ficha e o horário (também de horas que já passaram no turno)
 * e diz por que o monitoramento não foi feito. Fica registrada, aparece no relatório da ficha e, se for do horário em atraso,
 * dispensa o alarme daquele período. */
export function ModalJustificarNaoRealizado({ fichas, userSetores, fichaInicialId, horarioInicial, onFechar, onRegistrado }: ModalJustificarNaoRealizadoProps) {
  const registrar = useRegistrarMonitoramentoNaoRealizado();
  const [fichaId, setFichaId] = useState(fichaInicialId ?? (fichas.length === 1 ? fichas[0]!.id : ""));
  const [horario, setHorario] = useState(() => horarioLocalManaus(horarioInicial ?? new Date()));
  const [motivo, setMotivo] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const ficha = fichas.find((f) => f.id === fichaId);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!ficha) {
      setErro("Escolha a ficha do monitoramento que não foi realizado.");
      return;
    }
    const problema = erroDaJustificativa({ horario, motivo, detalhes }, new Date());
    if (problema) {
      setErro(problema);
      return;
    }
    try {
      await registrar.mutateAsync({
        fichaCodigo: ficha.codigo,
        setor: setorDaFicha(ficha, userSetores) || null,
        horario: instanteDoHorarioLocal(horario)!,
        motivo,
        detalhes: detalhes.trim() || null,
      });
      onRegistrado?.();
      onFechar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Falha ao registrar a justificativa.");
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4" data-testid="modal-justificar-nao-realizado">
      <div role="dialog" aria-modal="true" aria-label="Justificar monitoramento não realizado" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
          <span className="flex items-center gap-2 font-semibold">
            <ClipboardX className="h-5 w-5" /> Monitoramento não realizado
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={confirmar} noValidate className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Registre por que o monitoramento de um horário não foi realizado. A justificativa fica gravada, aparece no relatório da ficha e, se for do horário em atraso, o alarme
            só volta um período depois.
          </p>

          <div className="space-y-2">
            <Label htmlFor="justificar-ficha">Ficha</Label>
            <Select id="justificar-ficha" value={fichaId} onChange={(e) => setFichaId(e.target.value)}>
              <option value="">Selecione…</option>
              {fichas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.codigo} — {f.nome}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificar-horario">Horário em que o monitoramento deveria ter sido feito</Label>
            <Input id="justificar-horario" type="datetime-local" value={horario} max={horarioLocalManaus(new Date())} onChange={(e) => setHorario(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificar-motivo">Por que não foi realizado?</Label>
            <Select id="justificar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Selecione…</option>
              {MOTIVOS_NAO_REALIZADO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificar-detalhes">{motivo === MOTIVO_OUTRO ? "Descreva o motivo" : "Detalhes (opcional)"}</Label>
            <Textarea id="justificar-detalhes" rows={3} value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
          </div>

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={registrar.isPending}>
              {registrar.isPending ? "Registrando…" : "Registrar justificativa"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface JustificativasDoTurnoProps {
  fichas: FichaAtivaResumo[];
  justificativas: readonly JustificativaHorario[];
  nomesUsuarios?: Map<string, string>;
  bloqueado?: boolean;
  onJustificar: () => void;
}

/** Cartão do Painel de Bordo: botão para justificar um monitoramento não realizado e as justificativas das últimas 24 h. Só aparece
 * quando o inspetor atende alguma ficha que aceita a justificativa (PAC 11). */
export function JustificativasDoTurno({ fichas, justificativas, nomesUsuarios, bloqueado, onJustificar }: JustificativasDoTurnoProps) {
  if (fichas.length === 0) return null;
  const codigos = new Set(fichas.map((f) => f.codigo));
  const nomePorCodigo = new Map(fichas.map((f) => [f.codigo, f.nome]));
  const lista = justificativasVigentes(justificativas.filter((j) => codigos.has(j.ficha_codigo)));

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" data-testid="secao-justificativas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider">Monitoramentos não realizados</h2>
          <p className="text-xs text-muted-foreground">Absorção de água pelas carcaças: justifique o horário em que o monitoramento não foi feito.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={bloqueado} onClick={onJustificar} data-testid="justificar-nao-realizado">
          <ClipboardX className="h-4 w-4" /> Justificar horário não realizado
        </Button>
      </div>
      {lista.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="lista-justificativas">
          {lista.map((j) => (
            <li key={`${j.ficha_codigo}|${j.setor ?? ""}|${j.horario_devido}`} className="rounded-md border p-2">
              <span className="font-medium">{quando(j.horario_devido)}</span> · {nomePorCodigo.get(j.ficha_codigo) ?? j.ficha_codigo} · <strong>{j.motivo}</strong>
              {j.detalhes ? <span className="text-muted-foreground"> — {j.detalhes}</span> : null}
              <span className="block text-xs text-muted-foreground">Registrado por {nomesUsuarios?.get(j.registrado_por) ?? "inspetor"} às {quando(j.registrado_em)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
