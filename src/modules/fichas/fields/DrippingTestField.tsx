import { useEffect, useState } from "react";
import { Droplet, Lock, Save, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  absorcaoLinhaDripping,
  drippingEmFase1,
  validarPrimeiraEtapaDripping,
  acimaDoLimite,
  amostrasDrippingIniciais,
  calcularDrippingTest,
  formatarPercentual,
  LIMITE_DRIPPING,
  tempoMinimoDrenagem,
  textoSeloDripping,
} from "./calculosAbsorcao";
import { ensureLocalTime } from "../utils/tempo";
import { apagarRascunhoDripping, carregarRascunhoDripping, salvarRascunhoDripping } from "./rascunhoDripping";
import type { AmostraDrippingTest, DrippingTestValor } from "./tiposCompostos";

interface DrippingTestFieldProps {
  value: DrippingTestValor | undefined;
  onChange: (valor: DrippingTestValor) => void;
  disabled?: boolean;
  /** Chamado depois de "Salvar 1ª etapa do teste" (o rascunho já foi gravado no dispositivo). */
  aoSalvarPrimeiraEtapa?: () => void;
}

/** Hora local de Manaus (HH:MM) neste instante — a "Hora Início" do teste é registrada sozinha. */
function horaAgora(): string {
  return ensureLocalTime(new Date().toISOString()).time;
}

/** Dripping Test (Portaria 210/1998): 6 carcaças. Média ARITMÉTICA dos percentuais das linhas
 * válidas (limite 6%) + tempo mínimo de drenagem por linha (tabela por M0) — ver
 * calculosAbsorcao.ts. Duas fases: a Fase 1 pode ser salva como rascunho no dispositivo (só do
 * mesmo dia). Precedência ao abrir: valor do pai (edição) > rascunho > vazio. */
