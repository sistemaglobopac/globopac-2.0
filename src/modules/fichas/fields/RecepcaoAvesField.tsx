import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Truck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { normalizarPlaca, useCargasDoDia, useCargasJaMonitoradas, useCriarVeiculo, useVeiculos, type CargaAves } from "@/modules/recepcao/api";
import { ensureLocalTime } from "../utils/tempo";
import {
  avaliarRecepcao,
  motivosBloqueioRecepcao,
  CONDICOES_ANIMAIS,
  formatarDuracao,
  inconsistenciasDeHorario,
  LIMITE_JEJUM_MAX_H,
  montarValorRecepcao,
  recepcaoVazia,
  tempos,
} from "./recepcaoAves";
import type { RecepcaoAvesValor } from "./tiposCompostos";

interface RecepcaoAvesFieldProps {
  value: RecepcaoAvesValor | undefined | null;
  onChange: (valor: RecepcaoAvesValor) => void;
  disabled?: boolean;
}

type CampoHorario = "retiradaRacaoEm" | "embarqueInicioEm" | "embarqueFimEm" | "chegadaEm" | "penduraInicioEm";

const HORARIOS: { chave: CampoHorario; rotulo: string }[] = [
  { chave: "retiradaRacaoEm", rotulo: "Retirada da alimentação no aviário" },
  { chave: "embarqueInicioEm", rotulo: "Início do embarque" },
  { chave: "embarqueFimEm", rotulo: "Término do embarque" },
  { chave: "chegadaEm", rotulo: "Chegada ao abatedouro" },
  { chave: "penduraInicioEm", rotulo: "Início da pendura" },
];

/** Data e hora de agora em Manaus, no formato do input datetime-local. */
function agoraLocal(): string {
  const { isoLocal, time } = ensureLocalTime(new Date().toISOString());
  return `${isoLocal}T${time}`;
}

function rotuloCarga(c: CargaAves): string {
  return `GTA ${c.gta} — ${c.integrado} · Aviário ${c.aviario}${c.nucleo ? ` · Núcleo ${c.nucleo}` : ""} · ${c.qtd_aves.toLocaleString("pt-BR")} aves`;
}

/** Monitoramento de Recepção de Aves / Bem-Estar Animal: o inspetor escolhe a GTA da carga (cadastrada
 * pelo Administrador/Verificador) e o veículo (por placa), confere o veículo, registra os horários
 * da carga e as condições dos animais na chegada. Jejum, dieta hídrica, viagem e espera são
 * calculados sozinhos. */
