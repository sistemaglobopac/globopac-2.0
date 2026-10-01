import { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { ensureLocalTime } from "@/modules/fichas/utils/tempo";
import {
  normalizarPlaca,
  useCargasDoDia,
  useCriarCargas,
  useCriarVeiculo,
  useExcluirCarga,
  useExcluirVeiculo,
  useVeiculos,
} from "./api";

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : (erro as { message?: string } | null)?.message ?? "Falha ao salvar.";
}

const CARGA_VAZIA = { integrado: "", aviario: "", nucleo: "", gta: "", qtd: "" };

/** Programação de abate: ADMIN_MASTER/VERIFICADOR cadastram as cargas (GTA, integrado, aviário,
 * núcleo, nº de aves) — inclusive na véspera — e os veículos por placa. O inspetor do bem-estar
 * animal escolhe a GTA e a placa ao fazer o monitoramento de recepção de aves. */
export function CargasAvesPage() {
  const hoje = ensureLocalTime(new Date().toISOString()).isoLocal;
  const [dataAbate, setDataAbate] = useState(hoje);
  const [carga, setCarga] = useState(CARGA_VAZIA);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [placa, setPlaca] = useState("");
  const [descricaoVeiculo, setDescricaoVeiculo] = useState("");
  const [erroVeiculo, setErroVeiculo] = useState<string | null>(null);

  const { data: cargas, isLoading } = useCargasDoDia(dataAbate);
  const { data: veiculos } = useVeiculos();
  const criarCargas = useCriarCargas();
  const excluirCarga = useExcluirCarga();
  const criarVeiculo = useCriarVeiculo();
  const excluirVeiculo = useExcluirVeiculo();

  const totalAves = (cargas ?? []).reduce((soma, c) => soma + c.qtd_aves, 0);

  async function adicionarCarga() {
    setErroCarga(null);
    const qtd = Number.parseInt(carga.qtd.replace(/\./g, ""), 10);
    if (!carga.integrado.trim() || !carga.aviario.trim() || !carga.gta.trim() || !(qtd > 0)) {
      setErroCarga("Informe integrado, nº do aviário, nº da GTA e a quantidade de aves.");
      return;
    }
    try {
      await criarCargas.mutateAsync([
        {
          data_abate: dataAbate,
          integrado: carga.integrado.trim(),
          aviario: carga.aviario.trim(),
          nucleo: carga.nucleo.trim(),
          gta: carga.gta.trim(),
          qtd_aves: qtd,
        },
      ]);
      // Mantém integrado/aviário/núcleo: cargas seguidas costumam ser do mesmo aviário.
      setCarga({ ...carga, gta: "", qtd: "" });
    } catch (e) {
      setErroCarga(mensagemDe(e));
    }
  }

  async function adicionarVeiculo() {
    setErroVeiculo(null);
    try {
      await criarVeiculo.mutateAsync({ placa, descricao: descricaoVeiculo });
      setPlaca("");
      setDescricaoVeiculo("");
    } catch (e) {
      setErroVeiculo(mensagemDe(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Programação de Abate — Cargas e Veículos</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre as GTAs e os aviários do abate (pode ser na véspera) e os veículos por placa. O inspetor do bem-estar animal seleciona a GTA e a
          placa no monitoramento de recepção de aves.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border p-4" data-testid="secao-cargas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-bold">Cargas do dia de abate</h2>
          <div className="space-y-1">
            <Label htmlFor="data-abate">Data do abate</Label>
            <Input id="data-abate" type="date" value={dataAbate} onChange={(e) => setDataAbate(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="carga-integrado">Integrado</Label>
            <Input id="carga-integrado" value={carga.integrado} onChange={(e) => setCarga({ ...carga, integrado: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="carga-aviario">Nº do aviário</Label>
            <Input id="carga-aviario" value={carga.aviario} onChange={(e) => setCarga({ ...carga, aviario: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="carga-nucleo">Núcleo</Label>
            <Input id="carga-nucleo" value={carga.nucleo} onChange={(e) => setCarga({ ...carga, nucleo: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="carga-gta">Nº da GTA</Label>
            <Input id="carga-gta" value={carga.gta} onChange={(e) => setCarga({ ...carga, gta: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="carga-qtd">Qtd. de aves</Label>
            <Input
              id="carga-qtd"
              inputMode="numeric"
              value={carga.qtd}
              onChange={(e) => setCarga({ ...carga, qtd: e.target.value.replace(/\D/g, "") })}
              onKeyDown={(e) => e.key === "Enter" && void adicionarCarga()}
            />
          </div>
        </div>
        {erroCarga && <p className="text-sm text-destructive">{erroCarga}</p>}
        <Button type="button" onClick={() => void adicionarCarga()} disabled={criarCargas.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar carga
        </Button>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tabela-cargas">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">GTA</th>
                <th className="pr-3">Integrado</th>
                <th className="pr-3">Aviário</th>
                <th className="pr-3">Núcleo</th>
                <th className="pr-3 text-right">Aves</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-3 text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {!isLoading && (cargas ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-muted-foreground">
                    Nenhuma carga cadastrada para esta data.
                  </td>
                </tr>
              )}
              {(cargas ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold">{c.gta}</td>
                  <td className="pr-3">{c.integrado}</td>
                  <td className="pr-3">{c.aviario}</td>
                  <td className="pr-3">{c.nucleo || "—"}</td>
                  <td className="pr-3 text-right">{c.qtd_aves.toLocaleString("pt-BR")}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      aria-label={`Excluir GTA ${c.gta}`}
                      className="text-destructive hover:opacity-70"
                      onClick={() => excluirCarga.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {(cargas ?? []).length > 0 && (
              <tfoot>
                <tr className="font-bold">
                  <td colSpan={4} className="pt-2">
                    {(cargas ?? []).length} carga(s)
                  </td>
                  <td className="pt-2 text-right">{totalAves.toLocaleString("pt-BR")}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4" data-testid="secao-veiculos">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Truck className="h-5 w-5" /> Veículos de transporte (por placa)
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="veiculo-placa">Placa</Label>
            <Input
              id="veiculo-placa"
              value={placa}
              maxLength={8}
              placeholder="ABC1D23"
              onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && void adicionarVeiculo()}
            />
          </div>
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor="veiculo-desc">Descrição (opcional)</Label>
            <Input id="veiculo-desc" value={descricaoVeiculo} onChange={(e) => setDescricaoVeiculo(e.target.value)} placeholder="Ex.: Caminhão 3 eixos — Transportadora X" />
          </div>
          <Button type="button" onClick={() => void adicionarVeiculo()} disabled={criarVeiculo.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Cadastrar veículo
          </Button>
        </div>
        {erroVeiculo && <p className="text-sm text-destructive">{erroVeiculo}</p>}
        <ul className="flex flex-wrap gap-2" data-testid="lista-veiculos">
          {(veiculos ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</li>}
          {(veiculos ?? []).map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-sm">
              <strong>{v.placa}</strong>
              {v.descricao && <span className="text-muted-foreground">{v.descricao}</span>}
              <button type="button" aria-label={`Remover ${v.placa}`} className="text-destructive hover:opacity-70" onClick={() => excluirVeiculo.mutate(v.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
