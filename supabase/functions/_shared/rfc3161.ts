// Cliente RFC 3161 (Time-Stamp Protocol) — seção 7.5 do PROMPT MESTRE.
//
// Validado manualmente (fora deste código, via `deno run` neste mesmo formato) contra os 4
// TSAs públicos citados no PROMPT MESTRE (FreeTSA, Sectigo, Comodo, Certum): todos respondem
// "granted" com corrente de certificados e genTime extraíveis. Usa @peculiar/asn1-* em vez
// de codificação ASN.1 manual — construir/parsear DER à mão é fácil de acertar
// "aparentemente" e errar de um jeito que só um TSA real revelaria, e este projeto não tem
// como validar isso em CI contra a internet real de forma confiável (ver ADR do worker).
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import { TimeStampReq, MessageImprint, TimeStampResp, PKIStatus, TSTInfo } from "@peculiar/asn1-tsp";
import { AlgorithmIdentifier } from "@peculiar/asn1-x509";
import { SignedData } from "@peculiar/asn1-cms";

const SHA256_OID = "2.16.840.1.101.3.4.2.1";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export type ResultadoCarimbo =
  | {
      ok: true;
      tsrBase64: string;
      genTime: Date;
      /** Cadeia de certificados da TSA, concatenada em DER (um atrás do outro) — ver
       * seção 6.4 do PROMPT MESTRE (verificação de longo prazo / LTV). */
      cadeiaCertificadosDer: Uint8Array;
    }
  | { ok: false; erro: string };

/** Constrói a requisição, envia para a TSA e interpreta a resposta. Nunca lança — todo erro
 * (rede, TSA rejeitou, parsing) volta como { ok: false, erro }, para o chamador decidir o
 * que fazer (tentar a próxima TSA da lista, seção 7.5). */
export async function solicitarCarimboRFC3161(
  tsaUrl: string,
  hashHex: string,
  timeoutMs = 10_000
): Promise<ResultadoCarimbo> {
  try {
    const hashedMessage = hexToBytes(hashHex);
    const requisicao = new TimeStampReq({
      version: 1,
      messageImprint: new MessageImprint({
        hashAlgorithm: new AlgorithmIdentifier({ algorithm: SHA256_OID }),
        hashedMessage: new OctetString(hashedMessage),
      }),
      certReq: true,
      nonce: crypto.getRandomValues(new Uint8Array(8)).buffer,
    });
    const requisicaoDer = AsnConvert.serialize(requisicao);

    const resposta = await fetch(tsaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: requisicaoDer,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resposta.ok) {
      return { ok: false, erro: `HTTP ${resposta.status} de ${tsaUrl}` };
    }

    const respostaBytes = new Uint8Array(await resposta.arrayBuffer());
    const tsResp = AsnConvert.parse(respostaBytes, TimeStampResp);

    if (tsResp.status.status !== PKIStatus.granted && tsResp.status.status !== PKIStatus.grantedWithMods) {
      return { ok: false, erro: `TSA recusou: status ${PKIStatus[tsResp.status.status] ?? tsResp.status.status}` };
    }
    if (!tsResp.timeStampToken) {
      return { ok: false, erro: "TSA não retornou timeStampToken" };
    }

    const signedData = AsnConvert.parse(tsResp.timeStampToken.content, SignedData);
    const eContent = signedData.encapContentInfo.eContent;
    if (!eContent) return { ok: false, erro: "SignedData sem eContent (TSTInfo ausente)" };

    const tstInfoBytes = eContent.single ? eContent.single.buffer : eContent.any;
    if (!tstInfoBytes) return { ok: false, erro: "eContent sem conteúdo utilizável" };
    const tstInfo = AsnConvert.parse(tstInfoBytes, TSTInfo);

    const certificados = signedData.certificates ?? [];
    const certsDer: Uint8Array[] = [];
    for (const c of certificados) {
      if (c.certificate) certsDer.push(new Uint8Array(AsnConvert.serialize(c.certificate)));
    }
    const tamanhoTotal = certsDer.reduce((acc, c) => acc + c.byteLength, 0);
    const cadeiaCertificadosDer = new Uint8Array(tamanhoTotal);
    let offset = 0;
    for (const c of certsDer) {
      cadeiaCertificadosDer.set(c, offset);
      offset += c.byteLength;
    }

    return {
      ok: true,
      tsrBase64: bytesToBase64(respostaBytes),
      genTime: tstInfo.genTime,
      cadeiaCertificadosDer,
    };
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}