export function RecepcaoAvesField({ value, onChange, disabled }: RecepcaoAvesFieldProps) {
  const [v, setV] = useState<RecepcaoAvesValor>({ ...recepcaoVazia(), ...(value ?? {}) });
  const [dataProgramacao, setDataProgramacao] = useState(() => ensureLocalTime(new Date().toISOString()).isoLocal);
  const [novaPlaca, setNovaPlaca] = useState("");
  const [erroPlaca, setErroPlaca] = useState<string | null>(null);

  const { data: cargasDoDia } = useCargasDoDia(dataProgramacao);
  const { data: jaMonitoradas } = useCargasJaMonitoradas("recepcao");
  // A carga já monitorada sai da lista; a selecionada nesta ficha (edição/rascunho) permanece.
  const cargas = (cargasDoDia ?? []).filter((c) => c.id === v.cargaId || !jaMonitoradas?.has(c.id));
  const { data: veiculos } = useVeiculos();
  const criarVeiculo = useCriarVeiculo();

  const valor = montarValorRecepcao(v);
  const t = tempos(v);
  const aval = avaliarRecepcao(v);
  // Sem os dados da carga preenchidos o monitoramento ainda não é "conforme": mostra "aguardando" (igual aos demais).
  const completo = motivosBloqueioRecepcao(v).length === 0;
  const inconsistencias = inconsistenciasDeHorario(v);
  const jejumAcima = t.jejumMin !== null && t.jejumMin > LIMITE_JEJUM_MAX_H * 60;

  useEffect(() => {
    onChange(valor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  function atualizar(parcial: Partial<RecepcaoAvesValor>) {
    setV((atual) => ({ ...atual, ...parcial }));
  }

  function escolherCarga(id: string) {
    const c = (cargas ?? []).find((x) => x.id === id);
    if (!c) {
      atualizar({ cargaId: "", gta: "", integrado: "", aviario: "", nucleo: "", qtdAves: 0 });
      return;
    }
    atualizar({ cargaId: c.id, gta: c.gta, integrado: c.integrado, aviario: c.aviario, nucleo: c.nucleo, qtdAves: c.qtd_aves });
  }

  function escolherVeiculo(id: string) {
    const ve = (veiculos ?? []).find((x) => x.id === id);
    atualizar({ veiculoId: ve?.id ?? "", placa: ve?.placa ?? "" });
  }

  async function cadastrarPlaca() {
    setErroPlaca(null);
    try {
      const criado = await criarVeiculo.mutateAsync({ placa: novaPlaca });
      atualizar({ veiculoId: criado.id, placa: criado.placa });
      setNovaPlaca("");
    } catch (e) {
      setErroPlaca(e instanceof Error ? e.message : "Falha ao cadastrar a placa.");
    }
  }

  // Carga já escolhida em outra data (edição/rascunho): mantém o resumo mesmo fora da lista do dia.
  const cargaSelecionadaNaLista = (cargas ?? []).some((c) => c.id === v.cargaId);

  return (
    <div className="space-y-5 rounded-lg border p-4" data-testid="recepcao-aves">
      <div className={`flex items-center gap-2 rounded-md p-3 text-sm font-black ${!aval.conformidade ? "bg-destructive/10 text-destructive" : completo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
        {aval.conformidade ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
        {!aval.conformidade ? "NÃO CONFORME" : completo ? "CONFORME" : "AGUARDANDO PREENCHIMENTO"}
        {!aval.conformidade && <span className="ml-2 font-normal">{aval.motivos.join("; ")}</span>}
      </div>

      {/* 1. Carga (GTA) */}
      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">1. Carga</legend>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor="recepcao-data">Data da programação</Label>
            <Input id="recepcao-data" type="date" value={dataProgramacao} onChange={(e) => setDataProgramacao(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="recepcao-gta">GTA da carga</Label>
            <Select id="recepcao-gta" value={v.cargaId} onChange={(e) => escolherCarga(e.target.value)}>
              <option value="">Selecione a GTA…</option>
              {v.cargaId && !cargaSelecionadaNaLista && <option value={v.cargaId}>{`GTA ${v.gta} — ${v.integrado}`}</option>}
              {(cargas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {rotuloCarga(c)}
                </option>
              ))}
            </Select>
            {(cargasDoDia ?? []).length > 0 && cargas.length === 0 && (
              <p className="text-xs text-muted-foreground">Todas as cargas desta data já foram monitoradas.</p>
            )}
            {(cargasDoDia ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma carga programada para esta data. Peça ao Administrador/Verificador para cadastrar a GTA.</p>
            )}
          </div>
        </div>
        {v.cargaId && (
          <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-5" data-testid="resumo-carga">
            <div><dt className="text-xs text-muted-foreground">Integrado</dt><dd className="font-semibold">{v.integrado}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Aviário</dt><dd className="font-semibold">{v.aviario}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Núcleo</dt><dd className="font-semibold">{v.nucleo || "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">GTA</dt><dd className="font-semibold">{v.gta}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Aves</dt><dd className="font-semibold">{v.qtdAves.toLocaleString("pt-BR")}</dd></div>
          </dl>
        )}
      </fieldset>

      {/* 2. Veículo */}
      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Truck className="h-3.5 w-3.5" /> 2. Veículo
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="recepcao-veiculo">Placa do veículo</Label>
            <Select id="recepcao-veiculo" value={v.veiculoId} onChange={(e) => escolherVeiculo(e.target.value)}>
              <option value="">Selecione a placa…</option>
              {(veiculos ?? []).map((ve) => (
                <option key={ve.id} value={ve.id}>
                  {ve.placa}
                  {ve.descricao ? ` — ${ve.descricao}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="recepcao-nova-placa">Placa não está na lista?</Label>
            <div className="flex gap-2">
              <Input id="recepcao-nova-placa" value={novaPlaca} maxLength={8} placeholder="ABC1D23" onChange={(e) => setNovaPlaca(normalizarPlaca(e.target.value))} />
              <Button type="button" variant="outline" disabled={novaPlaca.length < 7 || criarVeiculo.isPending} onClick={() => void cadastrarPlaca()}>
                Cadastrar
              </Button>
            </div>
            {erroPlaca && <p className="text-xs text-destructive">{erroPlaca}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Condições estruturais do veículo aptas para o transporte de aves vivas</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Condições estruturais do veículo">
            {(
              [
                ["CONFORME", "Conforme"],
                ["NAO_CONFORME", "Não conforme"],
              ] as const
            ).map(([chave, rotulo]) => (
              <label
                key={chave}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold ${
                  v.condicaoVeiculo === chave ? (chave === "CONFORME" ? "border-success bg-success/10 text-success" : "border-destructive bg-destructive/10 text-destructive") : ""
                }`}
              >
                <input type="radio" name="condicao-veiculo" checked={v.condicaoVeiculo === chave} onChange={() => atualizar({ condicaoVeiculo: chave })} />
                {rotulo}
              </label>
            ))}
          </div>
          {v.condicaoVeiculo === "NAO_CONFORME" && (
            <Input aria-label="Descrição da não conformidade do veículo" placeholder="Descreva o problema estrutural do veículo (obrigatório)" value={v.obsVeiculo} onChange={(e) => atualizar({ obsVeiculo: e.target.value })} />
          )}
        </div>
      </fieldset>

      {/* 3. Horários */}
      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="flex items-center gap-1 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> 3. Datas e horários da carga (horário de Manaus)
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {HORARIOS.map((h) => (
            <div key={h.chave} className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`recepcao-${h.chave}`}>{h.rotulo}</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => atualizar({ [h.chave]: agoraLocal() })}>
                  Agora
                </Button>
              </div>
              <Input id={`recepcao-${h.chave}`} type="datetime-local" className="w-full" value={v[h.chave]} onChange={(e) => atualizar({ [h.chave]: e.target.value })} />
            </div>
          ))}
        </div>
        {inconsistencias.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive" data-testid="erros-horario">
            {inconsistencias.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2" data-testid="tempos-calculados">
          <Calculado titulo="Jejum alimentar" detalhe="retirada da ração → início da pendura" valor={formatarDuracao(t.jejumMin)} alerta={jejumAcima} alertaTexto={`acima de ${LIMITE_JEJUM_MAX_H} h`} />
          <Calculado titulo="Dieta hídrica" detalhe="início do embarque → início da pendura" valor={formatarDuracao(t.dietaHidricaMin)} />
          <Calculado titulo="Tempo total de viagem" detalhe="término do embarque → chegada" valor={formatarDuracao(t.viagemMin)} />
          <Calculado titulo="Espera antes do abate" detalhe="chegada → início da pendura" valor={formatarDuracao(t.esperaMin)} />
        </div>
      </fieldset>

      {/* 4. Animais */}
      <fieldset className="space-y-3" disabled={disabled}>
        <legend className="text-xs font-black uppercase tracking-wider text-muted-foreground">4. Condição dos animais na chegada (carga como um todo)</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Condição dos animais na chegada">
          {CONDICOES_ANIMAIS.map((c) => (
            <label
              key={c.chave}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold ${
                v.condicaoAnimais === c.chave ? (c.chave === "normais" ? "border-success bg-success/10 text-success" : "border-warning bg-warning/10") : ""
              }`}
            >
              <input type="radio" name="condicao-animais" checked={v.condicaoAnimais === c.chave} onChange={() => atualizar({ condicaoAnimais: c.chave })} />
              {c.rotulo}
            </label>
          ))}
        </div>
        {v.condicaoAnimais === "outras" && (
          <Input aria-label="Descrição de outras condições" placeholder="Qual condição? (obrigatório)" value={v.outrasCondicoes} onChange={(e) => atualizar({ outrasCondicoes: e.target.value })} />
        )}
      </fieldset>
    </div>
  );
}

function Calculado({ titulo, detalhe, valor, alerta, alertaTexto }: { titulo: string; detalhe: string; valor: string; alerta?: boolean; alertaTexto?: string }) {
  return (
    <div className={`rounded-md border p-3 ${alerta ? "border-destructive bg-destructive/5" : "bg-muted/40"}`}>
      <p className="text-xs font-bold uppercase text-muted-foreground">{titulo}</p>
      <p className={`text-lg font-black ${alerta ? "text-destructive" : ""}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground">{alerta ? alertaTexto : detalhe}</p>
    </div>
  );
}
