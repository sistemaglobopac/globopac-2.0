import { useState } from "react";
import {
  Plus,
  Trash2,
  Edit,
  Save,
  ArrowLeft,
  Layers,
  Clock,
  MapPin,
  Copy,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { useSessionStore } from "@/store/session";
import type { CampoTemplate } from "@/shared/schema-campos";
import { useFichasTemplatesAdmin, useSalvarFichaTemplate, useInativarFichaTemplate, type FichaTemplateAdmin } from "./api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Card, CardContent } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";

// Este builder usa "roxo" só nominalmente do spec original — a paleta real do projeto (design
// system GloboPac) não tem acento violeta, então os destaques abaixo usam o token `primary`
// (navy) no lugar, e `warning`/`destructive` para os alertas, mantendo a mesma hierarquia
// visual pedida (bloco de parâmetros destacado, grupo "sem setor" em âmbar, tolerância em
// vermelho).

interface ConstrutorFichasProps {
  setoresDisponiveis: string[];
}

type TipoCampo =
  | "simples"
  | "inteiro"
  | "decimal"
  | "unica_escolha"
  | "hora"
  | "texto"
  | "texto_longo"
  | "foto"
  | "chiller_carcacas"
  | "chiller_partes"
  | "mini_chillers"
  | "lavagem_final"
  | "absorcao_agua"
  | "dripping_test"
  | "parada_equipamento"
  | "assinatura";

const TIPOS_CAMPO: { value: TipoCampo; label: string }[] = [
  { value: "simples", label: "Sim / Não (Conforme/NC)" },
  { value: "inteiro", label: "Número Inteiro" },
  { value: "decimal", label: "Número Decimal" },
  { value: "unica_escolha", label: "Múltipla Escolha (1 Opção)" },
  { value: "hora", label: "Hora (auto-preenchida, editável)" },
  { value: "texto", label: "Texto Curto" },
  { value: "texto_longo", label: "Texto Longo (Área)" },
  { value: "foto", label: "Foto / Anexo" },
  { value: "chiller_carcacas", label: "Monitoramento da Água de Renovação do Pré-resfriamento de Carcaças" },
  { value: "chiller_partes", label: "Monitoramento da Água de Renovação do Chiller Partes" },
  { value: "mini_chillers", label: "Monitoramento da Água de Renovação dos Mini-Chillers de Miúdos" },
  { value: "lavagem_final", label: "Monitoramento da Vazão do Chuveiro Final de Lavagem de Carcaças" },
  { value: "absorcao_agua", label: "Teste de Absorção de Água (Especial SIF)" },
  { value: "dripping_test", label: "Dripping Test - Portaria 210/98 (Especial SIF)" },
  { value: "parada_equipamento", label: "Registro de Parada de Equipamento (Especial SIF)" },
  { value: "assinatura", label: "Assinatura Eletrônica (Fim)" },
];

const PACS = Array.from({ length: 14 }, (_, i) => `PAC ${i + 1}`);

interface CampoForm {
  chave: string;
  tipo: TipoCampo;
  label: string;
  obrigatorio: boolean;
  opcoes: string[];
  valorMinimo: number | null;
  valorMaximo: number | null;
  /** Visibilidade condicional (seção "Especial SIF" do preenchimento): este campo só aparece
   * quando o campo de chave `dependeDeCampo` tiver exatamente `dependeDeValor`. */
  dependeDeCampo: string | null;
  dependeDeValor: string;
}

interface FormularioFicha {
  idAnterior: string | null;
  versaoBase: number;
  codigo: string;
  nome: string;
  pacCorrespondente: string;
  tipoApontamento: "Recorrente" | "Demanda";
  frequencia: "Diário" | "Por Turno";
  tempoEntreApontamentosMin: number | null;
  tempoEdicaoMin: number | null;
  locaisAplicacao: string[];
  campos: CampoForm[];
}

function formularioVazio(): FormularioFicha {
  return {
    idAnterior: null,
    versaoBase: 0,
    codigo: "",
    nome: "",
    pacCorrespondente: "",
    tipoApontamento: "Recorrente",
    frequencia: "Diário",
    tempoEntreApontamentosMin: null,
    tempoEdicaoMin: null,
    locaisAplicacao: [],
    campos: [],
  };
}

/** schema_campos legado ("numero"/"booleano"/"selecao") normalizado para o catálogo novo ao
 * abrir uma ficha existente no builder — a linha antiga em si nunca é alterada (versionamento
 * não-destrutivo), só a próxima versão nasce já no formato atual. */
function tipoNormalizado(tipo: CampoTemplate["tipo"]): TipoCampo {
  if (tipo === "booleano") return "simples";
  if (tipo === "selecao") return "unica_escolha";
  if (tipo === "numero") return "decimal";
  return tipo;
}

function paraCampoForm(campo: CampoTemplate): CampoForm {
  return {
    chave: campo.chave,
    tipo: tipoNormalizado(campo.tipo),
    label: campo.label ?? campo.chave,
    obrigatorio: campo.obrigatorio,
    opcoes: "opcoes" in campo ? campo.opcoes : [],
    valorMinimo: "valorMinimo" in campo ? campo.valorMinimo ?? null : "min" in campo ? campo.min ?? null : null,
    valorMaximo: "valorMaximo" in campo ? campo.valorMaximo ?? null : "max" in campo ? campo.max ?? null : null,
    dependeDeCampo: campo.dependeDe?.campo ?? null,
    dependeDeValor: campo.dependeDe?.valor ?? "",
  };
}

/** Extrai uma mensagem legível de qualquer erro capturado (PostgrestError, erro de rede,
 * exceção genérica) e sempre loga o objeto completo no console — sem isso, um erro do banco
 * (RLS, constraint, etc.) virava só o texto genérico de fallback na tela, sem nenhuma pista de
 * qual foi a causa real. */
function mensagemDeErro(erro: unknown, fallback: string): string {
  console.error(fallback, erro);
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object" && "message" in erro && typeof (erro as { message: unknown }).message === "string") {
    return (erro as { message: string }).message;
  }
  return fallback;
}

