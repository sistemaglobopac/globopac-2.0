import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atualizarStatusRascunho, listarRascunhos, rascunhoExpirado, removerRascunho, type Rascunho } from "@/lib/rascunhos";
import { sincronizarRascunhosNuvem } from "@/lib/rascunhosNuvem";
import { enfileirarFicha } from "@/lib/offlineQueue";
import { montarConfirmacaoOffline } from "@/lib/confirmacaoOffline";
import { sincronizarUmaFicha } from "./sincronizacaoOffline";
import type { MonitoramentoHoje } from "@/modules/bordo/api";

export const CHAVE_RASCUNHOS = ["rascunhos"] as const;

/** Rascunhos locais do usuário (só neste aparelho). Funciona sem rede. */
export function useRascunhos(userId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE_RASCUNHOS, userId],
    enabled: !!userId,
    networkMode: "always",
    refetchInterval: 10_000,
    queryFn: () => listarRascunhos(userId as string),
  });
}

/** Mantém a cópia dos rascunhos na nuvem em dia: ao entrar, a cada minuto, quando a internet volta e quando a aba reaparece.
 * É o que permite assinar um rascunho de QUALQUER aparelho. Fica montado no layout do app (AppShell). */
export function useSincronizarRascunhosNuvem(userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    let rodando = false;
    async function sincronizar() {
      if (rodando) return;
      rodando = true;
      try {
        const mudou = await sincronizarRascunhosNuvem(userId as string);
        if (mudou && ativo) await queryClient.invalidateQueries({ queryKey: CHAVE_RASCUNHOS });
      } catch {
        /* sem rede ou erro passageiro: tenta de novo na próxima */
      } finally {
        rodando = false;
      }
    }
    void sincronizar();
    const intervalo = window.setInterval(() => void sincronizar(), 60_000);
    const aoVoltar = () => void sincronizar();
    const aoReaparecer = () => {
      if (document.visibilityState === "visible") void sincronizar();
    };
    window.addEventListener("online", aoVoltar);
    document.addEventListener("visibilitychange", aoReaparecer);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      window.removeEventListener("online", aoVoltar);
      document.removeEventListener("visibilitychange", aoReaparecer);
    };
  }, [userId, queryClient]);
}

export function useAtualizarRascunhos() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: CHAVE_RASCUNHOS });
}

/** Rascunhos como "monitoramentos já feitos", para o cronômetro/atraso do painel: o monitoramento foi
 * realizado (só não foi assinado ainda). */
export function rascunhosComoMonitoramentos(rascunhos: Rascunho[] | undefined, setores: string[]): MonitoramentoHoje[] {
  return (rascunhos ?? [])
    .filter((r) => setores.includes(r.setor))
    .map((r) => ({ id: r.id, ficha_template_id: r.fichaTemplateId, criado_em: r.horaMonitoramento, setor: r.setor }));
}

export interface ResultadoLote {
  assinados: string[];
  falharam: { id: string; erro: string }[];
  expirados: string[];
}

/** Assina e envia os rascunhos escolhidos, um a um, com a MESMA sequência do fluxo online (grava +
 * assina como INSPETOR). A senha já foi conferida por quem chama (ModalAssinaturaSenha). O que falha
 * (rede, prazo vencido no servidor) continua como rascunho, marcado com o erro. */
export async function assinarRascunhosEmLote(
  rascunhos: Rascunho[],
  userId: string,
  aoProgredir?: (atual: number, total: number) => void
): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { assinados: [], falharam: [], expirados: [] };
  const agora = new Date();
  const alvo = rascunhos.filter((r) => r.userId === userId);
  let feitos = 0;
  for (const r of alvo) {
    if (rascunhoExpirado(r, agora)) {
      resultado.expirados.push(r.id);
      feitos += 1;
      aoProgredir?.(feitos, alvo.length);
      continue;
    }
    await atualizarStatusRascunho(r.id, "assinando");
    try {
      await sincronizarUmaFicha({
        id: r.id,
        fichaTemplateId: r.fichaTemplateId,
        versaoTemplate: r.versaoTemplate,
        userId: r.userId,
        setor: r.setor,
        dadosDinamicos: r.dadosDinamicos,
        statusFicha: r.statusFicha,
        capturadoEm: r.horaMonitoramento,
        enfileiradoEm: r.salvoEm,
        status: "sincronizando",
      });
      await removerRascunho(r.id, "assinado");
      resultado.assinados.push(r.id);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : (erro as { message?: string } | null)?.message ?? String(erro);
      await atualizarStatusRascunho(r.id, "falhou", mensagem);
      resultado.falharam.push({ id: r.id, erro: mensagem });
    }
    feitos += 1;
    aoProgredir?.(feitos, alvo.length);
  }
  return resultado;
}

/** Sem internet: o inspetor confirma os rascunhos com a senha (conferida no aparelho) e eles entram na FILA
 * offline, de onde são gravados e assinados pelo servidor quando a rede voltar (ADR 0016). Rascunho com o prazo
 * de 7 dias vencido não entra. */
export async function confirmarRascunhosOffline(
  rascunhos: Rascunho[],
  userId: string,
  confirmacao: { modo: "servidor" | "aparelho" | "sem_verificador"; matricula?: string }
): Promise<{ enfileirados: string[]; expirados: string[] }> {
  const resultado = { enfileirados: [] as string[], expirados: [] as string[] };
  const agora = new Date();
  for (const r of rascunhos.filter((x) => x.userId === userId)) {
    if (rascunhoExpirado(r, agora)) {
      resultado.expirados.push(r.id);
      continue;
    }
    await enfileirarFicha({
      id: r.id,
      fichaTemplateId: r.fichaTemplateId,
      versaoTemplate: r.versaoTemplate,
      userId: r.userId,
      setor: r.setor,
      dadosDinamicos: r.dadosDinamicos,
      statusFicha: r.statusFicha,
      capturadoEm: r.horaMonitoramento,
      confirmacaoOffline: await montarConfirmacaoOffline({
        dados: { id: r.id, fichaTemplateId: r.fichaTemplateId, versaoTemplate: r.versaoTemplate, userId: r.userId, setor: r.setor, dadosDinamicos: r.dadosDinamicos, capturadoEm: r.horaMonitoramento },
        senhaConferidaEm: confirmacao.modo === "sem_verificador" ? null : confirmacao.modo,
        matricula: confirmacao.matricula ?? null,
      }),
    });
    await removerRascunho(r.id, "assinado");
    resultado.enfileirados.push(r.id);
  }
  return resultado;
}
