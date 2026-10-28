import { CabecalhoBpf, PaginaBpf } from "./PaginaBpf";
import { RelatorioPorData } from "./RelatorioPorData";
import { NOME_RELATORIO_BPF } from "./tipos";

/** Consulta dos relatórios diários de OS (Verificador, Inspeção Federal e quem não usa a Verificação diária). Só leitura. */
export function RelatoriosPage() {
  return (
    <PaginaBpf larga>
      <CabecalhoBpf
        titulo={NOME_RELATORIO_BPF}
        descricao="Escolha a data e gere o relatório: não conformidades apontadas pelo inspetor, com a programação do PCM e as assinaturas do dia."
      />
      <RelatorioPorData />
    </PaginaBpf>
  );
}
