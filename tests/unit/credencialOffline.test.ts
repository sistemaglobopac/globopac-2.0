import { beforeEach, describe, expect, it } from "vitest";
import {
  VALIDADE_LOGIN_OFFLINE_DIAS,
  atualizarPerfilOnline,
  conferirSenhaLocal,
  entrarOffline,
  limparCredenciais,
  matriculaDoUsuario,
  mensagemDaRecusaOffline,
  registrarLoginOnline,
  validadeDoAcessoOffline,
} from "@/lib/credencialOffline";
import type { PerfilSessao } from "@/store/session";

const INSPETOR: PerfilSessao = { id: "user-1", nomeCompleto: "Joana Inspetora", nivelAcesso: "INSPETOR_QUALIDADE", setoresPermitidos: ["SALA_CORTES"] };
const AGORA = new Date("2026-10-07T12:00:00.000Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);

async function loginOnline(perfil: PerfilSessao = INSPETOR, senha = "segredo-123") {
  await registrarLoginOnline({ userId: perfil.id, matricula: "1234", senha });
  await atualizarPerfilOnline(perfil, AGORA);
}

describe("credencial offline do inspetor", () => {
  beforeEach(async () => {
    await limparCredenciais();
  });

  it("sem login online prévio neste aparelho, não entra", async () => {
    const r = await entrarOffline("1234", "segredo-123", AGORA);
    expect(r).toEqual({ ok: false, motivo: "sem_credencial" });
  });

  it("depois de um login online, entra offline com a senha certa e devolve o perfil", async () => {
    await loginOnline();
    const r = await entrarOffline(" 1234 ", "segredo-123", dias(2));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.perfil).toEqual(INSPETOR);
      expect(r.matricula).toBe("1234");
      expect(r.validoAte).toBe(dias(VALIDADE_LOGIN_OFFLINE_DIAS).toISOString());
    }
  });

  it("não guarda a senha em claro no aparelho", async () => {
    await loginOnline();
    const bruto = JSON.stringify(await (await import("idb")).openDB("globopac-credenciais-offline").then((db) => db.getAll("credenciais")));
    expect(bruto).not.toContain("segredo-123");
  });

  it("senha errada é recusada; matrícula desconhecida também", async () => {
    await loginOnline();
    expect(await entrarOffline("1234", "outra-senha", AGORA)).toEqual({ ok: false, motivo: "senha_invalida" });
    expect(await entrarOffline("9999", "segredo-123", AGORA)).toEqual({ ok: false, motivo: "sem_credencial" });
  });

  it("vale 7 dias a partir da última validação online; depois exige internet", async () => {
    await loginOnline();
    expect((await entrarOffline("1234", "segredo-123", dias(7))).ok).toBe(true);
    const vencida = await entrarOffline("1234", "segredo-123", new Date(dias(7).getTime() + 1));
    expect(vencida).toEqual({ ok: false, motivo: "expirada" });
    expect(mensagemDaRecusaOffline({ ok: false, motivo: "expirada" })).toMatch(/7 dias/);
  });

  it("uma nova validação online renova os 7 dias", async () => {
    await loginOnline();
    await atualizarPerfilOnline(INSPETOR, dias(6));
    expect((await entrarOffline("1234", "segredo-123", dias(12))).ok).toBe(true);
  });

  it("5 senhas erradas seguidas bloqueiam por alguns minutos, mesmo com a senha certa", async () => {
    await loginOnline();
    for (let i = 0; i < 4; i++) expect((await entrarOffline("1234", "x", AGORA))).toEqual({ ok: false, motivo: "senha_invalida" });
    const quinta = await entrarOffline("1234", "x", AGORA);
    expect(quinta.ok).toBe(false);
    if (!quinta.ok) expect(quinta.motivo).toBe("bloqueada");

    const durante = await entrarOffline("1234", "segredo-123", new Date(AGORA.getTime() + 60_000));
    expect(durante).toMatchObject({ ok: false, motivo: "bloqueada" });
    const depois = await entrarOffline("1234", "segredo-123", new Date(AGORA.getTime() + 6 * 60_000));
    expect(depois.ok).toBe(true);
  });

  it("perfil que não é inspetor não trabalha offline (e perde a credencial)", async () => {
    await loginOnline();
    await atualizarPerfilOnline({ ...INSPETOR, nivelAcesso: "VERIFICADOR" }, AGORA);
    expect(await entrarOffline("1234", "segredo-123", AGORA)).toEqual({ ok: false, motivo: "sem_credencial" });
    expect(await validadeDoAcessoOffline(INSPETOR.id)).toBeNull();
  });

  it("não importa a ordem: o perfil pode chegar antes do verificador da senha", async () => {
    await atualizarPerfilOnline(INSPETOR, AGORA);
    expect((await entrarOffline("1234", "segredo-123", AGORA)).ok).toBe(false);
    await registrarLoginOnline({ userId: INSPETOR.id, matricula: "1234", senha: "segredo-123" });
    expect((await entrarOffline("1234", "segredo-123", AGORA)).ok).toBe(true);
    expect(await matriculaDoUsuario(INSPETOR.id)).toBe("1234");
  });

  it("confere a senha do usuário já identificado (confirmação no lugar da assinatura)", async () => {
    await loginOnline();
    expect((await conferirSenhaLocal(INSPETOR.id, "segredo-123", AGORA)).ok).toBe(true);
    expect(await conferirSenhaLocal(INSPETOR.id, "errada", AGORA)).toEqual({ ok: false, motivo: "senha_invalida" });
    expect(await conferirSenhaLocal("outro-usuario", "segredo-123", AGORA)).toEqual({ ok: false, motivo: "sem_credencial" });
  });
}, 60_000);
