// Monitoramento de Recepção de Aves / Bem-Estar Animal — funções PURAS (sem React): tempos de
// jejum, dieta hídrica, viagem e espera, conformidade e bloqueios de assinatura. Testadas em
// tests/unit/recepcaoAves.test.ts.
import type { RecepcaoAvesValor } from "./tiposCompostos";

/** Jejum total máximo (retirada da ração no aviário → início da pendura) antes de virar desvio. */
export const LIMITE_JEJUM_MAX_H = 12;

export const CONDICOES_ANIMAIS: { chave: string; rotulo: string }[] = [
  { chave: "normais", rotulo: "Normais" },
  { chave: "lesionados", rotulo: "Lesionados" },
  { chave: "ofegantes", rotulo: "Ofegantes" },
  { chave: "mortos", rotulo: "Mortos" },
  { chave: "outras", rotulo: "Outras (citar)" },
];

export function recepcaoVazia(): RecepcaoAvesValor {
  return {
    cargaId: "",
    gta: "",
    integrado: "",
    aviario: "",
    nucleo: "",
    qtdAves: 0,
    veiculoId: "",
    placa: "",
    condicaoVeiculo: "",
    obsVeiculo: "",
    retiradaRacaoEm: "",
    embarqueInicioEm: "",
    embarqueFimEm: "",
    chegadaEm: "",
    penduraInicioEm: "",
    condicaoAnimais: "",
    outrasCondicoes: "",
    jejumMin: null,
    dietaHidricaMin: null,
    viagemMin: null,
    esperaMin: null,
    conformidade: true,
    detalhesRNC: null,
  };
}

const PADRAO_DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Minutos de `inicio` até `fim` (ambos `YYYY-MM-DDTHH:mm` no mesmo fuso). null se faltar um deles;
 * negativo se a ordem estiver invertida. */
export function minutosEntre(inicio: string | undefined, fim: string | undefined): number | null {
  if (!inicio || !fim || !PADRAO_DATA_HORA.test(inicio) || !PADRAO_DATA_HORA.test(fim)) return null;
  return Math.round((Date.parse(`${fim}:00Z`) - Date.parse(`${inicio}:00Z`)) / 60000);
}

/** "5 h 30 min" / "45 min" / "—" */
export function formatarDuracao(min: number | null | undefined): string {
  if (min === null || min === undefined || Number.isNaN(min)) return "—";
  const total = Math.abs(Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const texto = h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
  return min < 0 ? `-${texto}` : texto;
}

/** "30/09/2026 14:05" a partir de `YYYY-MM-DDTHH:mm`. */
export function formatarDataHora(valor: string | undefined): string {
  if (!valor || !PADRAO_DATA_HORA.test(valor)) return "—";
  const [data, hora] = valor.split("T");
  const [a, m, d] = data!.split("-");
  return `${d}/${m}/${a} ${hora}`;
}

type Horarios = Pick<RecepcaoAvesValor, "retiradaRacaoEm" | "embarqueInicioEm" | "embarqueFimEm" | "chegadaEm" | "penduraInicioEm">;

export function tempos(v: Horarios) {
  return {
    /** Jejum alimentar: retirada da ração → início da pendura. */
    jejumMin: minutosEntre(v.retiradaRacaoEm, v.penduraInicioEm),
    /** Dieta hídrica: início do embarque → início da pendura. */
    dietaHidricaMin: minutosEntre(v.embarqueInicioEm, v.penduraInicioEm),
    /** Tempo total de viagem: término do embarque → chegada ao abatedouro. */
    viagemMin: minutosEntre(v.embarqueFimEm, v.chegadaEm),
    /** Tempo de espera antes do abate: chegada → início da pendura. */
    esperaMin: minutosEntre(v.chegadaEm, v.penduraInicioEm),
  };
}

/** Etapas em ordem cronológica esperada, com o nome usado nas mensagens. */
function etapas(v: Horarios): [string, string][] {
  return [
    ["retirada da ração", v.retiradaRacaoEm],
    ["início do embarque", v.embarqueInicioEm],
    ["término do embarque", v.embarqueFimEm],
    ["chegada ao abatedouro", v.chegadaEm],
    ["início da pendura", v.penduraInicioEm],
  ];
}

/** Sequência esperada: retirada da ração ≤ início do embarque ≤ fim do embarque ≤ chegada ≤ início
 * da pendura. Devolve as inversões (só entre etapas consecutivas já preenchidas). */
export function inconsistenciasDeHorario(v: Horarios): string[] {
  const lista = etapas(v);
  const erros: string[] = [];
  for (let i = 1; i < lista.length; i += 1) {
    const dif = minutosEntre(lista[i - 1]![1], lista[i]![1]);
    if (dif !== null && dif < 0) erros.push(`Horário incoerente: "${lista[i]![0]}" está antes de "${lista[i - 1]![0]}".`);
  }
  return erros;
}

/** Conformidade automática: veículo não conforme ou jejum acima do limite. Condições dos animais
 * (lesionadas, mortas…) são registradas para o relatório, sem reprovar sozinhas. */
export function avaliarRecepcao(v: RecepcaoAvesValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (v.condicaoVeiculo === "NAO_CONFORME") {
    const placa = v.placa ? ` ${v.placa}` : "";
    const obs = v.obsVeiculo.trim() ? ` (${v.obsVeiculo.trim()})` : "";
    motivos.push(`Veículo${placa} sem condições estruturais para o transporte de aves vivas${obs}`);
  }
  const { jejumMin } = tempos(v);
  if (jejumMin !== null && jejumMin > LIMITE_JEJUM_MAX_H * 60) {
    motivos.push(`Jejum alimentar de ${formatarDuracao(jejumMin)} acima do limite de ${LIMITE_JEJUM_MAX_H} h`);
  }
  return { conformidade: motivos.length === 0, motivos };
}

/** Aplica tempos e conformidade sobre o valor digitado — é o que o widget emite. */
export function montarValorRecepcao(v: RecepcaoAvesValor): RecepcaoAvesValor {
  const { conformidade, motivos } = avaliarRecepcao(v);
  return { ...v, ...tempos(v), conformidade, detalhesRNC: motivos.length > 0 ? motivos.join("; ") : null };
}

/** Motivos que impedem assinar (campos obrigatórios e horários incoerentes). */
export function motivosBloqueioRecepcao(v: RecepcaoAvesValor | undefined | null): string[] {
  if (!v) return ["Recepção de aves: selecione a GTA da carga e preencha o monitoramento."];
  const m: string[] = [];
  if (!v.cargaId) m.push("Recepção de aves: selecione a GTA da carga.");
  if (!v.veiculoId) m.push("Recepção de aves: selecione o veículo (placa).");
  if (!v.condicaoVeiculo) m.push("Recepção de aves: informe as condições estruturais do veículo (conforme / não conforme).");
  if (v.condicaoVeiculo === "NAO_CONFORME" && !v.obsVeiculo.trim()) m.push("Recepção de aves: descreva a não conformidade do veículo.");
  const faltantes = etapas(v)
    .filter(([, valor]) => !valor)
    .map(([nome]) => nome);
  if (faltantes.length > 0) m.push(`Recepção de aves: informe data e hora de: ${faltantes.join(", ")}.`);
  m.push(...inconsistenciasDeHorario(v).map((e) => `Recepção de aves: ${e}`));
  if (!v.condicaoAnimais) m.push("Recepção de aves: informe a condição dos animais na chegada.");
  if (v.condicaoAnimais === "outras" && !v.outrasCondicoes.trim()) m.push('Recepção de aves: descreva a condição "Outras" dos animais.');
  return m;
}
