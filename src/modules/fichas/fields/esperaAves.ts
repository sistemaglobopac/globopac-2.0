// Monitoramento de Bem-Estar Animal na Área de Espera das aves — funções PURAS (sem React): cargas
// por box, comportamento das aves, temperatura ambiente, aspersores/ventiladores e a ação corretiva
// quando há aves ofegantes. Testadas em tests/unit/esperaAves.test.ts.
import type { BoxEsperaAves, EsperaAvesValor } from "./tiposCompostos";

export const COMPORTAMENTOS_AVES: { chave: string; rotulo: string }[] = [
  { chave: "normais", rotulo: "Normais" },
  { chave: "ofegantes", rotulo: "Ofegantes" },
  { chave: "lesionados", rotulo: "Lesionados" },
  { chave: "mortos", rotulo: "Mortos" },
  { chave: "outras", rotulo: "Outras (citar)" },
];

export function boxVazio(): BoxEsperaAves {
  return { box: "", cargaId: "", gta: "", integrado: "", aviario: "", nucleo: "", qtdAves: 0, comportamento: "", outrasCondicoes: "" };
}

export function esperaVazia(): EsperaAvesValor {
  return {
    semVeiculos: false,
    boxes: [boxVazio()],
    temperaturaC: "",
    aspersoresLigados: null,
    ventiladoresLigados: null,
    houveOfegantes: false,
    acaoCorretiva: false,
    acaoCorretivaEm: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** Temperatura digitada ("28,5" ou "28.5") → número; null se vazia/inválida. */
export function lerTemperatura(texto: string | undefined | null): number | null {
  if (texto === undefined || texto === null || texto.trim() === "") return null;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Boxes com aves ofegantes (na ordem digitada). */
export function boxesOfegantes(v: Pick<EsperaAvesValor, "boxes">): BoxEsperaAves[] {
  return v.boxes.filter((b) => b.comportamento === "ofegantes");
}

/** Aspersores E ventiladores precisam estar ligados quando há aves ofegantes. */
export function equipamentosLigados(v: Pick<EsperaAvesValor, "aspersoresLigados" | "ventiladoresLigados">): boolean {
  return v.aspersoresLigados === true && v.ventiladoresLigados === true;
}

/** Ação corretiva pendente: há aves ofegantes e aspersores/ventiladores não estão ambos ligados. */
export function acaoCorretivaPendente(v: EsperaAvesValor): boolean {
  return !v.semVeiculos && boxesOfegantes(v).length > 0 && !equipamentosLigados(v);
}

function nomeBox(b: BoxEsperaAves): string {
  return b.box.trim() ? `Box ${b.box.trim()}` : "Box sem identificação";
}

/** Conformidade automática: aves ofegantes com aspersores/ventiladores desligados. Depois da ação
 * corretiva (ambos ligados) o registro volta a ficar conforme — a ação fica gravada no relatório. */
export function avaliarEspera(v: EsperaAvesValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (acaoCorretivaPendente(v)) {
    const boxes = boxesOfegantes(v).map(nomeBox).join(", ");
    const faltando = [v.aspersoresLigados !== true ? "aspersores" : "", v.ventiladoresLigados !== true ? "ventiladores" : ""].filter(Boolean).join(" e ");
    motivos.push(`Aves ofegantes (${boxes}) com ${faltando} desligados — ação corretiva necessária`);
  }
  return { conformidade: motivos.length === 0, motivos };
}

/** Aplica conformidade e a marcação de ofegantes sobre o valor digitado — é o que o widget emite. A
 * ação corretiva só vale enquanto houver aves ofegantes. */
export function montarValorEspera(v: EsperaAvesValor): EsperaAvesValor {
  // Sem veículos nos boxes não há monitoramento: nada de boxes, ambiente ou ação corretiva no registro.
  if (v.semVeiculos) {
    return { ...esperaVazia(), semVeiculos: true, boxes: [], conformidade: true, detalhesRNC: null };
  }
  const houveOfegantes = boxesOfegantes(v).length > 0;
  const { conformidade, motivos } = avaliarEspera(v);
  return {
    ...v,
    houveOfegantes,
    acaoCorretiva: houveOfegantes && v.acaoCorretiva,
    acaoCorretivaEm: houveOfegantes && v.acaoCorretiva ? v.acaoCorretivaEm : "",
    conformidade,
    detalhesRNC: motivos.length > 0 ? motivos.join("; ") : null,
  };
}

/** Motivos que impedem assinar (com "sem veículos nos boxes" marcado, nada é exigido). */
export function motivosBloqueioEspera(v: EsperaAvesValor | undefined | null): string[] {
  const prefixo = "Área de espera";
  if (!v) return [`${prefixo}: informe as cargas nos boxes e preencha o monitoramento.`];
  if (v.semVeiculos) return [];
  const m: string[] = [];
  const preenchidos = v.boxes.filter((b) => b.box.trim() || b.cargaId);
  if (preenchidos.length === 0) m.push(`${prefixo}: informe ao menos um box com a GTA da carga.`);
  preenchidos.forEach((b, i) => {
    const nome = b.box.trim() ? `Box ${b.box.trim()}` : `Linha ${i + 1}`;
    if (!b.box.trim()) m.push(`${prefixo}: informe o número do box (${nome}).`);
    if (!b.cargaId) m.push(`${prefixo}: selecione a GTA da carga (${nome}).`);
    if (!b.comportamento) m.push(`${prefixo}: informe o comportamento das aves (${nome}).`);
    if (b.comportamento === "outras" && !b.outrasCondicoes.trim()) m.push(`${prefixo}: descreva o comportamento "Outras" (${nome}).`);
  });
  if (lerTemperatura(v.temperaturaC) === null) m.push(`${prefixo}: informe a temperatura ambiente.`);
  if (v.aspersoresLigados === null) m.push(`${prefixo}: informe se os aspersores estão ligados.`);
  if (v.ventiladoresLigados === null) m.push(`${prefixo}: informe se os ventiladores estão ligados.`);
  if (acaoCorretivaPendente(v)) m.push(`${prefixo}: há aves ofegantes — ligue os aspersores e os ventiladores (ação corretiva) antes de assinar.`);
  return m;
}
