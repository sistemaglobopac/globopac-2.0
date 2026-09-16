// CORS mínimo para as Edge Functions autenticadas (não confundir com a função pública de
// verificação, que terá rate limiting próprio na Fase 3).
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
