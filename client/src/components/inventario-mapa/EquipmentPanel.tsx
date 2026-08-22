import { X, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Equipment } from "@shared/inventarioMapa";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useMobile";
import { equipmentIcons, equipmentColors, perifericoIcons, statusColors, statusLabels } from "./constants";
import { InfoField } from "./InfoField";

interface EquipmentPanelProps {
  equipment: Equipment;
  anchor: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PANEL_WIDTH = 340;

function PanelBody({ equipment, onEdit, onDelete, onClose }: Omit<EquipmentPanelProps, "anchor">) {
  const Icon = equipmentIcons[equipment.tipo];
  const color = equipmentColors[equipment.tipo];
  const { geral, perifericos } = equipment;

  return (
    <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:max-h-none">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: `${color}1A`, border: `1px solid ${color}55` }}
        >
          <Icon size={19} color={color} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{geral.nome}</p>
          <p className="text-xs text-muted-foreground">
            {equipment.tipo} ·{" "}
            <span className="font-bold" style={{ color: statusColors[geral.status] }}>
              {statusLabels[geral.status]}
            </span>
          </p>
        </div>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={onEdit}>
            <Pencil size={15} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" title="Excluir" onClick={onDelete}>
            <Trash2 size={15} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Fechar" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <InfoField label="Nome" value={geral.nome} mono={false} />
          <div>
            <span className="mb-1 block text-[10.5px] uppercase tracking-wide text-muted-foreground">Status</span>
            <span
              className="inline-block rounded-md px-2 py-0.5 text-xs font-bold"
              style={{
                background: `${statusColors[geral.status]}22`,
                color: statusColors[geral.status],
                border: `1px solid ${statusColors[geral.status]}55`,
              }}
            >
              {statusLabels[geral.status]}
            </span>
          </div>
          <InfoField label="Patrimônio" value={geral.patrimonio} />
          <InfoField label="Endereço MAC" value={geral.mac} />
          <InfoField label="Sistema Operacional" value={geral.sistemaOperacional} mono={false} />
          <InfoField label="Responsável" value={geral.responsavel} mono={false} />
          <InfoField label="Departamento" value={geral.departamento} mono={false} />
        </div>

        <div className="my-4 border-t border-border" />

        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Periféricos</span>
          <span className="text-xs text-muted-foreground">{perifericos.length}</span>
        </div>

        {perifericos.length === 0 && (
          <p className="py-0.5 text-sm text-muted-foreground">Nenhum periférico cadastrado.</p>
        )}

        <div className="flex flex-col gap-1.5">
          {perifericos.map((p) => {
            const PIcon = perifericoIcons[p.tipo];
            return (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]" style={{ background: `${color}1A` }}>
                  <PIcon size={14} color={color} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold leading-tight text-foreground">{p.tipo}</p>
                  {p.descricao && <p className="truncate text-[11px] text-muted-foreground">{p.descricao}</p>}
                </div>
                {p.patrimonio && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{p.patrimonio}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EquipmentPanel(props: EquipmentPanelProps) {
  const isMobile = useIsMobile();
  const { anchor, onClose } = props;

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-3">
          <PanelBody {...props} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: painel flutuante ancorado próximo ao clique, dentro da viewport.
  const left = Math.min(Math.max(anchor.x - PANEL_WIDTH / 2, 16), window.innerWidth - PANEL_WIDTH - 16);
  const top = Math.max(anchor.y - 470, 76);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      // z-index abaixo dos diálogos/sheets (z-50), mas acima do canvas — assim
      // os modais de editar/excluir aparecem por cima do painel.
      style={{ position: "fixed", left, top, width: PANEL_WIDTH, zIndex: 40 }}
    >
      <PanelBody {...props} />
    </motion.div>
  );
}