function paraCampoTemplate(campo: CampoForm): CampoTemplate {
  const base = {
    chave: campo.chave,
    label: campo.label,
    obrigatorio: campo.obrigatorio,
    dependeDe: campo.dependeDeCampo ? { campo: campo.dependeDeCampo, valor: campo.dependeDeValor } : undefined,
  };
  switch (campo.tipo) {
    case "unica_escolha":
      return { ...base, tipo: "unica_escolha", opcoes: campo.opcoes };
    case "inteiro":
      return { ...base, tipo: "inteiro", valorMinimo: campo.valorMinimo ?? undefined, valorMaximo: campo.valorMaximo ?? undefined };
    case "decimal":
      return { ...base, tipo: "decimal", valorMinimo: campo.valorMinimo ?? undefined, valorMaximo: campo.valorMaximo ?? undefined };
    case "simples":
      return { ...base, tipo: "simples" };
    case "hora":
      return { ...base, tipo: "hora" };
    case "texto":
      return { ...base, tipo: "texto" };
    case "texto_longo":
      return { ...base, tipo: "texto_longo" };
    case "foto":
      return { ...base, tipo: "foto" };
    case "assinatura":
      return { ...base, tipo: "assinatura" };
    case "chiller_carcacas":
      return { ...base, tipo: "chiller_carcacas" };
    case "chiller_partes":
      return { ...base, tipo: "chiller_partes" };
    case "mini_chillers":
      return { ...base, tipo: "mini_chillers" };
    case "lavagem_final":
      return { ...base, tipo: "lavagem_final" };
    case "absorcao_agua":
      return { ...base, tipo: "absorcao_agua" };
    case "dripping_test":
      return { ...base, tipo: "dripping_test" };
    case "parada_equipamento":
      return { ...base, tipo: "parada_equipamento" };
  }
}

