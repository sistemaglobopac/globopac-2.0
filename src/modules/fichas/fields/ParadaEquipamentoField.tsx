import { useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { ParadaEquipamentoValor } from "./tiposCompostos";

function paraMinutos(horaTexto: string): number {
  const partes = horaTexto.split(":");
  return Number(partes[0]) * 60 + Number(partes[1]);
}

function calcularMinutos(horaParada: string, horaRetomada: string): number {
  if (!horaParada || !horaRetomada) return 0;
  const minutosParada = paraMinutos(horaParada);
  let minutosRetomada = paraMinutos(horaRetomada);
  if (minutosRetomada < minutosParada) minutosRetomada += 24 * 60; // virou o dia
  return minutosRetomada - minutosParada;
}

interface ParadaEquipamentoFieldProps {
  value: ParadaEquipamentoValor | undefined;
  onChange: (valor: ParadaEquipamentoValor) => void;
  disabled?: boolean;
}

/** Registro de Parada de Equipamento — porte do v1 (ParadaField.jsx). Sem cálculo de
 * conformidade, só o tempo total de inatividade entre parada e retomada. */
export function ParadaEquipamentoField({ value, onChange, disabled }: ParadaEquipamentoFieldProps) {
  const [horaParada, setHoraParada] = useState(value?.hora_parada ?? "");
  const [horaRetomada, setHoraRetomada] = useState(value?.hora_retomada ?? "");

  const tempoParada = calcularMinutos(horaParada, horaRetomada);

  function alterar(campo: "hora_parada" | "hora_retomada", valor: string) {
    const proximaParada = campo === "hora_parada" ? valor : horaParada;
    const proximaRetomada = campo === "hora_retomada" ? valor : horaRetomada;
    if (campo === "hora_parada") setHoraParada(valor);
    else setHoraRetomada(valor);
    onChange({ hora_parada: proximaParada, hora_retomada: proximaRetomada, tempo_minutos: calcularMinutos(proximaParada, proximaRetomada) });
  }

  return (
    <div className="mt-2 w-full space-y-4 rounded-lg border bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-2 font-bold text-warning-foreground">
        <AlertTriangle className="h-4 w-4" />
        <span>Registro de Parada de Equipamento</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Hora da Parada</Label>
          <Input type="time" disabled={disabled} value={horaParada} onChange={(e) => alterar("hora_parada", e.target.value)} className="text-center text-xl font-bold tracking-widest text-destructive" />
        </div>
        <div className="space-y-1">
          <Label>Hora da Retomada</Label>
          <Input type="time" disabled={disabled} value={horaRetomada} onChange={(e) => alterar("hora_retomada", e.target.value)} className="text-center text-xl font-bold tracking-widest text-primary" />
        </div>
      </div>

      {horaParada && horaRetomada && (
        <div className="flex items-center justify-between rounded-md border border-warning bg-warning/10 p-3">
          <span className="flex items-center gap-2 font-bold text-warning-foreground">
            <Clock className="h-4 w-4" /> Tempo Total de Inatividade:
          </span>
          <span className="text-xl font-black text-warning-foreground">
            {Math.floor(tempoParada / 60)}h {tempoParada % 60}m
          </span>
        </div>
      )}
    </div>
  );
}
