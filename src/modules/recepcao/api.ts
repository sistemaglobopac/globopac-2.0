import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CargaDoa } from "@/modules/fichas/fields/tiposCompostos";

export interface CargaAves {
  id: string;
  data_abate: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  gta: string;
  qtd_aves: number;
}

export interface VeiculoTransporte {
  id: string;
  placa: string;
  descricao: string | null;
}

export type NovaCargaAves = Omit<CargaAves, "id">;

const COLUNAS_CARGA = "id, data_abate, integrado, aviario, nucleo, gta, qtd_aves";

/** GTA para comparação: maiúsculas, sem espaços nem pontuação ("gta 001", "GTA-001" e "GTA001" são a mesma). Espelha
 * normalizar_gta() do banco, que garante a unicidade por data de abate. Zeros à esquerda continuam valendo. */
export function normalizarGta(gta: string): string {
  return gta.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** GTAs que aparecem mais de uma vez, NA MESMA DATA de abate, no lote a cadastrar (como digitadas). A mesma GTA em datas
 * diferentes é permitida. */
export function gtasRepetidasNoLote(cargas: { gta: string; data_abate: string }[]): string[] {
  const vistas = new Set<string>();
  const repetidas = new Set<string>();
  for (const c of cargas) {
    const chave = `${c.data_abate}|${normalizarGta(c.gta)}`;
    if (vistas.has(chave)) repetidas.add(c.gta.trim());
    else vistas.add(chave);
  }
  return [...repetidas];
}

export interface GtaCadastrada {
  data_abate: string;
  integrado: string;
  aviario: string;
}

export function mensagemGtaJaCadastrada(gta: string, existente: GtaCadastrada | null): string {
  const onde = existente ? ` (${existente.integrado}, aviário ${existente.aviario})` : "";
  const data = existente ? ` para o abate de ${existente.data_abate.split("-").reverse().join("/")}` : " para esta data de abate";
  return `A GTA ${gta.trim()} já está cadastrada${data}${onde}. O número da GTA não pode se repetir na mesma data.`;
}

/** Carga já cadastrada com essa GTA NA MESMA DATA de abate, ou null. Falha de consulta devolve null: quem decide é a restrição do banco. */
export async function buscarGtaCadastrada(gta: string, dataAbate: string): Promise<GtaCadastrada | null> {
  if (!normalizarGta(gta) || !dataAbate) return null;
  const { data, error } = await supabase.rpc("gta_ja_cadastrada", { p_gta: gta, p_data: dataAbate });
  if (error) return null;
  return ((data ?? []) as unknown as GtaCadastrada[])[0] ?? null;
}

/** Placa em maiúsculas, sem espaços (ABC1D23 / ABC-1234). */
export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/** Cargas programadas para um dia (YYYY-MM-DD), na ordem de cadastro. */
export function useCargasDoDia(dataAbate: string | undefined) {
  return useQuery({
    queryKey: ["cargas-aves", dataAbate],
    meta: { offline: true },
    enabled: !!dataAbate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas_aves")
        .select(COLUNAS_CARGA)
        .eq("data_abate", dataAbate!)
        .order("criado_em")
        .overrideTypes<CargaAves[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export interface CargaRastreabilidade {
  carga_id: string;
  gta: string;
  integrado: string;
  aviario: string;
  nucleo: string;
  qtd_aves: number;
  placa: string | null;
  pendura_inicio_em: string | null;
  monitoramento_id: string | null;
  peso_medio_kg: string | null;
}

/** Cargas do dia com veículo e início da pendura herdados da recepção de aves, já em ordem de
 * pendura (função SECURITY DEFINER: o inspetor do DOA não enxerga o setor da recepção). */
export function useCargasRastreabilidade(dataAbate: string | undefined) {
  return useQuery({
    queryKey: ["cargas-rastreabilidade", dataAbate],
    meta: { offline: true },
    enabled: !!dataAbate,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cargas_rastreabilidade_do_dia", { p_dia: dataAbate });
      if (error) throw error;
      return (data ?? []) as unknown as CargaRastreabilidade[];
    },
  });
}

/** Ids das cargas que já tiveram o monitoramento feito naquele tipo — saem da lista de seleção. */
export function useCargasJaMonitoradas(tipo: "recepcao" | "espera" | "peso" | "spr") {
  return useQuery({
    queryKey: ["cargas-ja-monitoradas", tipo],
    meta: { offline: true },
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cargas_ja_monitoradas", { p_tipo: tipo });
      if (error) throw error;
      return new Set(((data ?? []) as unknown as { carga_id: string }[]).map((r) => r.carga_id));
    },
  });
}

/** Linhas de DOA já gravadas (monitoramentos anteriores do dia), uma por carga, para somar ao relatório. */
export function useDoaCargasRegistradas(dataAbate: string | undefined) {
  return useQuery({
    queryKey: ["doa-cargas-registradas", dataAbate],
    meta: { offline: true },
    enabled: !!dataAbate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("doa_cargas_ja_registradas", { p_dia: dataAbate });
      if (error) throw error;
      return ((data ?? []) as unknown as { carga: CargaDoa }[]).map((r) => r.carga);
    },
  });
}

export function useCriarCargas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cargas: NovaCargaAves[]) => {
      const repetidas = gtasRepetidasNoLote(cargas);
      if (repetidas.length > 0) throw new Error(`GTA repetida no cadastro: ${repetidas.join(", ")}. O número da GTA não pode se repetir na mesma data de abate.`);
      // Verifica antes para dizer ONDE a GTA já está; a restrição do banco continua sendo a garantia final.
      for (const c of cargas) {
        const existente = await buscarGtaCadastrada(c.gta, c.data_abate);
        if (existente) throw new Error(mensagemGtaJaCadastrada(c.gta, existente));
      }
      const { error } = await supabase.from("cargas_aves").insert(cargas);
      if (error) {
        if (error.code === "23505") throw new Error("Essa GTA já está cadastrada para esta data de abate. O número da GTA não pode se repetir na mesma data.");
        if (error.code === "23514") throw new Error("Informe um número de GTA válido (com letras ou números).");
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas-aves"] }),
  });
}

export function useExcluirCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cargas_aves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas-aves"] }),
  });
}

export function useVeiculos() {
  return useQuery({
    queryKey: ["veiculos-transporte"],
    meta: { offline: true },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("veiculos_transporte")
        .select("id, placa, descricao")
        .eq("ativo", true)
        .order("placa")
        .overrideTypes<VeiculoTransporte[], { merge: false }>();
      if (error) throw error;
      return data;
    },
  });
}

export function useCriarVeiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { placa: string; descricao?: string }) => {
      const placa = normalizarPlaca(v.placa);
      if (placa.length < 7) throw new Error("Informe a placa completa (ex.: ABC1D23).");
      const { data, error } = await supabase
        .from("veiculos_transporte")
        .insert({ placa, descricao: v.descricao?.trim() || null })
        .select("id, placa, descricao")
        .single()
        .overrideTypes<VeiculoTransporte, { merge: false }>();
      if (error) {
        if (error.code === "23505") throw new Error(`A placa ${placa} já está cadastrada.`);
        throw error;
      }
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["veiculos-transporte"] }),
  });
}

export function useExcluirVeiculo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Inativa em vez de apagar: monitoramentos antigos guardam o id do veículo.
      const { error } = await supabase.from("veiculos_transporte").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["veiculos-transporte"] }),
  });
}