export function ConstrutorFichas({ setoresDisponiveis }: ConstrutorFichasProps) {
  const perfil = useSessionStore((s) => s.perfil);
  const { data: fichas, isLoading } = useFichasTemplatesAdmin();
  const salvar = useSalvarFichaTemplate();
  const inativar = useInativarFichaTemplate();

  const [view, setView] = useState<"list" | "form">("list");
  const [expandedSetor, setExpandedSetor] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormularioFicha>(formularioVazio());
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "error"; texto: string } | null>(null);

  function handleCreateNew() {
    setFormData(formularioVazio());
    setMensagem(null);
    setView("form");
  }

  function handleEdit(ficha: FichaTemplateAdmin) {
    setFormData({
      idAnterior: ficha.id,
      versaoBase: ficha.versao,
      codigo: ficha.codigo,
      nome: ficha.nome,
      pacCorrespondente: ficha.pac_correspondente,
      tipoApontamento: ficha.tipo_apontamento,
      frequencia: ficha.frequencia ?? "Diário",
      tempoEntreApontamentosMin: ficha.tempo_entre_apontamentos_min,
      tempoEdicaoMin: ficha.tempo_edicao_min,
      locaisAplicacao: ficha.locais_aplicacao ?? [],
      campos: ficha.schema_campos.map(paraCampoForm),
    });
    setMensagem(null);
    setView("form");
  }

  function handleDuplicate(ficha: FichaTemplateAdmin) {
    setFormData({
      idAnterior: null,
      versaoBase: 0,
      codigo: `${ficha.codigo} (Cópia)`,
      nome: `${ficha.nome} (Cópia)`,
      pacCorrespondente: ficha.pac_correspondente,
      tipoApontamento: ficha.tipo_apontamento,
      frequencia: ficha.frequencia ?? "Diário",
      tempoEntreApontamentosMin: ficha.tempo_entre_apontamentos_min,
      tempoEdicaoMin: ficha.tempo_edicao_min,
      locaisAplicacao: ficha.locais_aplicacao ?? [],
      campos: ficha.schema_campos.map(paraCampoForm),
    });
    setMensagem(null);
    setView("form");
  }

  async function inativarFicha(ficha: FichaTemplateAdmin) {
    if (!window.confirm(`Inativar a ficha "${ficha.nome}" (${ficha.codigo})? Ela deixa de aparecer para os inspetores.`)) return;
    try {
      await inativar.mutateAsync(ficha.id);
      setMensagem({ tipo: "success", texto: "Ficha inativada." });
    } catch (erro) {
      setMensagem({ tipo: "error", texto: mensagemDeErro(erro, "Erro ao inativar a ficha.") });
    }
  }

  function handleToggleSetor(setor: string) {
    setFormData((atual) => ({
      ...atual,
      locaisAplicacao: atual.locaisAplicacao.includes(setor)
        ? atual.locaisAplicacao.filter((s) => s !== setor)
        : [...atual.locaisAplicacao, setor],
    }));
  }

  function handleTogglePac(pac: string) {
    setFormData((atual) => {
      const atuais = atual.pacCorrespondente
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const proximos = atuais.includes(pac) ? atuais.filter((p) => p !== pac) : [...atuais, pac];
      proximos.sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
      return { ...atual, pacCorrespondente: proximos.join(", ") };
    });
  }

  function handleAddCampo() {
    const chave = `campo_${Date.now()}`;
    setFormData((atual) => ({
      ...atual,
      campos: [
        ...atual.campos,
        {
          chave,
          tipo: "simples",
          label: "",
          obrigatorio: true,
          opcoes: [],
          valorMinimo: null,
          valorMaximo: null,
          dependeDeCampo: null,
          dependeDeValor: "",
        },
      ],
    }));
  }

  function handleRemoveCampo(indice: number) {
    setFormData((atual) => ({ ...atual, campos: atual.campos.filter((_, i) => i !== indice) }));
  }

  function handleUpdateCampo(indice: number, atualizacao: Partial<CampoForm>) {
    setFormData((atual) => ({
      ...atual,
      campos: atual.campos.map((c, i) => (i === indice ? { ...c, ...atualizacao } : c)),
    }));
  }

  function handleAddOpcao(indice: number, opcao: string) {
    const valor = opcao.trim();
    if (!valor) return;
    setFormData((atual) => ({
      ...atual,
      campos: atual.campos.map((c, i) => (i === indice ? { ...c, opcoes: [...c.opcoes, valor] } : c)),
    }));
  }

  function handleRemoveOpcao(indice: number, opcaoIndice: number) {
    setFormData((atual) => ({
      ...atual,
      campos: atual.campos.map((c, i) => (i === indice ? { ...c, opcoes: c.opcoes.filter((_, j) => j !== opcaoIndice) } : c)),
    }));
  }

  async function handleSaveFicha() {
    if (!formData.codigo.trim() || !formData.nome.trim()) {
      setMensagem({ tipo: "error", texto: "Preencha o Código e o Nome da ficha." });
      return;
    }
    if (formData.campos.length === 0) {
      setMensagem({ tipo: "error", texto: "Adicione pelo menos um campo na ficha." });
      return;
    }
    if (formData.campos.some((c) => !c.label.trim())) {
      setMensagem({ tipo: "error", texto: "Preencha o rótulo (pergunta) de todos os campos." });
      return;
    }
    const normalizados = formData.campos.map((c) => c.label.trim().toLowerCase());
    const duplicados = Array.from(new Set(normalizados.filter((r, i) => normalizados.indexOf(r) !== i)));
    if (duplicados.length > 0) {
      setMensagem({
        tipo: "error",
        texto:
          `Rótulos duplicados: ${duplicados.join(", ")}. Cada pergunta precisa de um rótulo único — ` +
          "rótulos repetidos confundem o inspetor e o dossiê de auditoria da ficha.",
      });
      return;
    }
    if (!perfil) return;

    try {
      await salvar.mutateAsync({
        idAnterior: formData.idAnterior,
        versaoBase: formData.versaoBase,
        codigo: formData.codigo.trim(),
        nome: formData.nome.trim(),
        pacCorrespondente: formData.pacCorrespondente,
        tipoApontamento: formData.tipoApontamento,
        frequencia: formData.tipoApontamento === "Recorrente" ? formData.frequencia : null,
        tempoEntreApontamentosMin: formData.tempoEntreApontamentosMin,
        tempoEdicaoMin: formData.tempoEdicaoMin,
        locaisAplicacao: formData.locaisAplicacao,
        schemaCampos: formData.campos.map(paraCampoTemplate),
        criadoPor: perfil.id,
      });
      setMensagem({ tipo: "success", texto: "Ficha salva com sucesso." });
      setView("list");
    } catch (erro) {
      setMensagem({ tipo: "error", texto: mensagemDeErro(erro, "Erro ao salvar a ficha.") });
    }
  }

  const mensagemBanner = mensagem && (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
        mensagem.tipo === "success" ? "border-success bg-success/10 text-foreground" : "border-destructive bg-destructive/10 text-destructive"
      }`}
    >
      <span>{mensagem.texto}</span>
      <button type="button" onClick={() => setMensagem(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Fechar mensagem">
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );

  if (view === "form") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setView("list"); setMensagem(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-semibold sm:text-2xl">
              {formData.idAnterior ? `Editar Ficha - v${formData.versaoBase}` : "Criar Nova Ficha"}
            </h1>
          </div>
          <Button onClick={handleSaveFicha} disabled={salvar.isPending}>
            <Save className="h-4 w-4" />
            {salvar.isPending ? "Salvando..." : "Salvar Ficha"}
          </Button>
        </div>

        {mensagemBanner}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase text-primary">
                <IconEngrenagem className="h-4 w-4" />
                Parâmetros Gerais
              </h2>

              <div className="space-y-2">
                <Label htmlFor="codigoFicha">Código da Ficha *</Label>
                <Input
                  id="codigoFicha"
                  placeholder="Ex: FO-11A"
                  value={formData.codigo}
                  onChange={(e) => setFormData((a) => ({ ...a, codigo: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nomeFicha">Nome da Ficha / Título *</Label>
                <Input
                  id="nomeFicha"
                  placeholder="Ex: Planilha de Higiene"
                  value={formData.nome}
                  onChange={(e) => setFormData((a) => ({ ...a, nome: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>PAC Correspondente</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PACS.map((pac) => {
                    const selecionado = formData.pacCorrespondente
                      .split(",")
                      .map((p) => p.trim())
                      .includes(pac);
                    return (
                      <button
                        key={pac}
                        type="button"
                        onClick={() => handleTogglePac(pac)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          selecionado
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-hairline bg-canvas text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {pac}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tipoApontamento">Tipo *</Label>
                  <Select
                    id="tipoApontamento"
                    value={formData.tipoApontamento}
                    onChange={(e) => setFormData((a) => ({ ...a, tipoApontamento: e.target.value as "Recorrente" | "Demanda" }))}
                  >
                    <option value="Recorrente">Recorrente</option>
                    <option value="Demanda">Sob Demanda</option>
                  </Select>
                </div>
                {formData.tipoApontamento === "Recorrente" && (
                  <div className="space-y-2">
                    <Label htmlFor="frequencia">Frequência *</Label>
                    <Select
                      id="frequencia"
                      value={formData.frequencia}
                      onChange={(e) => setFormData((a) => ({ ...a, frequencia: e.target.value as "Diário" | "Por Turno" }))}
                    >
                      <option value="Diário">Diário</option>
                      <option value="Por Turno">Por Turno</option>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tempoEntre" className="flex min-h-8 items-end">
                    Intervalo Mínimo entre Monitoramentos (min)
                  </Label>
                  <Input
                    id="tempoEntre"
                    type="number"
                    min={0}
                    value={formData.tempoEntreApontamentosMin ?? ""}
                    onChange={(e) =>
                      setFormData((a) => ({ ...a, tempoEntreApontamentosMin: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="tempoEdicao"
                    className="flex min-h-8 items-end"
                    title="Tempo permitido para editar um apontamento já salvo desta ficha."
                  >
                    Edição (Min)
                  </Label>
                  <Input
                    id="tempoEdicao"
                    type="number"
                    min={0}
                    value={formData.tempoEdicaoMin ?? ""}
                    onChange={(e) => setFormData((a) => ({ ...a, tempoEdicaoMin: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-primary/10 bg-primary/5 p-4">
              <h3 className="text-sm font-semibold text-primary">Setores Aplicáveis</h3>
              <p className="text-xs text-muted-foreground">Selecione em quais setores esta ficha vai aparecer para o inspetor.</p>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {setoresDisponiveis.map((setor) => (
                  <label key={setor} className="flex cursor-pointer items-center gap-2 rounded-md bg-canvas px-2 py-1.5 text-sm hover:bg-primary/10">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={formData.locaisAplicacao.includes(setor)}
                      onChange={() => handleToggleSetor(setor)}
                    />
                    {setor}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg bg-muted/40 p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Campos da Ficha (Questões)</h2>
              <Button type="button" size="sm" onClick={handleAddCampo}>
                <Plus className="h-4 w-4" />
                Adicionar Campo
              </Button>
            </div>

            {formData.campos.length === 0 && (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Clique em "Adicionar Campo" para começar a montar o formulário.
              </div>
            )}

            <div className="space-y-4">
              {formData.campos.map((campo, indice) => (
                <CampoEditorCard
                  key={campo.chave}
                  numero={indice + 1}
                  campo={campo}
                  onAtualizar={(atualizacao) => handleUpdateCampo(indice, atualizacao)}
                  onRemover={() => handleRemoveCampo(indice)}
                  onAddOpcao={(opcao) => handleAddOpcao(indice, opcao)}
                  onRemoveOpcao={(i) => handleRemoveOpcao(indice, i)}
                  outrosCampos={formData.campos.filter((_, i) => i !== indice)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fichasAtivas = fichas ?? [];
  const grupos = setoresDisponiveis
    .map((setor) => ({ setor, fichas: fichasAtivas.filter((f) => f.locais_aplicacao?.includes(setor)) }))
    .filter((g) => g.fichas.length > 0);
  const semSetor = fichasAtivas.filter((f) => !f.locais_aplicacao || f.locais_aplicacao.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <Layers className="h-6 w-6 shrink-0 text-primary" />
            Construtor de Fichas de Monitoramento
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Selecione um setor abaixo para ver as fichas configuradas para ele.</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="h-4 w-4" />
          Criar Nova Ficha
        </Button>
      </div>

      {mensagemBanner}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando fichas…</p>}

      {!isLoading && fichasAtivas.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma ficha ativa encontrada.</div>
      )}

      <div className="space-y-3">
        {grupos.map((grupo) => (
          <GrupoFichas
            key={grupo.setor}
            titulo={grupo.setor}
            fichas={grupo.fichas}
            aberto={expandedSetor === grupo.setor}
            onToggle={() => setExpandedSetor((atual) => (atual === grupo.setor ? null : grupo.setor))}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onInativar={inativarFicha}
          />
        ))}

        {semSetor.length > 0 && (
          <GrupoFichas
            titulo="Sem Setor Definido"
            fichas={semSetor}
            aberto={expandedSetor === "__sem_setor__"}
            onToggle={() => setExpandedSetor((atual) => (atual === "__sem_setor__" ? null : "__sem_setor__"))}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onInativar={inativarFicha}
            destaqueAmbar
          />
        )}
      </div>
    </div>
  );
}

interface GrupoFichasProps {
  titulo: string;
  fichas: FichaTemplateAdmin[];
  aberto: boolean;
  onToggle: () => void;
  onEdit: (ficha: FichaTemplateAdmin) => void;
  onDuplicate: (ficha: FichaTemplateAdmin) => void;
  onInativar: (ficha: FichaTemplateAdmin) => void;
  destaqueAmbar?: boolean;
}

function GrupoFichas({ titulo, fichas, aberto, onToggle, onEdit, onDuplicate, onInativar, destaqueAmbar }: GrupoFichasProps) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          destaqueAmbar ? "bg-warning/10 hover:bg-warning/20" : "bg-card hover:bg-muted"
        }`}
      >
        <span className="flex items-center gap-2 font-medium">
          <FolderOpen className={`h-5 w-5 ${destaqueAmbar ? "text-warning" : "text-primary"}`} />
          {titulo}
          <Badge variant="secondary">
            {fichas.length} ficha{fichas.length === 1 ? "" : "s"}
          </Badge>
        </span>
        {aberto ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>

      {aberto && (
        <div className="grid gap-4 bg-muted/40 p-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {fichas.map((ficha) => (
            <FichaCard key={ficha.id} ficha={ficha} onEdit={onEdit} onDuplicate={onDuplicate} onInativar={onInativar} />
          ))}
        </div>
      )}
    </div>
  );
}

