import { estaAtrasada, useRncsAbertas, useRncsFechadasRecentes } from "./api";
import { CartaoRnc } from "./CartaoRnc";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessionStore } from "@/store/session";

export function RncTratativasPage() {
  const { data: abertas, isLoading } = useRncsAbertas();
  const { data: fechadas } = useRncsFechadasRecentes();
  const perfil = useSessionStore((s) => s.perfil);
  // ?foco=<id> (vindo do card de alerta do gestor): rola até a RNC e a destaca.
  const [searchParams] = useSearchParams();
  const foco = searchParams.get("foco");
  useEffect(() => {
    if (!foco || !abertas) return;
    document.getElementById(`rnc-${foco}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [foco, abertas]);

  const isAdmin = perfil?.nivelAcesso === "ADMIN_MASTER";
  const podeTratar = perfil?.nivelAcesso === "GESTOR_SETOR" || isAdmin;
  const podeRevisar = perfil?.nivelAcesso === "VERIFICADOR" || isAdmin;

  const atrasadas = (abertas ?? []).filter(estaAtrasada);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{podeTratar && !podeRevisar ? "Tratativas de RNC" : "RNCs — Tratativa e Revisão"}</h1>
        <p className="text-sm text-muted-foreground">
          {podeRevisar && !podeTratar
            ? "Não conformidades tratadas pelo Gestor de Setor, aguardando sua revisão — aprove o fechamento ou devolva para nova tratativa."
            : "Não conformidades abertas a partir de reprovações na verificação — registre a tratativa; o Verificador revisa e fecha."}
        </p>
      </div>

      {atrasadas.length > 0 && (
        <p className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {atrasadas.length} RNC(s) com SLA vencido — priorize o tratamento.
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {!isLoading && abertas?.length === 0 && <p className="text-muted-foreground">Nenhuma RNC pendente.</p>}

      {abertas?.map((rnc) => (
        <div key={rnc.id} id={`rnc-${rnc.id}`} className={rnc.id === foco ? "rounded-xl ring-4 ring-primary/40" : undefined}>
          <CartaoRnc rnc={rnc} podeTratar={podeTratar} podeRevisar={podeRevisar} podeReabrir={isAdmin} />
        </div>
      ))}

      {isAdmin && fechadas && fechadas.length > 0 && (
        <div className="space-y-2 pt-6">
          <h2 className="text-lg font-medium text-muted-foreground">Fechadas recentemente</h2>
          {fechadas.map((rnc) => (
            <CartaoRnc key={rnc.id} rnc={rnc} podeTratar={false} podeRevisar={false} podeReabrir={isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
