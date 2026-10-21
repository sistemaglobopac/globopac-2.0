import type { ItemImportacao } from "./tipos";

export interface ResultadoLeituraCsv {
  itens: ItemImportacao[];
  erros: string[];
}

export const CABECALHO_MODELO_CSV = "numero_os;anomalia;setor;acao_corretiva;responsavel;data_abertura;prazo_programado;reprogramacoes";

export const LINHA_EXEMPLO_CSV =
  "463597;Porta da sangria não está fechando corretamente;Sangria;Regular porta;Katiuscia;02/09/2026;22/09/2026;20/10/2026";

/** Converte DD/MM/AAAA (ou AAAA-MM-DD) em AAAA-MM-DD; null se não for uma data real. */
export function dataParaIso(texto: string): string | null {
  const t = texto.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let a: string;
  let m: string;
  let d: string;
  if (br) {
    d = br[1]!;
    m = br[2]!;
    a = br[3]!;
  } else if (iso) {
    a = iso[1]!;
    m = iso[2]!;
    d = iso[3]!;
  } else return null;
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(a) || dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Divide o texto em linhas de campos respeitando aspas (campos com delimitador ou quebra de linha). */
function dividirCsv(texto: string, delimitador: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let emAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (emAspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') emAspas = false;
      else campo += c;
    } else if (c === '"') emAspas = true;
    else if (c === delimitador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      campo = "";
      if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
  return linhas;
}

/** Lê o CSV de OS já programadas (formato do relatório manual). `reprogramacoes` aceita várias
 * datas separadas por "|" — na ordem Rep. I, Rep. II... O prazo vigente é o último. */
export function lerCsvOrdens(texto: string): ResultadoLeituraCsv {
  const limpo = texto.replace(/^\uFEFF/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const delimitador = primeira.split(";").length >= primeira.split(",").length ? ";" : ",";
  const linhas = dividirCsv(limpo, delimitador);
  if (linhas.length < 2) return { itens: [], erros: ["O arquivo não tem linhas de dados."] };

  const cab = linhas[0]!.map((c) => c.trim().toLowerCase());
  const col = (nome: string) => cab.indexOf(nome);
  const obrigatorias = ["numero_os", "anomalia", "setor", "prazo_programado"];
  const faltando = obrigatorias.filter((n) => col(n) < 0);
  if (faltando.length) return { itens: [], erros: [`Colunas obrigatórias ausentes: ${faltando.join(", ")}.`] };

  const itens: ItemImportacao[] = [];
  const erros: string[] = [];
  const vistos = new Set<string>();
  linhas.slice(1).forEach((campos, idx) => {
    const n = idx + 2;
    const v = (nome: string) => (col(nome) >= 0 ? (campos[col(nome)] ?? "").trim() : "");
    const numero = v("numero_os");
    const anomalia = v("anomalia");
    const setor = v("setor");
    if (!numero || !anomalia || !setor) {
      erros.push(`Linha ${n}: número da OS, anomalia e setor são obrigatórios.`);
      return;
    }
    if (vistos.has(numero)) {
      erros.push(`Linha ${n}: OS ${numero} repetida no arquivo.`);
      return;
    }
    const prog = dataParaIso(v("prazo_programado"));
    if (!prog) {
      erros.push(`Linha ${n} (OS ${numero}): prazo programado inválido "${v("prazo_programado")}".`);
      return;
    }
    const reps = v("reprogramacoes") ? v("reprogramacoes").split("|").map((x) => x.trim()).filter(Boolean) : [];
    const repsIso = reps.map(dataParaIso);
    if (repsIso.some((r) => r === null)) {
      erros.push(`Linha ${n} (OS ${numero}): data de reprogramação inválida em "${v("reprogramacoes")}".`);
      return;
    }
    const abertaTxt = v("data_abertura");
    const aberta = abertaTxt ? dataParaIso(abertaTxt) : null;
    if (abertaTxt && !aberta) {
      erros.push(`Linha ${n} (OS ${numero}): data de abertura inválida "${abertaTxt}".`);
      return;
    }
    vistos.add(numero);
    itens.push({
      numero_os: numero,
      descricao: anomalia,
      setor_area: setor,
      acao_corretiva: v("acao_corretiva") || null,
      responsavel: v("responsavel") || null,
      aberta_em: aberta,
      prazos: [prog, ...(repsIso as string[])],
    });
  });
  return { itens, erros };
}