export function DrippingTestField({ value, onChange, disabled, aoSalvarPrimeiraEtapa }: DrippingTestFieldProps) {
  const [rascunho] = useState(() => (value ? null : carregarRascunhoDripping()));
  // 2ª etapa: os dados da 1ª etapa (lote, lacre, M0, M1, M3) vieram do rascunho salvo e ficam TRAVADOS —
  // só Retirada e M2 são preenchidos. "Descartar teste" apaga tudo e destrava.
  const [travaPrimeiraEtapa, setTravaPrimeiraEtapa] = useState(() => Boolean(rascunho && rascunho.items.some((i) => i.seal.trim() !== "" || i.m0.trim() !== "")));
  const [items, setItems] = useState<AmostraDrippingTest[]>(value?.items ?? rascunho?.items ?? amostrasDrippingIniciais());
  const [lote, setLote] = useState(value?.lote ?? rascunho?.lote ?? "");
  const [horaInicio, setHoraInicio] = useState(value?.horaInicio ?? rascunho?.horaInicio ?? "");
  const [mensagemRascunho, setMensagemRascunho] = useState(false);
  const [erroPrimeiraEtapa, setErroPrimeiraEtapa] = useState<string | null>(null);
  // Hora inicial oficial = quando a 1ª etapa foi SALVA (vem junto do rascunho ao voltar na 2ª etapa).
  const [primeiraEtapaEm, setPrimeiraEtapaEm] = useState<string | undefined>(value?.primeiraEtapaSalvaEm ?? rascunho?.primeiraEtapaSalvaEm);

  function disparar(novosItems: AmostraDrippingTest[], novoLote: string, novaHora: string, primeiraEtapa: string | undefined = primeiraEtapaEm) {
    const resultado = calcularDrippingTest(novosItems, novaHora);
    setItems(resultado.items);
    onChange({
      items: resultado.items,
      lote: novoLote,
      horaInicio: novaHora,
      ...(primeiraEtapa ? { primeiraEtapaSalvaEm: primeiraEtapa } : {}),
      status: resultado.status,
      averagePercentage: resultado.averagePercentage,
      validCount: resultado.validCount,
      timeNonConformity: resultado.timeNonConformity,
    });
  }

  // Rascunho carregado: o pai recebe o objeto completo já na abertura (senão o campo obrigatório
  // pareceria vazio ao assinar, mesmo com o rascunho na tela).
  useEffect(() => {
    if (rascunho) disparar(rascunho.items, rascunho.lote, rascunho.horaInicio, rascunho.primeiraEtapaSalvaEm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo edição: o estado interno acompanha o valor vindo do pai.
  useEffect(() => {
    if (!value) return;
    if (JSON.stringify(value.items) !== JSON.stringify(items)) setItems(value.items);
    if (value.lote !== lote) setLote(value.lote);
    if (value.horaInicio !== horaInicio) setHoraInicio(value.horaInicio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Não existe campo de hora de início na tela: ela é gravada automaticamente na primeira vez em que o inspetor
   * começa a preencher o teste (e permanece a mesma ao voltar para a Fase 2 pelo rascunho). */
  function horaInicioAutomatica(): string {
    return horaInicio || horaAgora();
  }

  function alterarItem(indice: number, campo: keyof AmostraDrippingTest, valor: string) {
    const hora = horaInicioAutomatica();
    setHoraInicio(hora);
    disparar(
      items.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
      lote,
      hora
    );
  }

  function salvarPrimeiraEtapa() {
    const motivo = validarPrimeiraEtapaDripping(items);
    setErroPrimeiraEtapa(motivo);
    if (motivo) return;
    // A hora inicial do teste passa a ser o instante em que a 1ª etapa é salva (e é ela que vale
    // para o tempo de drenagem).
    const salvoEm = new Date().toISOString();
    const hora = ensureLocalTime(salvoEm).time;
    setHoraInicio(hora);
    setPrimeiraEtapaEm(salvoEm);
    disparar(items, lote, hora, salvoEm);
    salvarRascunhoDripping({ items, lote, horaInicio: hora, primeiraEtapaSalvaEm: salvoEm });
    setMensagemRascunho(true);
    setTimeout(() => setMensagemRascunho(false), 4000);
    aoSalvarPrimeiraEtapa?.();
  }

  const fase1 = drippingEmFase1(items) && !travaPrimeiraEtapa;

  function descartarTeste() {
    if (!window.confirm("Tem certeza que deseja apagar os dados parciais desta ficha?")) return;
    apagarRascunhoDripping();
    const vazio = amostrasDrippingIniciais();
    setLote("");
    setHoraInicio("");
    setPrimeiraEtapaEm(undefined);
    setTravaPrimeiraEtapa(false);
    disparar(vazio, "", "", undefined);
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex flex-col gap-4 border-b bg-primary/5 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-3">
          <div className="rounded-lg bg-primary p-2 text-primary-foreground">
            <Droplet className="h-5 w-5" />
          </div>
          <h4 className="text-sm font-bold">Dripping Test (Portaria 210/1998) — Amostragem: 6 Carcaças. Limite de Absorção: 6,00%</h4>
        </div>
        <div className="flex items-center gap-4 rounded-md border bg-background p-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Lote</Label>
            <Input
              className="h-8 w-32 text-xs"
              value={lote}
              onChange={(e) => {
                const hora = e.target.value ? horaInicioAutomatica() : horaInicio;
                setLote(e.target.value);
                setHoraInicio(hora);
                disparar(items, e.target.value, hora);
              }}
              disabled={disabled || travaPrimeiraEtapa}
              placeholder="Lote do teste"
            />
          </div>
        </div>
      </div>

      {travaPrimeiraEtapa && (
        <p className="flex items-center justify-center gap-2 border-b bg-primary/5 p-2 text-center text-xs text-muted-foreground" data-testid="primeira-etapa-travada">
          <Lock className="h-3.5 w-3.5 text-primary" />
          Dados da 1ª etapa (lote, lacre, M0, M1 e M3) travados — nesta 2ª etapa só a Retirada e o M2 podem ser preenchidos.
        </p>
      )}
      <p className="border-b bg-muted/40 p-2 text-center text-[10px] font-bold uppercase text-muted-foreground">
        Fórmula: (M0 − M1 − M2) / (M0 − M1 − M3) × 100%
      </p>

      <div className="xl:overflow-x-auto">
        <div className="grid gap-3 p-3 sm:p-4 xl:min-w-[900px] xl:gap-2">
          <div className="hidden items-center gap-2 px-2 text-[10px] font-bold uppercase text-muted-foreground xl:flex">
            <span className="w-8 shrink-0 text-center">Nº</span>
            <span className="min-w-[50px] flex-[1.5]">Lacre</span>
            <span className="min-w-[100px] flex-[1.6]" title="Peso Bruto Congelado">
              M0 (g)
            </span>
            <span className="min-w-[90px] flex-[1.4]" title="Embalagem Primária">
              M1 (g)
            </span>
            <span className="min-w-[90px] flex-[1.4]" title="Miúdos">
              M3 (g)
            </span>
            <span className="w-20 shrink-0 rounded bg-amber-100 px-1 text-center text-amber-900">Retirada</span>
            <span className="min-w-[100px] flex-[1.6] rounded bg-amber-100 px-1 text-center text-amber-900" title="Peso Drenado">
              M2 (g)
            </span>
            <span className="w-16 shrink-0 text-right">Absorção</span>
          </div>

          {items.map((item, i) => {
            const absorcao = absorcaoLinhaDripping(item);
            const minimoExigido = tempoMinimoDrenagem(parseFloat(item.m0));
            const acima = absorcao !== null && acimaDoLimite(absorcao, LIMITE_DRIPPING);

            return (
              <div key={item.id} className="flex flex-wrap items-end gap-2 rounded-lg border bg-background p-2 shadow-sm xl:flex-nowrap xl:items-center">
                <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                <label className="flex min-w-[40%] flex-1 flex-col gap-0.5 xl:min-w-[50px] xl:flex-[1.5]"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">Lacre</span><Input className="h-8 text-xs" value={item.seal} onChange={(e) => alterarItem(i, "seal", e.target.value)} disabled={disabled || travaPrimeiraEtapa} placeholder="Lacre" /></label>
                <label className="relative flex min-w-[40%] flex-1 flex-col gap-0.5 xl:min-w-[100px] xl:flex-[1.6]"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">M0 (g)</span><Input className="h-8 font-mono text-xs" type="number" inputMode="decimal" step="0.001" value={item.m0} onChange={(e) => alterarItem(i, "m0", e.target.value)} disabled={disabled || travaPrimeiraEtapa} placeholder="M0" />
                  {minimoExigido !== null && (
                    <span className="pointer-events-none absolute -bottom-3.5 left-0 w-full text-center text-[9px] font-bold text-violet-600">{minimoExigido}min</span>
                  )}
                </label>
                <label className="flex min-w-[40%] flex-1 flex-col gap-0.5 xl:min-w-[90px] xl:flex-[1.4]"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">M1 (g)</span><Input className="h-8 font-mono text-xs" type="number" inputMode="decimal" step="0.001" value={item.m1} onChange={(e) => alterarItem(i, "m1", e.target.value)} disabled={disabled || travaPrimeiraEtapa} placeholder="M1" /></label>
                <label className="flex min-w-[40%] flex-1 flex-col gap-0.5 xl:min-w-[90px] xl:flex-[1.4]"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">M3 (g)</span><Input className="h-8 font-mono text-xs" type="number" inputMode="decimal" step="0.001" value={item.m3} onChange={(e) => alterarItem(i, "m3", e.target.value)} disabled={disabled || travaPrimeiraEtapa} placeholder="M3" /></label>
                <label className="flex min-w-[40%] flex-1 flex-col gap-0.5 xl:w-20 xl:min-w-0 xl:flex-none xl:shrink-0"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">Retirada</span><Input
                  className={`h-8 w-full text-[10px] font-bold ${item.timeNc ? "border-destructive bg-destructive/10 text-destructive" : "border-amber-300 bg-amber-50"}`}
                  type="time"
                  value={item.horaRetirada}
                  onChange={(e) => alterarItem(i, "horaRetirada", e.target.value)}
                  // Ao clicar no campo vazio, registra a hora atual (Manaus); continua editável depois.
                  onFocus={() => {
                    if (!item.horaRetirada) alterarItem(i, "horaRetirada", horaAgora());
                  }}
                  disabled={disabled}
                /></label>
                <label className="flex min-w-[40%] flex-1 flex-col gap-0.5 xl:min-w-[100px] xl:flex-[1.6]"><span className="text-[10px] font-bold uppercase text-muted-foreground xl:hidden">M2 (g)</span><Input
                  className="h-8 border-amber-300 bg-amber-50 font-mono text-xs"
                  type="number" inputMode="decimal"
                  step="0.001"
                  value={item.m2}
                  onChange={(e) => alterarItem(i, "m2", e.target.value)}
                  disabled={disabled}
                  placeholder="M2"
                /></label>
                <span className={`w-full text-right font-mono text-xs font-bold xl:w-16 xl:shrink-0 ${acima ? "text-destructive" : absorcao !== null ? "text-success" : "text-muted-foreground"}`}>
                  {absorcao !== null ? formatarPercentual(absorcao) : "-"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {value && value.validCount > 0 && (
        <div
          className="m-4 rounded-lg border-2 p-4"
          style={{ background: value.status === "nao-conforme" ? "hsl(0 84% 96%)" : "hsl(142 71% 95%)", borderColor: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}
        >
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
                Média Oficial ({value.validCount}/6 válidas)
              </p>
              <p className="font-mono text-3xl font-black" style={{ color: value.status === "nao-conforme" ? "#dc2626" : "#059669" }}>
                {formatarPercentual(value.averagePercentage)}
              </p>
            </div>
            {value.status === "nao-conforme" && (
              <p className="flex animate-pulse items-center gap-2 rounded-full bg-destructive/20 px-3 py-1.5 font-bold text-destructive">
                <ShieldAlert className="h-4 w-4" />
                {textoSeloDripping(value.averagePercentage, value.timeNonConformity)}
              </p>
            )}
          </div>
        </div>
      )}

      {!disabled && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <div className="flex gap-3">
            {/* Fase 1: um único botão. Com Retirada/M2 preenchidos o teste já é a fase 2 (finalizar e assinar). */}
            {fase1 ? (
              <Button type="button" variant="secondary" className="flex-1" onClick={salvarPrimeiraEtapa}>
                <Save className="h-4 w-4" /> Salvar 1ª etapa do teste
              </Button>
            ) : (
              <p className="flex flex-1 items-center rounded-md border border-primary/30 bg-primary/5 px-3 text-xs text-muted-foreground">
                2ª etapa em preenchimento — conclua Retirada e M2 e use "Criar e assinar".
              </p>
            )}
            <Button type="button" variant="outline" className="text-destructive" onClick={descartarTeste} title="Descartar Teste">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          {erroPrimeiraEtapa && <p className="rounded border border-destructive bg-destructive/10 p-2 text-center text-xs font-bold text-destructive">{erroPrimeiraEtapa}</p>}
          {mensagemRascunho && (
            <p className="rounded border border-success bg-success/10 p-2 text-center text-xs font-bold text-success">
              1ª etapa salva no dispositivo! Você pode fechar a tela e retornar depois para preencher a 2ª etapa.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
