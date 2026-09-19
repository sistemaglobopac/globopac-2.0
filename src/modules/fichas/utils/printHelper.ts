// Impressão do relatório de monitoramento (RelatorioModal.tsx).
//
// Histórico: a primeira versão abria uma janela em branco (window.open + document.write),
// clonando <style>/<link rel="stylesheet"> do documento pai — técnica do v1. Bug real: a nova
// janela é um documento à parte, então o Tailwind (carregado via <link> externo em produção)
// precisa ser buscado e aplicado de novo ali, e não há garantia de que isso termine antes de
// window.print() disparar — na prática saía sem nenhum estilo (relatório em texto cru, sem
// grade/cor/ícone), o oposto do pedido do usuário ("a impressão deve ser fiel à visualização
// na tela").
//
// Solução: imprimir a PRÓPRIA página (mesmo documento, mesmo CSS já carregado e aplicado —
// fidelidade garantida por construção, não por cópia) e usar @media print (ver index.css) para
// esconder tudo exceto o conteúdo de #relatorio-impressao. Técnica padrão de "imprimir só este
// elemento", sem as armadilhas de um documento separado.
export function imprimirElemento(): void {
  window.print();
}
