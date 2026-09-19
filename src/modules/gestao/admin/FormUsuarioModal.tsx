import { useState } from "react";
import type { NivelAcesso } from "@/lib/database.types";
import { ModalShell } from "../ModalShell";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { useSetoresCadastrados } from "@/modules/admin/api";
import { useAppDialog } from "../dialogSystem";
import {
  type ConfiguracoesExtrasPerfil,
  type PerfilGestao,
  parseConfigExtras,
  useCriarUsuarioGestao,
  useEditarUsuarioGestao,
} from "../api";

const PERFIS: { valor: NivelAcesso; rotulo: string }[] = [
  { valor: "INSPETOR_QUALIDADE", rotulo: "Monitor de Qualidade" },
  { valor: "INSPETOR_PCM", rotulo: "Inspetor Manutenção PCM" },
  { valor: "VERIFICADOR", rotulo: "Verificador — Nível Intermediário" },
  { valor: "GESTOR_SETOR", rotulo: "Encarregado de Setor/Gestor" },
  { valor: "ADMIN_MASTER", rotulo: "Administrador Geral" },
  { valor: "INSPECAO_FEDERAL", rotulo: "Auditoria Oficial SIF" },
];

const SETOR_LIVRE = "Todos";

interface FormUsuarioModalProps {
  usuario: PerfilGestao | null;
  onClose: () => void;
}

