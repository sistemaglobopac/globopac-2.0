// Monitoramento de Bem-Estar Animal na Sala de Pendura — funções PURAS (sem React): temperatura,
// ventiladores, luzes, ruídos desnecessários e conduta dos auxiliares de produção na pendura.
// Testadas em tests/unit/penduraAves.test.ts.
import type { PenduraAvesValor } from "./tiposCompostos";
import { lerTemperatura } from "./esperaAves";

export function penduraVazia(): PenduraAvesValor {
  return {
    temperaturaC: "",
    ventiladoresLigados: null,
    luzesAcesas: null,
    ruidosDesnecessarios: null,
    auxiliaresConformes: null,
    descricaoDesvio: "",
    conformidade: true,
    detalhesRNC: null,
  };
}

/** Conformidade automática: ruídos desnecessários ou auxiliares pendurando fora dos princípios de
 * bem-estar animal. Temperatura, ventiladores e luzes são registrados sem reprovar sozinhos. */
export function avaliarPendura(v: PenduraAvesValor): { conformidade: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (v.ruidosDesnecessarios === true) motivos.push("Ruídos desnecessários na sala de pendura");
  if (v.auxiliaresConformes === false) motivos.push("Auxiliares de produção não estão pendurando as aves de acordo com os princípios de bem-estar animal");
  const descricao = v.descricaoDesvio.trim();
  if (motivos.length > 0 && descricao) motivos.push(`Ocorrência/ação: ${descricao}`);
  return { conformidade: !(v.ruidosDesnecessarios === true || v.auxiliaresConformes === false), motivos };
}

/** Aplica a conformidade sobre o valor digitado — é o que o widget emite. A descrição do desvio só
 * é mantida enquanto houver desvio. */
export function montarValorPendura(v: PenduraAvesValor): PenduraAvesValor {
  const { conformidade, motivos } = avaliarPendura(v);
  return {
    ...v,
    descricaoDesvio: conformidade ? "" : v.descricaoDesvio,
    conformidade,
    detalhesRNC: motivos.length > 0 ? motivos.join("; ") : null,
  };
}

/** Motivos que impedem assinar. */
export function motivosBloqueioPendura(v: PenduraAvesValor | undefined | null): string[] {
  const prefixo = "Sala de pendura";
  if (!v) return [`${prefixo}: preencha o monitoramento de bem-estar animal.`];
  const m: string[] = [];
  if (lerTemperatura(v.temperaturaC) === null) m.push(`${prefixo}: informe a temperatura.`);
  if (v.ventiladoresLigados === null) m.push(`${prefixo}: informe se os ventiladores estão ligados.`);
  if (v.luzesAcesas === null) m.push(`${prefixo}: informe se as luzes estão acesas ou apagadas.`);
  if (v.ruidosDesnecessarios === null) m.push(`${prefixo}: informe se há ruídos desnecessários.`);
  if (v.auxiliaresConformes === null) m.push(`${prefixo}: informe se os auxiliares penduram as aves conforme os princípios de bem-estar animal.`);
  const desvio = v.ruidosDesnecessarios === true || v.auxiliaresConformes === false;
  if (desvio && !v.descricaoDesvio.trim()) m.push(`${prefixo}: descreva a ocorrência e a ação corretiva adotada.`);
  return m;
}
