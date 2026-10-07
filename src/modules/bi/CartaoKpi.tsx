import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export function CartaoKpi({ titulo, valor, detalhe }: { titulo: string; valor: number | string; detalhe?: string }) {
  return (
    <Card className="glass-kpi rounded-xl border-white/65 shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-normal text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="font-mono text-[26px] font-medium leading-tight text-ink">
        {valor}
        {detalhe && <p className="mt-1 font-sans text-xs font-normal text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}
