import { useEffect, useState } from "react";
import { useSessionStore } from "@/store/session";
import { horaEmManaus } from "@/modules/bordo/api";
import { NIVEL_ACESSO_BADGE, NIVEL_ACESSO_ROTULO } from "./api";

function saudacaoPorHora(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function iniciaisDoNome(nomeCompleto: string): string {
  const partes = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cabeçalho escuro fixo no topo do Painel de Gestão: saudação dinâmica, avatar com iniciais,
 * data por extenso, relógio ao vivo e badge do nível de acesso — tudo em America/Manaus, igual
 * ao resto do sistema (ver horaEmManaus/inicioDoDiaManaus em bordo/api.ts). */
export function PageHeaderGestao() {
  const perfil = useSessionStore((s) => s.perfil);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const intervalo = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const horaManaus = horaEmManaus(agora);
  const relogio = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Manaus",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(agora);
  const dataExtenso = capitalizar(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Manaus",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(agora)
  );
  const primeiroNome = perfil?.nomeCompleto.trim().split(/\s+/)[0] ?? "";
  const badge = perfil ? NIVEL_ACESSO_BADGE[perfil.nivelAcesso] : null;

  return (
    <header className="rounded-2xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #1f1633, #150f23)" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
            style={{ background: "#6a5fc1" }}
            aria-hidden
          >
            {perfil ? iniciaisDoNome(perfil.nomeCompleto) : "?"}
          </div>
          <div>
            <p className="text-lg font-black text-white">
              {saudacaoPorHora(horaManaus)}, {primeiroNome}!
            </p>
            <p className="text-sm" style={{ color: "#a99bd6" }}>
              {dataExtenso}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl font-bold tabular-nums" style={{ color: "#c2ef4e" }}>
            {relogio}
          </span>
          {badge && perfil && (
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>
              {NIVEL_ACESSO_ROTULO[perfil.nivelAcesso]}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
