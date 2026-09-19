import { useState } from "react";
import { usePresenceStore } from "../presenceStore";
import { ModalShell } from "../ModalShell";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { Select } from "@/shared/ui/select";
import { NIVEL_ACESSO_BADGE, NIVEL_ACESSO_ROTULO, parseConfigExtras, usePerfisGestao, useAtualizarConfigExtras } from "../api";

export function ModalUsuariosAtivos({ onClose }: { onClose: () => void }) {
  const onlineIds = usePresenceStore((s) => s.onlineIds);
  const { data: perfis, isLoading } = usePerfisGestao();
  const { data: setores } = useSetoresCadastrados();
  const atualizarConfig = useAtualizarConfigExtras();
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const online = (perfis ?? [])
    .filter((p) => onlineIds.has(p.id))
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));

  return (
    <ModalShell titulo={`Usuários Ativos (${online.length})`} onClose={onClose} largura="max-w-2xl">
      {isLoading && <p className="text-sm" style={{ color: "#79628c" }}>Carregando…</p>}
      {!isLoading && online.length === 0 && (
        <p className="text-sm" style={{ color: "#79628c" }}>
          Nenhum usuário com o painel aberto no momento.
        </p>
      )}
      <ul className="divide-y" style={{ borderColor: "#dfe2e7" }}>
        {online.map((p) => {
          const badge = NIVEL_ACESSO_BADGE[p.nivel_acesso];
          const config = parseConfigExtras(p.configuracoes_extras);
          const ehInspetor = p.nivel_acesso === "INSPETOR_QUALIDADE";

          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "#1f1633" }}>
                  {p.nome_completo}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: badge.bg, color: badge.color }}>
                    {NIVEL_ACESSO_ROTULO[p.nivel_acesso]}
                  </span>
                  {config.coberturaTemporaria && (
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#79628c1a", color: "#79628c" }}>
                      Cobrindo {config.coberturaTemporaria.setor} ({config.coberturaTemporaria.inicio}–{config.coberturaTemporaria.fim})
                    </span>
                  )}
                </div>
              </div>

              {ehInspetor &&
                (editandoId === p.id ? (
                  <Select
                    autoFocus
                    defaultValue={config.setorDia ?? ""}
                    className="h-8 w-40 text-xs"
                    onBlur={() => setEditandoId(null)}
                    onChange={(e) => {
                      atualizarConfig.mutate({ id: p.id, atual: p.configuracoes_extras, patch: { setorDia: e.target.value } });
                      setEditandoId(null);
                    }}
                  >
                    <option value="">—</option>
                    {(setores ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditandoId(p.id)}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ background: "#6a5fc11a", color: "#6a5fc1" }}
                  >
                    {config.setorDia ?? "Definir setor do dia"}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </ModalShell>
  );
}