interface FichaCardProps {
  ficha: FichaTemplateAdmin;
  onEdit: (ficha: FichaTemplateAdmin) => void;
  onDuplicate: (ficha: FichaTemplateAdmin) => void;
  onInativar: (ficha: FichaTemplateAdmin) => void;
}

function FichaCard({ ficha, onEdit, onDuplicate, onInativar }: FichaCardProps) {
  const totalSetores = ficha.locais_aplicacao?.length ?? 0;
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="border-transparent bg-primary/10 text-primary">
            {ficha.codigo}
          </Badge>
          <Badge variant="secondary">v{ficha.versao}</Badge>
        </div>
        <h4 className="font-bold">{ficha.nome}</h4>
        <p className="text-xs text-muted-foreground">{ficha.pac_correspondente || "Sem PAC definido"}</p>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            {ficha.tipo_apontamento}
            {ficha.tipo_apontamento === "Recorrente" && ficha.frequencia ? ` (${ficha.frequencia})` : ""}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {totalSetores} setor{totalSetores === 1 ? "" : "es"}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {ficha.tempo_entre_apontamentos_min != null ? `${ficha.tempo_entre_apontamentos_min} min` : "Sem intervalo definido"}
          </p>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(ficha)}>
              <Edit className="h-3.5 w-3.5" />
              Editar
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => onDuplicate(ficha)}>
              <Copy className="h-3.5 w-3.5" />
              Duplicar
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => onInativar(ficha)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface CampoEditorCardProps {
  numero: number;
  campo: CampoForm;
  onAtualizar: (atualizacao: Partial<CampoForm>) => void;
  onRemover: () => void;
  onAddOpcao: (opcao: string) => void;
  onRemoveOpcao: (indice: number) => void;
  /** Demais campos já adicionados nesta ficha — candidatos para "Depende de" (visibilidade
   * condicional, seção correspondente do preenchimento em NovaFichaPage.tsx). */
  outrosCampos: CampoForm[];
}

