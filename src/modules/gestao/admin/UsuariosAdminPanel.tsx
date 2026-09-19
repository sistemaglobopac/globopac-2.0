import { useState } from "react";
import { Edit, KeyRound, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/store/session";
import { useAppDialog } from "../dialogSystem";
import { NIVEL_ACESSO_BADGE, NIVEL_ACESSO_ROTULO, type PerfilGestao, parseConfigExtras, usePerfisGestao, useDesligarUsuarioGestao } from "../api";
import { FormUsuarioModal } from "./FormUsuarioModal";
import { ModalRedefinirSenha } from "./ModalRedefinirSenha";

const SETOR_LIVRE = "Todos";

function ChipsSetores({ perfil }: { perfil: PerfilGestao }) {
  const config = parseConfigExtras(perfil.configuracoes_extras);
  if (perfil.setores_permitidos.length === 0 || perfil.setores_permitidos.includes(SETOR_LIVRE)) {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#c2ef4e", color: "#1f1633" }}>
        Livre (Todos)
      </span>
    );
  }
  const visiveis = perfil.setores_permitidos.slice(0, 3);
  const resto = perfil.setores_permitidos.slice(3);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visiveis.map((s) => (
        <span key={s} className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#e5e7eb", color: "#374151" }}>
          {s}
        </span>
      ))}
      {resto.length > 0 && (
        <span
          title={resto.join(", ")}
          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ background: "#6a5fc11a", color: "#6a5fc1" }}
        >
          +{resto.length}
        </span>
      )}
      {config.coberturaTemporaria && (
        <span
          title={`Cobrindo ${config.coberturaTemporaria.setor} (${config.coberturaTemporaria.inicio}–${config.coberturaTemporaria.fim})`}
          className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ background: "#79628c1a", color: "#79628c" }}
        >
          Cobertura
        </span>
      )}
    </div>
  );
}

/** Aba "admin" — Usuários do Sistema. */
export function UsuariosAdminPanel() {
  const perfilLogado = useSessionStore((s) => s.perfil);
  const dialog = useAppDialog();
  const { data: perfis, isLoading } = usePerfisGestao();
  const desligar = useDesligarUsuarioGestao();

  const [modalForm, setModalForm] = useState<"fechado" | "novo" | PerfilGestao>("fechado");
  const [modalSenhaDe, setModalSenhaDe] = useState<PerfilGestao | null>(null);

  function confirmarDesligar(usuario: PerfilGestao) {
    dialog.confirm({
      titulo: "Desligar colaborador",
      mensagem: `Tem certeza que deseja desligar "${usuario.nome_completo}"? O login deixa de funcionar imediatamente.`,
      icone: "error",
      aoConfirmar: () => {
        desligar.mutate(usuario.id, {
          onSuccess: () => dialog.sucesso("Colaborador desligado."),
          onError: (erro) => dialog.erro(erro, "Falha ao desligar colaborador"),
        });
      },
    });
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: "1px solid #dfe2e7" }}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Users className="h-7 w-7 shrink-0" style={{ color: "#6a5fc1" }} />
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#1f1633" }}>
              Usuários do Sistema
            </h2>
            <p className="text-sm" style={{ color: "#79628c" }}>Cadastre colaboradores, defina perfis de acesso e setores vinculados.</p>
          </div>
        </div>
        <Button type="button" style={{ background: "#6a5fc1", color: "#fff" }} onClick={() => setModalForm("novo")}>
          <Plus className="h-4 w-4" /> Novo Colaborador
        </Button>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "#79628c" }}>Carregando…</p>}

      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #dfe2e7" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "#f7f8fa" }}>
            <tr className="text-left text-xs font-bold uppercase tracking-wide" style={{ color: "#79628c" }}>
              <th className="px-4 py-2">Nome e Login</th>
              <th className="px-4 py-2">Perfil</th>
              <th className="px-4 py-2">Área/Setor Atual</th>
              <th className="px-4 py-2">Turno</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(perfis ?? []).map((p) => {
              const badge = NIVEL_ACESSO_BADGE[p.nivel_acesso];
              const config = parseConfigExtras(p.configuracoes_extras);
              const ehVoceMesmo = perfilLogado?.id === p.id;
              return (
                <tr key={p.id} className="border-t" style={{ borderColor: "#dfe2e7", opacity: p.ativo ? 1 : 0.5 }}>
                  <td className="px-4 py-2">
                    <p className="font-bold" style={{ color: "#1f1633" }}>
                      {p.nome_completo}
                    </p>
                    <p className="text-xs" style={{ color: "#79628c" }}>@{p.nome_usuario}</p>
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: badge.bg, color: badge.color }}>
                      {NIVEL_ACESSO_ROTULO[p.nivel_acesso]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <ChipsSetores perfil={p} />
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: "#1f1633" }}>
                    {config.turnoFixo ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" aria-label={`Editar ${p.nome_completo}`} onClick={() => setModalForm(p)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Redefinir senha de ${p.nome_completo}`}
                        onClick={() => setModalSenhaDe(p)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={ehVoceMesmo || !p.ativo}
                        aria-label={`Excluir ${p.nome_completo}`}
                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => confirmarDesligar(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && (perfis ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center" style={{ color: "#79628c" }}>
                  Nenhum colaborador cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalForm !== "fechado" && (
        <FormUsuarioModal usuario={modalForm === "novo" ? null : modalForm} onClose={() => setModalForm("fechado")} />
      )}
      {modalSenhaDe && (
        <ModalRedefinirSenha userId={modalSenhaDe.id} nomeCompleto={modalSenhaDe.nome_completo} onClose={() => setModalSenhaDe(null)} />
      )}
    </div>
  );
}
