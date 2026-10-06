import { QueryClient } from "@tanstack/react-query";

// networkMode "offlineFirst": com o padrão ("online"), o TanStack Query PAUSA consultas e mutations
// enquanto o navegador reporta sem rede — a tela ficava carregando para sempre e o "Criar e
// assinar" nunca chegava à fila offline. Aqui a primeira tentativa sempre roda (e falha rápido,
// ou usa o cache local de offlineCache.ts); só as novas tentativas esperam a rede voltar.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});
