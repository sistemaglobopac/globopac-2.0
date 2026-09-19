// Porte tipado de utils/printHelper.js (v1) — mesma técnica, sem mudança de comportamento.
//
// Por que nova janela em vez de manipular o DOM principal? window.print() captura o estado
// do documento no momento da chamada, mas o contexto de impressão do Chrome/Edge pode
// ignorar mutações feitas logo antes — uma janela nova começa limpa, sem CSS conflitante do
// app.
//
// Por que window.open() não é bloqueado? É chamado SINCRONAMENTE dentro do handler onClick
// — mantém o contexto de gesto do usuário, então o popup blocker do navegador permite.
export function imprimirElemento(elementId: string): void {
  const elemento = document.getElementById(elementId);
  if (!elemento) {
    console.error(`[printHelper] #${elementId} não encontrado.`);
    return;
  }

  const janela = window.open("", "_blank", "width=900,height=700,scrollbars=yes");
  if (!janela) {
    alert("Pop-up bloqueado. Permita pop-ups para este site e tente novamente.");
    return;
  }

  // Coleta todo o CSS já computado no documento pai (Tailwind + index.css injetados como
  // <style> pelo Vite, tanto em dev quanto em produção).
  const todosEstilos = Array.from(document.querySelectorAll("style"))
    .map((s) => s.textContent)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Impressão GloboPac</title>
  <style>${todosEstilos}</style>
  <style>
    @page { size: A4 portrait; margin: 10mm 10mm 10mm 10mm; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    * { overflow: visible !important; }
    .gs-no-print { display: none !important; }
    .print-page {
      max-width: 100% !important;
      width: 100% !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
      page-break-after: always !important;
      break-after: page !important;
    }
  </style>
</head>
<body>${elemento.innerHTML}</body>
</html>`;

  janela.document.open();
  janela.document.write(html);
  janela.document.close();

  janela.addEventListener("load", () => {
    janela.focus();
    janela.print();
    janela.addEventListener("afterprint", () => janela.close());
  });

  // Fallback: caso o evento load não dispare (alguns navegadores com document.write).
  setTimeout(() => {
    try {
      if (!janela.closed) {
        janela.focus();
        janela.print();
      }
    } catch {
      /* janela já fechada pelo usuário — nada a fazer */
    }
  }, 1200);
}
