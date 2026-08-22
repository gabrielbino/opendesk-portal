import { Fragment, useMemo } from "react";
import { Search } from "lucide-react";
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  type Equipment,
  type EquipmentStatus,
  type EquipmentType,
} from "@shared/inventarioMapa";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNetworkMap } from "./NetworkMapContext";
import { equipmentIcons, equipmentColors, statusColors, statusLabels } from "./constants";

export function MapSidebar() {
  const {
    filteredEquipments, equipments, setores, areas,
    searchTerm, setSearchTerm, filters, setFilters,
    selectedEquipmentId, setSelectedEquipmentId,
  } = useNetworkMap();

  const { areasRender, semSetor } = useMemo(() => {
    const porSetor = new Map<string, Equipment[]>();
    const soltos: Equipment[] = [];
    filteredEquipments.forEach((eq) => {
      if (eq.setorId && setores.some((s) => s.id === eq.setorId)) {
        const lista = porSetor.get(eq.setorId) ?? [];
        lista.push(eq);
        porSetor.set(eq.setorId, lista);
      } else {
        soltos.push(eq);
      }
    });

    const setorGrupo = (s: Setor2) => ({ id: s.id, nome: s.nome, cor: s.cor, itens: porSetor.get(s.id) ?? [] });
    type Setor2 = (typeof setores)[number];

    const render: { id: string; nome: string; cor: string | null; setores: { id: string; nome: string; cor: string; itens: Equipment[] }[] }[] = [];
    areas.forEach((a) => {
      const setoresDaArea = setores.filter((s) => s.areaId === a.id).map(setorGrupo).filter((g) => g.itens.length);
      if (setoresDaArea.length) render.push({ id: a.id, nome: a.nome, cor: a.cor, setores: setoresDaArea });
    });
    const setoresSemArea = setores
      .filter((s) => !s.areaId || !areas.some((a) => a.id === s.areaId))
      .map(setorGrupo)
      .filter((g) => g.itens.length);
    if (setoresSemArea.length) render.push({ id: "__sem_area__", nome: "Sem área", cor: null, setores: setoresSemArea });

    return { areasRender: render, semSetor: soltos };
  }, [filteredEquipments, setores, areas]);

  const toggleTipo = (tipo: EquipmentType) =>
    setFilters((prev) => ({ ...prev, tipos: prev.tipos.includes(tipo) ? prev.tipos.filter((t) => t !== tipo) : [...prev.tipos, tipo] }));
  const toggleStatus = (status: EquipmentStatus) =>
    setFilters((prev) => ({ ...prev, status: prev.status.includes(status) ? prev.status.filter((s) => s !== status) : [...prev.status, status] }));

  const renderItem = (eq: Equipment) => {
    const Icon = equipmentIcons[eq.tipo];
    const color = equipmentColors[eq.tipo];
    return (
      <button
        key={eq.id}
        onClick={() => setSelectedEquipmentId(eq.id)}
        className={cn(
          "flex w-full items-center gap-2 py-2 pl-6 pr-3 text-left transition-colors hover:bg-muted/60",
          selectedEquipmentId === eq.id && "bg-muted",
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]" style={{ background: `${color}1A` }}>
          <Icon size={14} color={color} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">{eq.geral.nome}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{eq.geral.patrimonio || "—"}</span>
        </span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: statusColors[eq.geral.status] }} />
      </button>
    );
  };

  return (
    <aside className="hidden h-full w-[280px] shrink-0 flex-col border-r border-border lg:flex">
      <div className="p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, patrimônio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EQUIPMENT_TYPES.map((tipo) => {
              const ativo = filters.tipos.includes(tipo);
              return (
                <button
                  key={tipo}
                  onClick={() => toggleTipo(tipo)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: equipmentColors[tipo],
                    color: ativo ? "#0A0F1C" : equipmentColors[tipo],
                    background: ativo ? equipmentColors[tipo] : "transparent",
                  }}
                >
                  {tipo}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {EQUIPMENT_STATUSES.map((status) => {
              const ativo = filters.status.includes(status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors"
                  style={{
                    borderColor: statusColors[status],
                    color: ativo ? "#0A0F1C" : statusColors[status],
                    background: ativo ? statusColors[status] : "transparent",
                  }}
                >
                  {statusLabels[status]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Equipamentos</span>
        <span className="text-[11px] text-muted-foreground">{filteredEquipments.length}/{equipments.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {areasRender.map((area) => (
          <Fragment key={area.id}>
            <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-border bg-background px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: area.cor ?? "#94a3b8" }} />
              <span className="flex-1 truncate text-[11px] font-extrabold uppercase tracking-wide text-foreground">{area.nome}</span>
            </div>
            {area.setores.map((s) => (
              <Fragment key={s.id}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 pl-4">
                  <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: s.cor }} />
                  <span className="flex-1 truncate text-xs font-bold text-foreground">{s.nome}</span>
                  <span className="text-xs text-muted-foreground">{s.itens.length}</span>
                </div>
                {s.itens.map(renderItem)}
              </Fragment>
            ))}
          </Fragment>
        ))}

        {semSetor.length > 0 && (
          <Fragment>
            <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-border bg-background px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] bg-muted-foreground/50" />
              <span className="flex-1 truncate text-[11px] font-extrabold uppercase tracking-wide text-foreground">Sem setor</span>
              <span className="text-[11px] text-muted-foreground">{semSetor.length}</span>
            </div>
            {semSetor.map(renderItem)}
          </Fragment>
        )}

        {filteredEquipments.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum equipamento encontrado com os filtros atuais.
          </p>
        )}
      </div>
    </aside>
  );
}
