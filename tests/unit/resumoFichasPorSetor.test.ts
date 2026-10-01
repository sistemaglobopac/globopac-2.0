import { describe, expect, it } from "vitest";
import { resumoFichasPorSetor, type FichaAtivaResumo } from "@/modules/bordo/api";

const ficha = (id: string, locais: string[]): FichaAtivaResumo => ({
  id,
  codigo: id.toUpperCase(),
  nome: `Ficha ${id}`,
  tipo_apontamento: "Recorrente",
  tempo_entre_apontamentos_min: 60,
  locais_aplicacao: locais,
});

describe("resumoFichasPorSetor (card Fichas Ativas)", () => {
  const turnoInicio = new Date("2026-09-30T10:00:00Z");
  const fichas = [ficha("a", ["RECEPCAO"]), ficha("b", ["RECEPCAO"]), ficha("c", ["RECEPCAO", "EXPEDICAO"]), ficha("d", ["EXPEDICAO"])];

  it("conta fichas existentes por setor e as já iniciadas NESTE turno", () => {
    const monitoramentos = [
      { ficha_template_id: "a", criado_em: "2026-09-30T11:00:00Z", setor: "RECEPCAO" },
      { ficha_template_id: "a", criado_em: "2026-09-30T12:00:00Z", setor: "RECEPCAO" }, // repetida: conta 1 ficha
      { ficha_template_id: "b", criado_em: "2026-09-30T09:00:00Z", setor: "RECEPCAO" }, // antes do turno: não conta
      { ficha_template_id: "c", criado_em: "2026-09-30T11:30:00Z", setor: "EXPEDICAO" }, // só no setor em que foi feita
    ];
    const r = resumoFichasPorSetor(fichas, monitoramentos, ["RECEPCAO", "EXPEDICAO"], turnoInicio);
    expect(r.find((x) => x.setor === "RECEPCAO")).toMatchObject({ total: 3, iniciadas: 1, idsIniciadas: ["a"] });
    expect(r.find((x) => x.setor === "EXPEDICAO")).toMatchObject({ total: 2, iniciadas: 1, idsIniciadas: ["c"] });
  });

  it("setor sem nenhuma ficha não aparece; sem monitoramentos nenhuma está iniciada", () => {
    const r = resumoFichasPorSetor(fichas, [], ["RECEPCAO", "CAMARA"], turnoInicio);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ setor: "RECEPCAO", total: 3, iniciadas: 0 });
  });
});
