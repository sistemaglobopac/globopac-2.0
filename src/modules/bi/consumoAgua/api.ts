import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFichasTemplatesTodas } from "@/modules/fichas/api";
import { supabase } from "@/lib/supabase";
import { TIPOS_CAMPO_AGUA, type RegistroAgua, type TemplateAgua } from "./calculo";

/** Folga antes do início do período: a 1ª leitura do período precisa da leitura anterior para saber o intervalo. */
const MARGEM_ANTES_MS = 24 * 3_600_000;
const PAGINA = 1000;
/** Trava de segurança contra um intervalo gigante: 50 mil monitoramentos de água já é muito além do uso real. */
const MAX_PAGINAS = 50;

const SEM_REGISTROS: RegistroAgua[] = [];

export interface DadosConsumoAgua {
  registros: RegistroAgua[];
  templates: Map<string, TemplateAgua>;
}

/** Monitoramentos de água (SPR Carcaças/Partes/Miúdos e Chuveiro Final) com hora entre `deMs` e `ateMs` (exclusivo), de TODAS as
 * versões das fichas que têm esses campos. A RLS de `monitoramentos` já escopa por perfil/setor — o mesmo dado que o usuário
 * veria nas outras telas, só agregado. Agregação no navegador (ASSUMPTIONS.md #33). */
export function useRegistrosAgua(deMs: number, ateMs: number, habilitado = true) {
  const { data: templatesTodos, isLoading: carregandoTemplates, error: erroTemplates } = useFichasTemplatesTodas();

  const templates = useMemo(() => {
    const mapa = new Map<string, TemplateAgua>();
    for (const t of templatesTodos ?? []) {
      if (t.schema_campos.some((c) => (TIPOS_CAMPO_AGUA as string[]).includes(c.tipo))) {
        mapa.set(t.id, { id: t.id, codigo: t.codigo, schema_campos: t.schema_campos.map((c) => ({ chave: c.chave, tipo: c.tipo })) });
      }
    }
    return mapa;
  }, [templatesTodos]);
  const ids = useMemo(() => Array.from(templates.keys()).sort(), [templates]);

  const consulta = useQuery({
    queryKey: ["bi", "consumo-agua", ids.join(","), deMs, ateMs],
    enabled: habilitado && ids.length > 0,
    queryFn: async (): Promise<RegistroAgua[]> => {
      const desde = new Date(deMs - MARGEM_ANTES_MS).toISOString();
      const ate = new Date(ateMs).toISOString();
      const registros: RegistroAgua[] = [];
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
        const { data, error } = await supabase
          .from("monitoramentos")
          .select("id, ficha_template_id, setor, criado_em, hora_monitoramento, aditivo_de, dados_dinamicos")
          .in("ficha_template_id", ids)
          // Hora informada pelo inspetor; registros antigos (sem ela) valem pela hora de criação — igual às demais telas.
          .or(
            `and(hora_monitoramento.gte.${desde},hora_monitoramento.lt.${ate}),` +
              `and(hora_monitoramento.is.null,criado_em.gte.${desde},criado_em.lt.${ate})`
          )
          .order("criado_em", { ascending: true })
          .order("id", { ascending: true })
          .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1)
          .overrideTypes<RegistroAgua[], { merge: false }>();
        if (error) throw error;
        registros.push(...(data ?? []));
        if ((data ?? []).length < PAGINA) break;
      }
      return registros;
    },
  });

  const registros = consulta.data ?? (ids.length === 0 && templatesTodos ? SEM_REGISTROS : undefined);
  const dados = useMemo<DadosConsumoAgua | undefined>(() => (registros ? { registros, templates } : undefined), [registros, templates]);
  return {
    dados,
    carregando: carregandoTemplates || (consulta.isLoading && ids.length > 0),
    erro: (erroTemplates ?? consulta.error) as Error | null,
  };
}
