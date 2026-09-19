import { Link } from "react-router-dom";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/shared/ui/button";

/** Rota separada acionada por "Ferramentas → Melhoria Contínua" (Painel de Gestão). Não existe
 * ainda um módulo de CAPA/melhoria contínua neste projeto — esta página é um placeholder
 * honesto até que esse módulo seja especificado e construído, em vez de deixar o botão sem
 * destino algum. */
export function MelhoriaContinuaPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <TrendingUp className="mx-auto h-10 w-10 text-primary" />
      <h1 className="text-xl font-bold text-ink">Melhoria Contínua</h1>
      <p className="text-sm text-muted-foreground">
        Este módulo (planos de ação/CAPA) ainda não foi implementado neste sistema. O campo
        "E-mail Real para Alertas" já existe no cadastro de colaboradores, pronto para quando o
        módulo de notificações de Melhoria Contínua for construído.
      </p>
      <Button asChild variant="outline">
        <Link to="/gestao">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Painel de Gestão
        </Link>
      </Button>
    </div>
  );
}
