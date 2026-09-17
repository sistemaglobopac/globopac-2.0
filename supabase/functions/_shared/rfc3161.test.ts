// Teste manual/local contra as TSAs reais (rede real) — não roda em CI (sem acesso
// confiável e determinístico à internet pública de dentro do runner). Rodar localmente com:
//   deno test --allow-net supabase/functions/_shared/rfc3161.test.ts
// Serve para validar o cliente contra os 4 TSAs do PROMPT MESTRE sempre que a implementação
// mudar — não substitui os testes automatizados (Vitest, com fetch mockado) que rodam em CI.
import { assertEquals } from "jsr:@std/assert@1";
import { solicitarCarimboRFC3161 } from "./rfc3161.ts";

const HASH_TESTE = "b".repeat(64);

const TSAS = [
  ["FreeTSA", "https://freetsa.org/tsr"],
  ["Sectigo", "http://timestamp.sectigo.com"],
  ["Comodo", "http://timestamp.comodoca.com"],
  ["Certum", "http://time.certum.pl"],
] as const;

for (const [nome, url] of TSAS) {
  Deno.test(`solicitarCarimboRFC3161 — ${nome} concede um carimbo válido`, async () => {
    const resultado = await solicitarCarimboRFC3161(url, HASH_TESTE);
    assertEquals(resultado.ok, true);
    if (resultado.ok) {
      assertEquals(resultado.genTime instanceof Date, true);
      assertEquals(resultado.cadeiaCertificadosDer.byteLength > 0, true);
      assertEquals(resultado.tsrBase64.length > 0, true);
    }
  });
}

Deno.test("solicitarCarimboRFC3161 — URL inválida retorna ok:false sem lançar", async () => {
  const resultado = await solicitarCarimboRFC3161("http://127.0.0.1:1/inexistente", HASH_TESTE, 2000);
  assertEquals(resultado.ok, false);
});
