import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ModalShell } from "../ModalShell";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { usePerfisGestao } from "../api";

const VALOR_LOTE = "__LOTE__";

function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

/** Formulário de geração da Folha de Pausa (Relatório de Jornada) — Ferramenta → Folhas de
 * Pausa. Consolida horários de turno e todas as pausas do mês num layout A4 para impressão e
 * assinatura (ver RelatorioFolhaPausaPage). */
export function ModalFolhasPausa({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: perfis } = usePerfisGestao();
  const inspetores = (perfis ?? []).filter((p) => p.nivel_acesso === "INSPETOR_QUALIDADE" && p.ativo);

  const [inspetorId, setInspetorId] = useState<string>("");
  const [mes, setMes] = useState(mesAtual());

  function gerar() {
    if (!inspetorId) return;
    const params = new URLSearchParams({ mes });
    if (inspetorId === VALOR_LOTE) params.set("lote", "1");
    else params.set("inspetorId", inspetorId);
    onClose();
    navigate(`/relatorios/folha-pausa?${params.toString()}`);
  }

  return (
    <ModalShell
      titulo="Folhas de Pausa"
      onClose={onClose}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" style={{ background: "#6a5fc1", color: "#fff" }} disabled={!inspetorId} onClick={gerar}>
            Gerar relatório
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inspetor-folha">Inspetor de Qualidade</Label>
          <Select id="inspetor-folha" value={inspetorId} onChange={(e) => setInspetorId(e.target.value)}>
            <option value="">Selecione…</option>
            <option value={VALOR_LOTE}>GERAR LOTE (Todos os Inspetores)</option>
            {inspetores.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome_completo}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mes-folha">Mês de referência</Label>
          <Input id="mes-folha" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <p className="text-xs" style={{ color: "#79628c" }}>
          O relatório consolida os horários de início/fim de turno e todas as pausas (múltiplas por dia) em formato A4
          para impressão e assinatura.
        </p>
      </div>
    </ModalShell>
  );
}
