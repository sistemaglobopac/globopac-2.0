// Reconciliação dos rascunhos do aparelho (IndexedDB) com a cópia na nuvem (rascunhos_monitoramento). Função PURA: decide o que
// enviar, o que baixar e o que apagar; quem executa é rascunhosNuvem.ts. Testada em tests/unit/rascunhosSync.test.ts.
//
// Regras:
//  • o rascunho que virou monitoramento (assinado em qualquer aparelho) sai do aparelho e é marcado como assinado na nuvem;
//  • o que o inspetor descartou ou assinou em outro aparelho (marca na nuvem) sai deste aparelho — nunca ressuscita;
//  • o que só existe aqui é enviado; o que só existe na nuvem (feito em outro aparelho) é baixado;
//  • nos dois lados, vale o mais recente;
//  • rascunho que está sendo assinado agora (status "assinando") não é tocado.

export interface RascunhoLocalMin {
  id: string;
  salvoEm: string;
  status: "rascunho" | "assinando" | "falhou";
}

export interface RascunhoNuvemMin {
  id: string;
  status: "pendente" | "assinado" | "descartado";
  salvoEm: string;
}

export interface PlanoSincronizacao {
  /** Ids locais a enviar (inserir ou atualizar) na nuvem. */
  enviar: string[];
  /** Ids da nuvem a trazer para este aparelho (inserir ou substituir o local). */
  baixar: string[];
  /** Ids a apagar deste aparelho. */
  apagarLocal: string[];
  /** Ids ainda pendentes na nuvem que já viraram monitoramento: marcar como assinados. */
  marcarAssinadoNaNuvem: string[];
}

const t = (iso: string) => {
  const n = new Date(iso).getTime();
  return Number.isFinite(n) ? n : 0;
};

export function planejarSincronizacao(locais: RascunhoLocalMin[], nuvem: RascunhoNuvemMin[], idsComMonitoramento: ReadonlySet<string>): PlanoSincronizacao {
  const plano: PlanoSincronizacao = { enviar: [], baixar: [], apagarLocal: [], marcarAssinadoNaNuvem: [] };
  const naNuvem = new Map(nuvem.map((c) => [c.id, c]));
  const locaisPorId = new Set(locais.map((l) => l.id));

  for (const l of locais) {
    if (l.status === "assinando") continue;
    const c = naNuvem.get(l.id);
    if (c && c.status !== "pendente") {
      plano.apagarLocal.push(l.id); // assinado ou descartado em outro lugar
    } else if (idsComMonitoramento.has(l.id)) {
      plano.apagarLocal.push(l.id); // já virou monitoramento
      if (c) plano.marcarAssinadoNaNuvem.push(l.id);
    } else if (!c) {
      plano.enviar.push(l.id);
    } else if (t(l.salvoEm) > t(c.salvoEm)) {
      plano.enviar.push(l.id);
    } else if (t(c.salvoEm) > t(l.salvoEm)) {
      plano.baixar.push(l.id);
    }
  }

  for (const c of nuvem) {
    if (c.status !== "pendente" || locaisPorId.has(c.id)) continue;
    if (idsComMonitoramento.has(c.id)) plano.marcarAssinadoNaNuvem.push(c.id);
    else plano.baixar.push(c.id);
  }
  return plano;
}
