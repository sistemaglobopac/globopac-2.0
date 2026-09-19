// Renderizadores read-only, para o relatório impresso, dos 7 widgets "Especial SIF"
// (equivalente a ReportDetails.jsx do v1). Diferença deliberada em relação ao v1: aqui NÃO se
// recalcula limiar de conformidade nenhum — cada widget de preenchimento
// (src/modules/fichas/fields/*.tsx) já grava `conformidade`/`status` e `detalhesRNC` prontos
// dentro do próprio valor no momento do apontamento; o relatório só exibe as leituras brutas
// e esse veredito já persistido, nunca reproduz a fórmula (evita duas implementações da mesma
// regra de negócio divergindo entre si).
import type {
  AbsorcaoAguaValor,
  ChillerCarcacasValor,
  ChillerPartesValor,
  DrippingTestValor,
  LavagemFinalValor,
  MiniChillersValor,
  ParadaEquipamentoValor,
  TanqueHidrometro,
} from "@/modules/fichas/fields/tiposCompostos";
import { formatMaskedValue } from "@/modules/fichas/fields/hidrometro";

function SeloConformidade({ conforme }: { conforme: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider print:text-[8px] ${
        conforme ? "bg-success/15 text-success" : "bg-down-soft text-down"
      }`}
    >
      {conforme ? "Conforme" : "Não Conforme"}
    </span>
  );
}

function NotaDesvio({ detalhes }: { detalhes: string | null }) {
  if (!detalhes) return null;
  return (
    <p className="rounded-md border border-down/30 bg-down-soft/60 p-2 text-[10px] font-medium text-down print:text-[8px] print:p-1">
      {detalhes}
    </p>
  );
}

function TabelaTanques({ tanques }: { tanques: Record<string, TanqueHidrometro & { rotulo: string }> }) {
  return (
    <table className="w-full border-collapse text-[10px] print:text-[8px]">
      <thead>
        <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
          <th className="border border-hairline p-1.5 print:p-1">Ponto</th>
          <th className="border border-hairline p-1.5 print:p-1">Hidr. Anterior (m³)</th>
          <th className="border border-hairline p-1.5 print:p-1">Hidr. Atual (m³)</th>
          <th className="border border-hairline p-1.5 print:p-1">Gelo (kg)</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(tanques).map(([chave, t]) => (
          <tr key={chave}>
            <td className="border border-hairline p-1.5 font-bold print:p-1">{t.rotulo}</td>
            <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.prev) || "—"}</td>
            <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.cur) || "—"}</td>
            <td className="border border-hairline p-1.5 font-mono print:p-1">{formatMaskedValue(t.ice) || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cabecalho({ titulo, conforme }: { titulo: string; conforme: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between print:mb-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">{titulo}</span>
      <SeloConformidade conforme={conforme} />
    </div>
  );
}

export function ChillerCarcacasRelatorio({ valor }: { valor: ChillerCarcacasValor }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Renovação da Água — SPR Carcaças" conforme={valor.conformidade} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-4">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Aves bruto</span><br /><strong>{valor.totalAvesBruto.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Condenas</span><br /><strong>{valor.condenasParcial || 0} parcial / {valor.condenasTotal || 0} total</strong></div>
        <div><span className="text-muted-foreground">Peso médio carcaça</span><br /><strong>{valor.pesoMedioCarcaca.toFixed(3)} kg</strong></div>
      </div>
      {valor.cargas.length > 0 && (
        <table className="w-full border-collapse text-[10px] print:text-[8px]">
          <thead>
            <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
              <th className="border border-hairline p-1.5 print:p-1">Lote</th>
              <th className="border border-hairline p-1.5 print:p-1">Aves</th>
              <th className="border border-hairline p-1.5 print:p-1">Peso vivo médio (kg)</th>
            </tr>
          </thead>
          <tbody>
            {valor.cargas.map((c, i) => (
              <tr key={c.id}>
                <td className="border border-hairline p-1.5 print:p-1">Lote {i + 1}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{c.quantity || "—"}</td>
                <td className="border border-hairline p-1.5 font-mono print:p-1">{c.avgLiveWeight || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <TabelaTanques
        tanques={{
          preChiller: { ...valor.tanques.preChiller, rotulo: "Pré-chiller" },
          chiller1: { ...valor.tanques.chiller1, rotulo: "Chiller 01" },
          chiller2: { ...valor.tanques.chiller2, rotulo: "Chiller 02" },
        }}
      />
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export function ChillerPartesRelatorio({ valor }: { valor: ChillerPartesValor }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Renovação da Água — Chiller de Partes" conforme={valor.conformidade} />
      <TabelaTanques
        tanques={{
          chiller1: { ...valor.tanques.chiller1, rotulo: "Chiller 01 Partes" },
          chiller2: { ...valor.tanques.chiller2, rotulo: "Chiller 02 Partes" },
        }}
      />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Condenações</span><br /><strong>{valor.totalCondenacoes.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Peso médio carcaça (herdado)</span><br /><strong>{valor.pesoMedioCarcaca.toFixed(3)} kg</strong></div>
      </div>
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export function LavagemFinalRelatorio({ valor }: { valor: LavagemFinalValor }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Chuveiro de Lavagem Final" conforme={valor.conformidade} />
      <TabelaTanques tanques={{ chuveiro: { ...valor.chuveiro, rotulo: "Chuveiro Final" } }} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Aves bruto (SPR)</span><br /><strong>{valor.totalAvesBruto.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Condenações</span><br /><strong>{valor.condenacoesParciais || 0} parcial / {valor.condenasTotalSPR || 0} total</strong></div>
      </div>
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

const ROTULO_MIUDO: Record<string, string> = { coracao: "Coração", moela: "Moela", figado: "Fígado", cabeca: "Cabeça", pes: "Pés" };

export function MiniChillersRelatorio({ valor }: { valor: MiniChillersValor }) {
  const tanques = Object.fromEntries(
    Object.entries(valor.tanques).map(([chave, t]) => [chave, { ...t, rotulo: ROTULO_MIUDO[chave] ?? chave }])
  );
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Renovação da Água — Mini-Chillers de Miúdos" conforme={valor.conformidade} />
      <TabelaTanques tanques={tanques} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Aves no período</span><br /><strong>{valor.totalAves.toLocaleString("pt-BR")}</strong></div>
        <div><span className="text-muted-foreground">Peso carcaça (herdado)</span><br /><strong>{valor.pesoCarcaca.toFixed(3)} kg</strong></div>
      </div>
      <NotaDesvio detalhes={valor.detalhesRNC} />
    </div>
  );
}

export function AbsorcaoAguaRelatorio({ valor }: { valor: AbsorcaoAguaValor }) {
  const conforme = valor.status === "conforme";
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Teste de Absorção de Água (Especial SIF)" conforme={conforme} />
      <table className="w-full border-collapse text-[10px] print:text-[8px]">
        <thead>
          <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
            <th className="border border-hairline p-1.5 print:p-1">Amostra</th>
            <th className="border border-hairline p-1.5 print:p-1">Lacre</th>
            <th className="border border-hairline p-1.5 print:p-1">Peso inicial (g)</th>
            <th className="border border-hairline p-1.5 print:p-1">Peso final (g)</th>
          </tr>
        </thead>
        <tbody>
          {valor.items.map((a, i) => (
            <tr key={a.id}>
              <td className="border border-hairline p-1.5 print:p-1">{i + 1}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.seal || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.initial || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.final || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-4">
        <div><span className="text-muted-foreground">Amostras válidas</span><br /><strong>{valor.validCount}</strong></div>
        <div><span className="text-muted-foreground">Ganho médio</span><br /><strong>{valor.averagePercentage.toFixed(2)}%</strong></div>
        <div><span className="text-muted-foreground">Soma inicial</span><br /><strong>{valor.sumInitial.toFixed(1)} g</strong></div>
        <div><span className="text-muted-foreground">Soma final</span><br /><strong>{valor.sumFinal.toFixed(1)} g</strong></div>
      </div>
    </div>
  );
}

export function DrippingTestRelatorio({ valor }: { valor: DrippingTestValor }) {
  const conforme = valor.status === "conforme";
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <Cabecalho titulo="Dripping Test — Portaria 210/98 (Especial SIF)" conforme={conforme} />
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Lote</span><br /><strong>{valor.lote || "—"}</strong></div>
        <div><span className="text-muted-foreground">Início</span><br /><strong>{valor.horaInicio || "—"}</strong></div>
      </div>
      <table className="w-full border-collapse text-[10px] print:text-[8px]">
        <thead>
          <tr className="bg-primary/5 text-left uppercase text-muted-foreground">
            <th className="border border-hairline p-1.5 print:p-1">Amostra</th>
            <th className="border border-hairline p-1.5 print:p-1">Lacre</th>
            <th className="border border-hairline p-1.5 print:p-1">M0</th>
            <th className="border border-hairline p-1.5 print:p-1">M1</th>
            <th className="border border-hairline p-1.5 print:p-1">Retirada</th>
            <th className="border border-hairline p-1.5 print:p-1">M2</th>
            <th className="border border-hairline p-1.5 print:p-1">M3</th>
          </tr>
        </thead>
        <tbody>
          {valor.items.map((a, i) => (
            <tr key={a.id} className={a.timeNc ? "bg-down-soft/50" : undefined}>
              <td className="border border-hairline p-1.5 print:p-1">{i + 1}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.seal || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m0 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m1 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.horaRetirada || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m2 || "—"}</td>
              <td className="border border-hairline p-1.5 font-mono print:p-1">{a.m3 || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-2 text-[10px] print:text-[8px] sm:grid-cols-3">
        <div><span className="text-muted-foreground">Amostras válidas</span><br /><strong>{valor.validCount}</strong></div>
        <div><span className="text-muted-foreground">Absorção média</span><br /><strong>{valor.averagePercentage.toFixed(2)}%</strong></div>
        {valor.timeNonConformity && <div className="text-down"><span>⚠ Tempo de drenagem fora do padrão</span></div>}
      </div>
    </div>
  );
}

export function ParadaEquipamentoRelatorio({ valor }: { valor: ParadaEquipamentoValor }) {
  return (
    <div className="col-span-full space-y-2 rounded-lg border border-hairline bg-gray-50 p-3 print:p-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-primary print:text-[9px]">Registro de Parada de Equipamento</span>
      <div className="grid grid-cols-3 gap-2 text-[10px] print:text-[8px]">
        <div><span className="text-muted-foreground">Parada</span><br /><strong>{valor.hora_parada || "—"}</strong></div>
        <div><span className="text-muted-foreground">Retomada</span><br /><strong>{valor.hora_retomada || "—"}</strong></div>
        <div><span className="text-muted-foreground">Tempo inativo</span><br /><strong>{valor.tempo_minutos} min</strong></div>
      </div>
    </div>
  );
}
