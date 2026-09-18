const TOM_KPI = {
  primary: "text-primary",
  lima: "text-lime",
  destrutivo: "text-destructive",
  alerta: "text-warning",
} as const;

interface KpiCardProps {
  tag: string;
  value: number;
  label: string;
  tom: keyof typeof TOM_KPI;
  onClick?: () => void;
}

/** Card de indicador do design system GloboPac (`kpi-card`): superfície de vidro
 * (`.glass-kpi`), chip de tag em pill, valor em mono (`number-lg`) e rótulo em caption — mesmo
 * padrão do `KpiTile` do Painel de Bordo. Componente-base para qualquer grade de KPIs. */
export function KpiCard({ tag, value, label, tom, onClick }: KpiCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-kpi rounded-xl border border-white/65 p-4 text-left shadow-md transition-transform hover:scale-[1.02]"
    >
      <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{tag}</span>
      <p className={`mt-3 font-mono text-3xl font-medium ${TOM_KPI[tom]}`}>{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </button>
  );
}