function CampoEditorCard({ numero, campo, onAtualizar, onRemover, onAddOpcao, onRemoveOpcao, outrosCampos }: CampoEditorCardProps) {
  const [novaOpcao, setNovaOpcao] = useState("");
  const ehNumerico = campo.tipo === "inteiro" || campo.tipo === "decimal";
  const ehEscolha = campo.tipo === "unica_escolha";
  const campoDoQualDepende = outrosCampos.find((c) => c.chave === campo.dependeDeCampo);

  function adicionarOpcao() {
    onAddOpcao(novaOpcao);
    setNovaOpcao("");
  }

  function trocarTipo(novoTipo: TipoCampo) {
    onAtualizar({
      tipo: novoTipo,
      opcoes: novoTipo === "unica_escolha" ? campo.opcoes : [],
      valorMinimo: novoTipo === "inteiro" || novoTipo === "decimal" ? campo.valorMinimo : null,
      valorMaximo: novoTipo === "inteiro" || novoTipo === "decimal" ? campo.valorMaximo : null,
    });
  }

  return (
    <div className="relative space-y-3 rounded-lg border bg-canvas p-4 shadow-sm">
      <button
        type="button"
        onClick={onRemover}
        className="absolute right-3 top-3 text-destructive opacity-50 transition-opacity hover:opacity-100"
        aria-label="Remover campo"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <p className="text-xs font-semibold uppercase text-muted-foreground">Configuração do Campo {numero}</p>

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-8">
          <Input placeholder="Ex: Temperatura da Água" value={campo.label} onChange={(e) => onAtualizar({ label: e.target.value })} />
        </div>
        <div className="md:col-span-4">
          <Select value={campo.tipo} onChange={(e) => trocarTipo(e.target.value as TipoCampo)}>
            {TIPOS_CAMPO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={campo.obrigatorio} onChange={(e) => onAtualizar({ obrigatorio: e.target.checked })} />
        Campo Obrigatório?
      </label>

      {ehNumerico && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            Janela de Tolerância Crítica
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              type="number"
              step={campo.tipo === "decimal" ? "any" : "1"}
              placeholder="Valor Mínimo Aceitável"
              value={campo.valorMinimo ?? ""}
              onChange={(e) => onAtualizar({ valorMinimo: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <Input
              type="number"
              step={campo.tipo === "decimal" ? "any" : "1"}
              placeholder="Valor Máximo Aceitável"
              value={campo.valorMaximo ?? ""}
              onChange={(e) => onAtualizar({ valorMaximo: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <p className="text-xs text-destructive/80">Fora dessa faixa, o apontamento vira automaticamente um Desvio (RNC).</p>
        </div>
      )}

      {ehEscolha && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Opções de Resposta</p>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Digite uma opção e aperte Enter..."
              value={novaOpcao}
              onChange={(e) => setNovaOpcao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarOpcao();
                }
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={adicionarOpcao}>
              Adicionar
            </Button>
          </div>
          {campo.opcoes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {campo.opcoes.map((opcao, i) => (
                <span key={opcao + i} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                  {opcao}
                  <button type="button" onClick={() => onRemoveOpcao(i)} className="hover:text-destructive" aria-label={`Remover opção ${opcao}`}>
                    <IconX className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-md border bg-muted/40 p-3">
        <p className="text-xs font-semibold text-muted-foreground">Depende de (visibilidade condicional)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={campo.dependeDeCampo ?? ""}
            onChange={(e) => onAtualizar({ dependeDeCampo: e.target.value || null, dependeDeValor: "" })}
          >
            <option value="">Sempre visível</option>
            {outrosCampos
              .filter((c) => c.label.trim())
              .map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.label}
                </option>
              ))}
          </Select>

          {campoDoQualDepende &&
            (campoDoQualDepende.tipo === "unica_escolha" ? (
              <Select value={campo.dependeDeValor} onChange={(e) => onAtualizar({ dependeDeValor: e.target.value })}>
                <option value="">Selecione o valor esperado…</option>
                {campoDoQualDepende.opcoes.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </Select>
            ) : campoDoQualDepende.tipo === "simples" ? (
              <Select value={campo.dependeDeValor} onChange={(e) => onAtualizar({ dependeDeValor: e.target.value })}>
                <option value="">Selecione o valor esperado…</option>
                <option value="Sim">Sim</option>
                <option value="Não">Não</option>
              </Select>
            ) : (
              <Input
                placeholder="Valor esperado"
                value={campo.dependeDeValor}
                onChange={(e) => onAtualizar({ dependeDeValor: e.target.value })}
              />
            ))}
        </div>
        {campoDoQualDepende && (
          <p className="text-xs text-muted-foreground">
            Este campo só aparece para o inspetor quando "{campoDoQualDepende.label}" for "{campo.dependeDeValor || "…"}"
            .
          </p>
        )}
      </div>
    </div>
  );
}

function IconEngrenagem(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      <circle cx="12" cy="12" r="4.5" />
    </svg>
  );
}

function IconX(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
