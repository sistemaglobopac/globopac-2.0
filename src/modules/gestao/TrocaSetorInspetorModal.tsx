import { useState } from "react";
import { ArrowRightLeft, Undo2 } from "lucide-react";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { useAppDialog } from "./dialogSystem";
import { ModalShell } from "./ModalShell";
import { useInspetoresTrocaSetor, useRestaurarSetorInspetor, useTrocarSetorInspetor, type InspetorTrocaSetor } from "./api";

function formatarVolta(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Manaus", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const DURACOES_COBERTURA = [
  { minutos: 30, rotulo: "30 min" },
  { minutos: 60, rotulo: "1 h" },
  { minutos: 90, rotulo: "1 h 30" },
  { minutos: 120, rotulo: "2 h" },
  { minutos: 0, rotulo: "Até o fim do turno" },
];

function LinhaInspetor({ inspetor, setores }: { inspetor: InspetorTrocaSetor; setores: string[] }) {
  const dialog = useAppDialog();
  const trocar = useTrocarSetorInspetor();
  const restaurar = useRestaurarSetorInspetor();
  const [novoSetor, setNovoSetor] = useState("");
  const [modo, setModo] = useState<"substituir" | "cobrir">("substituir");
  const [duracao, setDuracao] = useState(90);
  const trocado = inspetor.setores_base !== null;
  const ocupado = trocar.isPending || restaurar.isPending;

  function aplicar() {
    if (!novoSetor) return;
    const cobrir = modo === "cobrir";
    trocar.mutate(
      { userId: inspetor.id, setor: novoSetor, ate: cobrir && duracao > 0 ? new Date(Date.now() + duracao * 60_000) : undefined },
      {
        onSuccess: () => {
          setNovoSetor("");
          dialog.sucesso(
            cobrir
              ? `${inspetor.nome_completo} agora acessa SOMENTE ${novoSetor} (cobertura). Ao fim do prazo escolhido volta ao setor dele.`
              : `${inspetor.nome_completo} agora está em ${novoSetor}. Volta ao setor de origem ao fim do turno.`
          );
        },
        onError: (erro) => dialog.erro(erro, "Falha ao trocar o setor"),
      }
    );
  }

  return (
    <li className="space-y-2 rounded-lg border border-hairline p-3" data-testid={`troca-setor-${inspetor.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{inspetor.nome_completo}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Setor agora:
            {inspetor.setores_permitidos.length === 0 ? (
              <Badge variant="outline">nenhum</Badge>
            ) : (
              inspetor.setores_permitidos.map((s) => (
                <Badge key={s} variant={trocado ? "warning" : "secondary"}>
                  {s}
                </Badge>
              ))
            )}
          </p>
        </div>
        {trocado && (
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => restaurar.mutate(inspetor.id, { onError: (e) => dialog.erro(e, "Falha ao voltar o setor") })}>
            <Undo2 className="h-3.5 w-3.5" />
            Voltar agora
          </Button>
        )}
      </div>
      {trocado && (
        <p className="text-xs text-muted-foreground">
          Troca/cobertura temporária — volta para <strong>{inspetor.setores_base?.join(" / ")}</strong> até {formatarVolta(inspetor.troca_setor_expira_em)}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={`Modo da troca de ${inspetor.nome_completo}`} className="w-auto" value={modo} onChange={(e) => setModo(e.target.value as "substituir" | "cobrir")}>
          <option value="substituir">Trocar de setor (até o fim do turno)</option>
          <option value="cobrir">Cobrir almoço (só o setor coberto)</option>
        </Select>
        {modo === "cobrir" && (
          <Select aria-label={`Duração da cobertura de ${inspetor.nome_completo}`} className="w-auto" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
            {DURACOES_COBERTURA.map((d) => (
              <option key={d.minutos} value={d.minutos}>
                {d.rotulo}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label={`Novo setor de ${inspetor.nome_completo}`} className="min-w-0 flex-1" value={novoSetor} onChange={(e) => setNovoSetor(e.target.value)}>
          <option value="">Trocar para…</option>
          {setores.map((s) => (
            <option key={s} value={s} disabled={inspetor.setores_permitidos.length === 1 && inspetor.setores_permitidos[0] === s}>
              {s}
            </option>
          ))}
        </Select>
        <Button type="button" size="sm" disabled={!novoSetor || ocupado} onClick={aplicar}>
          <ArrowRightLeft className="h-3.5 w-3.5" />
          {trocar.isPending ? "Aplicando…" : modo === "cobrir" ? "Cobrir" : "Trocar"}
        </Button>
      </div>
    </li>
  );
}

/** Lista de inspetores com a troca/cobertura de setor — usada no modal (Painel de Gestão / Painel de
 * Verificação) e na página própria do menu do Verificador. */
export function ListaTrocaSetor() {
  const { data: inspetores, isLoading, isError } = useInspetoresTrocaSetor();
  const { data: setores } = useSetoresCadastrados();

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Nos dois casos o inspetor passa a ver <strong>somente o setor escolhido</strong> e volta sozinho ao setor de origem.{" "}
        <strong>Trocar de setor:</strong> volta ao fim do turno. <strong>Cobrir almoço:</strong> volta no prazo escolhido (30 min a 2 h).
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando inspetores…</p>}
      {isError && <p className="text-sm text-destructive">Não foi possível carregar os inspetores.</p>}
      {inspetores && inspetores.length === 0 && <p className="text-sm text-muted-foreground">Nenhum inspetor de qualidade ativo.</p>}
      <ul className="space-y-3">
        {(inspetores ?? []).map((i) => (
          <LinhaInspetor key={i.id} inspetor={i} setores={setores ?? []} />
        ))}
      </ul>
    </>
  );
}

/** Troca RÁPIDA de setor / cobertura de almoço (administrador e verificador) em modal. A troca deixa o
 * inspetor SÓ com o setor escolhido e volta sozinha ao setor de origem (fim do turno ou prazo da cobertura);
 * o app do inspetor percebe a mudança em ~30 s e atualiza os monitoramentos sem ele sair. */
export function TrocaSetorInspetorModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell titulo="Trocar Setor / Cobertura" onClose={onClose} largura="max-w-2xl">
      <ListaTrocaSetor />
    </ModalShell>
  );
}

/** Página "Trocar Setor / Cobertura" (item do menu lateral do Verificador). */
export function TrocaSetorInspetorPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Trocar Setor / Cobertura</h1>
        <p className="text-sm text-muted-foreground">Mude o setor de um inspetor ou cubra o almoço de um colega.</p>
      </div>
      <div className="rounded-2xl border border-hairline bg-card p-4 shadow-sm">
        <ListaTrocaSetor />
      </div>
    </div>
  );
}