export function FormUsuarioModal({ usuario, onClose }: FormUsuarioModalProps) {
  const dialog = useAppDialog();
  const { data: setoresDisponiveis } = useSetoresCadastrados();
  const criar = useCriarUsuarioGestao();
  const editar = useEditarUsuarioGestao();

  const configInicial: ConfiguracoesExtrasPerfil = usuario ? parseConfigExtras(usuario.configuracoes_extras) : {};

  const [nomeCompleto, setNomeCompleto] = useState(usuario?.nome_completo ?? "");
  const [nomeUsuario, setNomeUsuario] = useState(usuario?.nome_usuario ?? "");
  const [matricula, setMatricula] = useState(usuario?.matricula ?? "");
  const [emailAlerta, setEmailAlerta] = useState(usuario?.email_alerta ?? "");
  const [senha, setSenha] = useState("");
  const [nivelAcesso, setNivelAcesso] = useState<NivelAcesso>(usuario?.nivel_acesso ?? "INSPETOR_QUALIDADE");
  const [livreGeral, setLivreGeral] = useState(usuario ? usuario.setores_permitidos.includes(SETOR_LIVRE) : false);
  const [setoresSelecionados, setSetoresSelecionados] = useState<string[]>(
    usuario ? usuario.setores_permitidos.filter((s) => s !== SETOR_LIVRE) : []
  );
  const [turnoFixo, setTurnoFixo] = useState<"Turno 1" | "Turno 2" | "Ambos">(configInicial.turnoFixo ?? "Ambos");
  const [coberturaAtiva, setCoberturaAtiva] = useState(!!configInicial.coberturaTemporaria);
  const [coberturaSetor, setCoberturaSetor] = useState(configInicial.coberturaTemporaria?.setor ?? "");
  const [coberturaInicio, setCoberturaInicio] = useState(configInicial.coberturaTemporaria?.inicio ?? "");
  const [coberturaFim, setCoberturaFim] = useState(configInicial.coberturaTemporaria?.fim ?? "");

  function alternarSetor(setor: string) {
    setSetoresSelecionados((atual) => (atual.includes(setor) ? atual.filter((s) => s !== setor) : [...atual, setor]));
  }

  async function salvar() {
    if (!nomeCompleto.trim() || !nomeUsuario.trim() || !matricula.trim()) {
      dialog.alert({ titulo: "Campos obrigatórios", mensagem: "Preencha nome completo, usuário de login e matrícula.", icone: "warning" });
      return;
    }
    if (!usuario && senha.trim().length < 6) {
      dialog.alert({ titulo: "Senha inválida", mensagem: "A senha primária precisa ter pelo menos 6 caracteres.", icone: "warning" });
      return;
    }

    const configuracoesExtras: ConfiguracoesExtrasPerfil = {
      turnoFixo,
      coberturaTemporaria: coberturaAtiva && coberturaSetor && coberturaInicio && coberturaFim
        ? { setor: coberturaSetor, inicio: coberturaInicio, fim: coberturaFim }
        : null,
    };
    const setoresPermitidos = livreGeral ? [SETOR_LIVRE] : setoresSelecionados;

    try {
      if (usuario) {
        await editar.mutateAsync({
          id: usuario.id,
          nomeCompleto: nomeCompleto.trim(),
          nivelAcesso,
          setoresPermitidos,
          emailAlerta: emailAlerta.trim() || null,
          configuracoesExtras,
        });
        dialog.sucesso("Colaborador atualizado com sucesso.");
      } else {
        await criar.mutateAsync({
          nomeCompleto: nomeCompleto.trim(),
          nomeUsuario: nomeUsuario.trim(),
          matricula: matricula.trim(),
          senha,
          nivelAcesso,
          setoresPermitidos,
          emailAlerta: emailAlerta.trim() || null,
          configuracoesExtras,
        });
        dialog.sucesso("Colaborador cadastrado com sucesso.");
      }
      onClose();
    } catch (erro) {
      dialog.erro(erro, "Falha ao salvar colaborador");
    }
  }

  const salvando = criar.isPending || editar.isPending;

  return (
    <ModalShell
      titulo={usuario ? "Editar Colaborador" : "Cadastrar Colaborador"}
      onClose={onClose}
      largura="max-w-2xl"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="nome-completo">Nome Completo</Label>
          <Input id="nome-completo" value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nome-usuario">Usuário de Login</Label>
          <Input
            id="nome-usuario"
            value={nomeUsuario}
            disabled={!!usuario}
            onChange={(e) => setNomeUsuario(e.target.value.replace(/\s+/g, ""))}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="matricula">Matrícula</Label>
          <Input id="matricula" value={matricula} disabled={!!usuario} onChange={(e) => setMatricula(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-alerta">E-mail Real para Alertas</Label>
          <Input id="email-alerta" type="email" value={emailAlerta} onChange={(e) => setEmailAlerta(e.target.value)} placeholder="opcional" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha-primaria">Senha Primária</Label>
          <Input
            id="senha-primaria"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={usuario ? "Deixe em branco para manter a atual" : ""}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="perfil-conta">Perfil da Conta</Label>
          <Select id="perfil-conta" value={nivelAcesso} onChange={(e) => setNivelAcesso(e.target.value as NivelAcesso)}>
            {PERFIS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Setores Vinculados</Label>
          <div className="rounded-md border border-hairline p-3">
            <label className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
              <input type="checkbox" checked={livreGeral} onChange={(e) => setLivreGeral(e.target.checked)} />
              Supervisor/Livre (Acesso Geral)
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(setoresDisponiveis ?? []).map((setor) => (
                <label key={setor} className={`flex items-center gap-1.5 text-sm ${livreGeral ? "opacity-40" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={livreGeral}
                    checked={setoresSelecionados.includes(setor)}
                    onChange={() => alternarSetor(setor)}
                  />
                  {setor}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="turno-fixo">Turno Fixo Vinculado</Label>
          <Select id="turno-fixo" value={turnoFixo} onChange={(e) => setTurnoFixo(e.target.value as typeof turnoFixo)}>
            <option value="Turno 1">Turno 1</option>
            <option value="Turno 2">Turno 2</option>
            <option value="Ambos">Cobertura/Ferista (Ambos)</option>
          </Select>
        </div>

        <div className="space-y-2 rounded-md border border-dashed border-warning/50 p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={coberturaAtiva} onChange={(e) => setCoberturaAtiva(e.target.checked)} />
            Este monitor cobrirá horário de almoço/ausência noutro setor temporariamente?
          </label>
          {coberturaAtiva && (
            <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-3">
              <Select value={coberturaSetor} onChange={(e) => setCoberturaSetor(e.target.value)}>
                <option value="">Setor a cobrir…</option>
                {(setoresDisponiveis ?? []).map((setor) => (
                  <option key={setor} value={setor}>
                    {setor}
                  </option>
                ))}
              </Select>
              <Input type="time" value={coberturaInicio} onChange={(e) => setCoberturaInicio(e.target.value)} />
              <Input type="time" value={coberturaFim} onChange={(e) => setCoberturaFim(e.target.value)} />
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
