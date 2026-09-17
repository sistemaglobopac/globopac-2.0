// Decodifica (sem reverificar assinatura) o payload de um JWT já validado pelo gateway do
// Supabase (Kong) antes de rotear a chamada até a Edge Function — por isso é seguro só ler
// os claims aqui, sem round-trip extra a auth.getUser(), para funções que só precisam saber
// "quem" chamou (role/perfil), não fazer queries com RLS como esse chamador.
export function decodificarPayloadJwt(authorizationHeader: string | null): Record<string, unknown> | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length);
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const payloadBase64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadBase64.padEnd(payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4), "="));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}
