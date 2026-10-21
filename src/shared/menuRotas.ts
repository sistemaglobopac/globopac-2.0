/** O NavLink marca um item como ativo também nas rotas "filhas" (`/bpf` fica ativo em `/bpf/pcm`).
 * Quando outro item do mesmo menu tem uma rota que começa com a deste item, o item pai só deve
 * ficar ativo na rota exata — senão dois itens do menu aparecem selecionados ao mesmo tempo. */
export function casaSomenteRotaExata(rota: string, rotasDoMenu: string[]): boolean {
  return rotasDoMenu.some((outra) => outra !== rota && outra.startsWith(`${rota}/`));
}
