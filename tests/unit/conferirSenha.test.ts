import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { atualizarPerfilOnline, limparCredenciais, registrarLoginOnline, temVerificadorLocal } from "@/lib/credencialOffline";
import { conferirSenha } from "@/modules/auth/reautenticar";
import { useSessionStore, type PerfilSessao } from "@/store/session";

const INSPETOR: PerfilSessao = { id: "user-1", nomeCompleto: "Joana", nivelAcesso: "INSPETOR_QUALIDADE", setoresPermitidos: ["SALA_CORTES"] };
const GESTOR: PerfilSessao = { id: "user-2", nomeCompleto: "Gil", nivelAcesso: "GESTOR_SETOR", setoresPermitidos: [] };

function definirOnline(valor: boolean) {
  Object.defineProperty(navigator, "onLine", { value: valor, configurable: true });
}

describe("conferirSenha (assinatura com ou sem internet)", () => {
  beforeEach(async () => {
    await limparCredenciais();
    await registrarLoginOnline({ userId: INSPETOR.id, matricula: "1234", senha: "segredo-123" });
    await atualizarPerfilOnline(INSPETOR);
    useSessionStore.setState({ perfil: INSPETOR });
  });

  afterEach(() => {
    definirOnline(true);
    vi.restoreAllMocks();
    useSessionStore.setState({ perfil: null });
  });

  it("sem internet, o inspetor confirma com a senha conferida no aparelho", async () => {
    definirOnline(false);
    expect(await conferirSenha("segredo-123")).toEqual({ ok: true, modo: "aparelho", matricula: "1234" });
  });

  it("sem internet, senha errada é recusada", async () => {
    definirOnline(false);
    expect(await conferirSenha("errada")).toMatchObject({ ok: false, erro: expect.stringMatching(/Senha incorreta/) });
  });

  it("sem internet, quem não trabalha offline (sem credencial no aparelho) precisa de internet", async () => {
    definirOnline(false);
    useSessionStore.setState({ perfil: GESTOR });
    expect(await conferirSenha("qualquer")).toMatchObject({ ok: false, erro: expect.stringMatching(/precisa de internet/) });
  });

  it("'online' mas sem resposta do servidor (rede caída de fato) também cai na conferência do aparelho", async () => {
    definirOnline(true);
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: null }, error: { message: "Failed to fetch", status: 0 } } as never);
    expect(await conferirSenha("segredo-123")).toEqual({ ok: true, modo: "aparelho", matricula: "1234" });
  });

  it("com internet, o servidor confere a senha", async () => {
    definirOnline(true);
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { email: "a@b.c" } }, error: null } as never);
    const login = vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({ data: {}, error: null } as never);
    expect(await conferirSenha("segredo-123")).toEqual({ ok: true, modo: "servidor" });
    expect(login).toHaveBeenCalledOnce();
  });

  it("com internet, senha recusada pelo servidor NÃO cai no aparelho (não é falha de rede)", async () => {
    definirOnline(true);
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { email: "a@b.c" } }, error: null } as never);
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({ data: {}, error: { message: "Invalid login credentials", status: 400 } } as never);
    expect(await conferirSenha("segredo-123")).toMatchObject({ ok: false });
  });
});

describe("aparelho sem o verificador da senha (sessão anterior ao acesso offline)", () => {
  const SEM_VERIFICADOR: PerfilSessao = { id: "user-antigo", nomeCompleto: "Ana", nivelAcesso: "INSPETOR_QUALIDADE", setoresPermitidos: ["SALA_CORTES"], matricula: "777" };

  beforeEach(async () => {
    await limparCredenciais();
    // só o perfil foi lido com rede (como acontece em quem já estava logado); nunca houve login que gravasse o verificador
    await atualizarPerfilOnline(SEM_VERIFICADOR);
    useSessionStore.setState({ perfil: SEM_VERIFICADOR });
  });

  afterEach(() => {
    definirOnline(true);
    vi.restoreAllMocks();
    useSessionStore.setState({ perfil: null });
  });

  it("sem internet, o inspetor NÃO fica travado: a ficha entra na fila sem a confirmação com senha", async () => {
    definirOnline(false);
    expect(await temVerificadorLocal(SEM_VERIFICADOR.id)).toBe(false);
    expect(await conferirSenha("")).toEqual({ ok: true, modo: "sem_verificador" });
  });

  it("a primeira confirmação com internet guarda o verificador; dali em diante a senha é conferida offline", async () => {
    definirOnline(true);
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { email: "a@b.c" } }, error: null } as never);
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({ data: {}, error: null } as never);
    expect(await conferirSenha("minha-senha")).toEqual({ ok: true, modo: "servidor" });
    await vi.waitFor(async () => expect(await temVerificadorLocal(SEM_VERIFICADOR.id)).toBe(true));

    definirOnline(false);
    expect(await conferirSenha("minha-senha")).toEqual({ ok: true, modo: "aparelho", matricula: "777" });
    expect(await conferirSenha("errada")).toMatchObject({ ok: false });
  });

  it("outros perfis sem verificador seguem precisando de internet", async () => {
    definirOnline(false);
    useSessionStore.setState({ perfil: { ...SEM_VERIFICADOR, nivelAcesso: "GESTOR_SETOR" } });
    expect(await conferirSenha("")).toMatchObject({ ok: false, erro: expect.stringMatching(/precisa de internet/) });
  });
});
