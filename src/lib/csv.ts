// Exportação de relatórios em CSV (seção 7.7 do PROMPT MESTRE) — client-side, a partir dos
// mesmos dados já lidos via Supabase (RLS já decidiu o que o usuário pode ver; exportar não
// abre nenhum acesso novo além do que a tela já mostra).

function escaparCampoCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function linhasParaCsv<T extends object>(
  colunas: { chave: keyof T; rotulo: string }[],
  linhas: T[]
): string {
  const cabecalho = colunas.map((c) => escaparCampoCsv(c.rotulo)).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => escaparCampoCsv(linha[c.chave])).join(","));
  return [cabecalho, ...corpo].join("\r\n");
}

export function baixarCsv(nomeArquivo: string, conteudoCsv: string): void {
  // BOM UTF-8 — sem isso, Excel abre acentuação (setor, descrição etc.) corrompida.
  const blob = new Blob(["﻿" + conteudoCsv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
