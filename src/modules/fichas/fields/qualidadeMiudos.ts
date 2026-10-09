// Monitoramento de Qualidade de Miúdos e Pertences (cabeça, pés, moela, fígado e coração) — funções
// PURAS (sem React). Para cada parte o inspetor informa quantas unidades avaliou (amostra) e, para
// cada defeito, quantas apresentaram o defeito; o sistema calcula o percentual e compara com o máximo
// tolerado do defeito (0% = qualquer ocorrência é não conformidade). Antes, o inspetor informa se a parte
// existe no setor — se não, ela não é monitorada. Testadas em
// tests/unit/qualidadeMiudos.test.ts.
import type { ChaveParteMiudo, QualidadeMiudosValor } from "./tiposCompostos";

export interface DefeitoMiudo {
  chave: string;
  rotulo: string;
  /** Percentual máximo tolerado da amostra. */
  maximoPct: number;
}

export interface ParteMiudo {
  chave: ChaveParteMiudo;
  rotulo: string;
  defeitos: DefeitoMiudo[];
}

export const PARTES_MIUDOS: ParteMiudo[] = [
  {
    chave: "cabeca",
    rotulo: "Cabeça",
    defeitos: [
      { chave: "pena", rotulo: "Pena", maximoPct: 3 },
      { chave: "excessoEscalda", rotulo: "Excesso de escalda", maximoPct: 3 },
    ],
  },
  {
    chave: "pes",
    rotulo: "Pés",
    defeitos: [
      { chave: "fraturaExposta", rotulo: "Fratura exposta", maximoPct: 3 },
      { chave: "corteIrregular", rotulo: "Corte irregular", maximoPct: 15 },
      { chave: "cuticula", rotulo: "Cutícula", maximoPct: 2 },
      { chave: "excessoEscalda", rotulo: "Excesso de escalda", maximoPct: 0 },
    ],
  },
  {
    chave: "moela",
    rotulo: "Moela",
    defeitos: [
      { chave: "ingesta", rotulo: "Ingesta", maximoPct: 0 },
      { chave: "proVentriculo", rotulo: "Pró-ventrículo", maximoPct: 1 },
      { chave: "lesoes", rotulo: "Lesões", maximoPct: 0 },
    ],
  },
  {
    chave: "figado",
    rotulo: "Fígado",
    defeitos: [
      { chave: "coloracaoPalida", rotulo: "Coloração pálida", maximoPct: 1 },
      { chave: "corpoEstranho", rotulo: "Corpo estranho", maximoPct: 1 },
      { chave: "pulmao", rotulo: "Pulmão", maximoPct: 3 },
    ],
  },
  {
    chave: "coracao",
    rotulo: "Coração",
    defeitos: [
      { chave: "baco", rotulo: "Baço", maximoPct: 3 },
      { chave: "pulmao", rotulo: "Pulmão", maximoPct: 3 },
      { chave: "ausenciaPartes", rotulo: "Ausência de partes", maximoPct: 3 },
    ],
  },
];

export function qualidadeMiudosVazio(): QualidadeMiudosValor {
  return {
    partes: Object.fromEntries(
      PARTES_MIUDOS.map((p) => [p.chave, { existe: "", amostra: "", defeitos: Object.fromEntries(p.defeitos.map((d) => [d.chave, ""])) }])
    ) as QualidadeMiudosValor["partes"],
    observacao: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** A parte existe no setor? `true`/`false` conforme a resposta; sem resposta → null (ficha antiga com
 * amostra preenchida conta como "existe"). Parte que não existe não é monitorada. */
export function parteExiste(reg: QualidadeMiudosValor["partes"][ChaveParteMiudo] | undefined): boolean | null {
  if (reg?.existe === "sim") return true;
  if (reg?.existe === "nao") return false;
  return (reg?.amostra ?? "").trim() !== "" ? true : null;
}

/** "12" → 12; vazio/inválido (decimal, negativo, texto) → null. */
export function lerContagem(texto: string | undefined | null): number | null {
  const t = (texto ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** Percentual dos defeituosos na amostra; sem amostra válida → null. */
export function percentualDefeito(defeitos: number | null, amostra: number | null): number | null {
  if (defeitos === null || amostra === null || amostra <= 0) return null;
  return (defeitos / amostra) * 100;
}

/** Acima do máximo tolerado (comparação em inteiros, sem erro de ponto flutuante). Com máximo 0%,
 * qualquer ocorrência reprova. */
export function defeitoAcimaDoMaximo(defeitos: number | null, amostra: number | null, maximoPct: number): boolean {
  if (defeitos === null || amostra === null || amostra <= 0) return false;
  return defeitos * 100 > maximoPct * amostra;
}

export function formatarPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const fmtMax = (n: number) => `${n.toLocaleString("pt-BR")}%`;

/** Defeitos acima do máximo tolerado, por parte (para o selo, a RNC e o relatório). */
export function avaliarQualidadeMiudos(v: QualidadeMiudosValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  for (const p of PARTES_MIUDOS) {
    const reg = v.partes?.[p.chave];
    if (parteExiste(reg) === false) continue;
    const amostra = lerContagem(reg?.amostra);
    for (const d of p.defeitos) {
      const defeitos = lerContagem(reg?.defeitos?.[d.chave]);
      if (defeitoAcimaDoMaximo(defeitos, amostra, d.maximoPct)) {
        motivos.push(`${p.rotulo} — ${d.rotulo}: ${formatarPct(percentualDefeito(defeitos, amostra))} (máx. ${fmtMax(d.maximoPct)})`);
      }
    }
  }
  return { conformidade: motivos.length === 0, motivos };
}

export function montarValorQualidadeMiudos(v: QualidadeMiudosValor): QualidadeMiudosValor {
  const { conformidade, motivos } = avaliarQualidadeMiudos(v);
  return { ...v, conformidade, detalhesRNC: motivos.length ? `Qualidade de miúdos fora do limite — ${motivos.join("; ")}` : null };
}

/** Cada parte precisa dizer se há o produto no setor; havendo, precisa de amostra (1 ou mais) e de todas
 * as contagens (0 é válido), sem passar da amostra. Sem o produto no setor, nada mais é exigido. */
export function motivosBloqueioQualidadeMiudos(v: QualidadeMiudosValor | undefined | null): string[] {
  const t = "Qualidade de miúdos";
  if (!v?.partes) return [`${t}: informe se há cada parte no setor e, havendo, a amostra e os defeitos.`];
  const m: string[] = [];
  for (const p of PARTES_MIUDOS) {
    const reg = v.partes[p.chave];
    const existe = parteExiste(reg);
    if (existe === null) {
      m.push(`${t}: informe se há ${p.rotulo.toLowerCase()} no setor.`);
      continue;
    }
    if (!existe) continue;
    const amostra = lerContagem(reg?.amostra);
    if (amostra === null || amostra <= 0) {
      m.push(`${t}: informe a quantidade avaliada de ${p.rotulo.toLowerCase()}.`);
      continue;
    }
    for (const d of p.defeitos) {
      const defeitos = lerContagem(reg?.defeitos?.[d.chave]);
      if (defeitos === null) m.push(`${t}: informe "${d.rotulo}" (${p.rotulo}); se não houve, digite 0.`);
      else if (defeitos > amostra) m.push(`${t}: "${d.rotulo}" (${p.rotulo}) não pode passar da quantidade avaliada (${amostra}).`);
    }
  }
  return m;
}
