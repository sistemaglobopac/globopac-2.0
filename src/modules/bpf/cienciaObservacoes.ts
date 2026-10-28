// Ciência do PCM sobre as observações que o inspetor deixou nas OS: o modal de entrada só mostra o que ainda não foi lido. A ciência
// fica guardada neste aparelho (localStorage, por usuário) como a lista dos ids das verificações já lidas; sem localStorage
// (navegação privada, bloqueio) o modal só reaparece, o que é inofensivo. Testada em tests/unit/cienciaObservacoes.test.ts.

const MAXIMO_GUARDADO = 500;
const chave = (usuarioId: string) => `bpf-pcm-observacoes-cientes:${usuarioId}`;

export function lerCienciaObservacoes(usuarioId: string): Set<string> {
  try {
    const bruto = localStorage.getItem(chave(usuarioId));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Soma as verificações lidas às já guardadas (mantém só as mais recentes). */
export function registrarCienciaObservacoes(usuarioId: string, ids: readonly string[]): void {
  try {
    const todas = [...lerCienciaObservacoes(usuarioId), ...ids];
    localStorage.setItem(chave(usuarioId), JSON.stringify([...new Set(todas)].slice(-MAXIMO_GUARDADO)));
  } catch {
    // sem armazenamento: a ciência não persiste
  }
}
