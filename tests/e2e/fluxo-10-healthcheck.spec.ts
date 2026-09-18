import { test, expect } from "@playwright/test";
import { chamarFuncaoCrua, clienteAdminDeTeste } from "./helpers";

// Fase 9 (observabilidade) — endpoint público de healthcheck, sem número de fluxo na seção
// 10 (feature adicionada além do roteiro original, ver ASSUMPTIONS.md). Só chamada HTTP
// crua (sem browser): confere contagens agregadas e que o status HTTP reflete degradação.

test("healthcheck público responde com contagens agregadas e sinaliza degradação (Fase 9)", async () => {
  const admin = await clienteAdminDeTeste();

  const { data: inspetor } = await admin
    .from("perfis_usuarios")
    .select("id")
    .eq("nome_usuario", "inspetor.qualidade")
    .single();
  expect(inspetor).toBeTruthy();

  // Garante pelo menos uma RNC com SLA vencido, para exercitar o caminho "degradado" sem
  // depender de estado deixado por outros testes.
  const { error } = await admin.from("rnc").insert({
    descricao: `E2E-healthcheck-${Date.now()}`,
    setor: "LINHA_DIF",
    status: "ABERTA",
    severidade: "BAIXA",
    aberto_por: inspetor!.id,
    prazo_sla: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  expect(error).toBeFalsy();

  const resposta = await chamarFuncaoCrua("healthcheck", {});
  expect(resposta.status).toBe(503);

  const corpo = (await resposta.json()) as {
    status: string;
    timestamp: string;
    checks: {
      banco_de_dados: boolean;
      rncs_com_sla_vencido: number;
      usuarios_cadastrados: number;
    };
  };
  expect(corpo.status).toBe("degradado");
  expect(corpo.checks.banco_de_dados).toBe(true);
  expect(corpo.checks.rncs_com_sla_vencido).toBeGreaterThanOrEqual(1);
  expect(typeof corpo.checks.usuarios_cadastrados).toBe("number");
  expect(corpo.checks.usuarios_cadastrados).toBeGreaterThan(0);
  expect(corpo.timestamp).toBeTruthy();
});
