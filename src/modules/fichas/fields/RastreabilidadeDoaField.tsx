import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useCargasRastreabilidade, useDoaCargasRegistradas } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import { formatarDataHora } from "./recepcaoAves";
import { doaVazio, formatarPctDoa, lerContagem, montarCargas, montarValorDoa, motivosBloqueioDoa, type CargaHerdadaDoa, type EntradaDoa } from "./rastreabilidadeDoa";
import type { RastreabilidadeDoaValor } from "./tiposCompostos";

interface RastreabilidadeDoaFieldProps {
  value: RastreabilidadeDoaValor | undefined | null;
  onChange: (valor: RastreabilidadeDoaValor) => void;
  disabled?: boolean;
}

/** Rastreabilidade e Controle de DOA: lista as cargas do dia na ordem em que começaram a ser
 * penduradas, com GTA, veículo, início do abate e aves previstas HERDADOS da programação e da
 * recepção de aves. O inspetor informa só as aves que de fato vieram e as mortas; o % de DOA sai
 * calculado e, se o saldo da GTA divergir, aparece a nota de documento de correção de saldo. */
export function RastreabilidadeDoaField({ value, onChange, disabled }: RastreabilidadeDoaFieldProps) {
  const inicial = useRef({ ...doaVazio(ensureLocalTime(new Date().toISOString()).isoLocal), ...(value ?? {}) });
  const [dataAbate, setDataAbate] = useState(inicial.current.dataAbate);
  const [entradas, setEntradas] = useState<Record<string, EntradaDoa>>(() =>
    Object.fromEntries(inicial.current.cargas.map((c) => [c.cargaId, { avesRecebidas: c.avesRecebidas, avesMortas: c.avesMortas }]))
  );
  const { data: rpc, isLoading, isError } = useCargasRastreabilidade(dataAbate);
  const { data: registradas } = useDoaCargasRegistradas(dataAbate);

  // Cargas já gravadas em monitoramentos anteriores do dia entram no relatório como estão (somente
  // leitura); as desta própria ficha (edição) continuam editáveis.
  const anteriores = useMemo(() => {
    const proprias = new Set(dataAbate === inicial.current.dataAbate ? inicial.current.cargas.map((c) => c.cargaId) : []);
    return new Map((registradas ?? []).filter((c) => !proprias.has(c.cargaId)).map((c) => [c.cargaId, c]));
  }, [registradas, dataAbate]);

  const herdadas = useMemo<CargaHerdadaDoa[]>(
    () =>
      (rpc ?? []).map((c) => ({
        cargaId: c.carga_id,
        gta: c.gta,
        integrado: c.integrado,
        aviario: c.aviario,
        nucleo: c.nucleo,
        qtdPrevista: c.qtd_aves,
        placa: c.placa ?? "",
        penduraInicioEm: c.pendura_inicio_em ?? "",
      })),
    [rpc]
  );

  const valor = useMemo(() => {
    // Enquanto a consulta não volta (ou offline), mantém as linhas já salvas em vez de zerar.
    const salvas = [...(dataAbate === inicial.current.dataAbate ? inicial.current.cargas : []), ...anteriores.values()];
    const efetivas: Record<string, EntradaDoa> = { ...entradas };
    for (const c of anteriores.values()) efetivas[c.cargaId] = { avesRecebidas: c.avesRecebidas, avesMortas: c.avesMortas };
    return montarValorDoa(dataAbate, montarCargas(rpc ? herdadas : [], efetivas, salvas));
  }, [rpc, herdadas, entradas, dataAbate, anteriores]);

  const faltas = motivosBloqueioDoa(valor);
  const completo = faltas.length === 0;
  const notas = valor.cargas.filter((c) => c.notaSaldo);

  useEffect(() => {
    onChange(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  function digitar(id: string, parcial: Partial<EntradaDoa>) {
    setEntradas((atual) => ({ ...atual, [id]: { avesRecebidas: "", avesMortas: "", ...atual[id], ...parcial } }));
  }

  const apenasDigitos = (t: string) => t.replace(/\D/g, "");

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="rastreabilidade-doa">
      <div className={`flex flex-wrap items-center gap-2 rounded-md p-3 text-sm font-black ${completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {completo ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        {completo ? "PREENCHIDO" : "AGUARDANDO PREENCHIMENTO"}
        <span className="ml-auto font-black text-foreground">DOA do dia: {formatarPctDoa(valor.doaTotalPct)}</span>
      </div>

      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">Rastreabilidade e controle de DOA por carga</legend>
        <div className="space-y-1 sm:w-48">
          <Label htmlFor="doa-data">Data do abate</Label>
          <Input id="doa-data" type="date" value={dataAbate} onChange={(e) => e.target.value && setDataAbate(e.target.value)} />
        </div>

        {isLoading && <p className="text-xs text-muted-foreground">Carregando as cargas do dia…</p>}
        {isError && <p className="text-xs text-destructive">Não foi possível carregar as cargas do dia (sem conexão?).</p>}
        {!isLoading && !isError && valor.cargas.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma carga com a pendura iniciada nesta data. As cargas entram aqui assim que a recepção de aves registra o início da pendura.
          </p>
        )}

        {valor.cargas.map((c) => (
          <div key={c.cargaId} className="space-y-3 rounded-md border p-3" data-testid={`carga-doa-${c.gta}`}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">{c.ordemPendura ? `${c.ordemPendura}ª a pendurar` : "Sem pendura"}</span>
              <strong>GTA {c.gta}</strong>
              <span className="text-muted-foreground">
                {c.integrado} · Aviário {c.aviario}
                {c.nucleo ? ` · Núcleo ${c.nucleo}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div><span className="text-muted-foreground">Início do abate (pendura)</span><br /><strong>{formatarDataHora(c.penduraInicioEm)}</strong></div>
              <div><span className="text-muted-foreground">Veículo</span><br /><strong>{c.placa || "—"}</strong></div>
              <div><span className="text-muted-foreground">Aves previstas na GTA</span><br /><strong>{c.qtdPrevista.toLocaleString("pt-BR")}</strong></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`doa-recebidas-${c.gta}`}>Aves que vieram na carga</Label>
                <Input id={`doa-recebidas-${c.gta}`} inputMode="numeric" disabled={anteriores.has(c.cargaId)} placeholder={String(c.qtdPrevista)} value={c.avesRecebidas} onChange={(e) => digitar(c.cargaId, { avesRecebidas: apenasDigitos(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`doa-mortas-${c.gta}`}>Aves mortas (DOA)</Label>
                <Input id={`doa-mortas-${c.gta}`} inputMode="numeric" disabled={anteriores.has(c.cargaId)} placeholder="0" value={c.avesMortas} onChange={(e) => digitar(c.cargaId, { avesMortas: apenasDigitos(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label>% de DOA</Label>
                <div className="flex h-10 items-center rounded-md border px-3 text-sm font-black" data-testid={`doa-pct-${c.gta}`}>
                  {formatarPctDoa(c.doaPct)}
                </div>
              </div>
            </div>
            {lerContagem(c.avesMortas) !== null && lerContagem(c.avesRecebidas) !== null && lerContagem(c.avesMortas)! > lerContagem(c.avesRecebidas)! && (
              <p className="text-xs font-semibold text-destructive" role="alert">As aves mortas não podem ser mais que as aves que vieram na carga.</p>
            )}
            {c.notaSaldo && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-semibold" role="alert" data-testid={`nota-saldo-${c.gta}`}>
                <FileWarning className="mt-0.5 h-4 w-4 shrink-0" /> {c.notaSaldo}
              </p>
            )}
          </div>
        ))}

        {notas.length > 0 && <p className="text-xs text-muted-foreground">{notas.length} carga(s) com divergência de saldo — emitir o documento de correção antes do fechamento do dia.</p>}
      </fieldset>
    </div>
  );
}
