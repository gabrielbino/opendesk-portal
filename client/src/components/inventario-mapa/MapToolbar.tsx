import { useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import {
  Undo2, Redo2, Download, Upload, Plus, LayoutGrid, Boxes,
  FileJson, FileSpreadsheet, FileText, FileType, HardDriveDownload, Loader2, Check,
} from "lucide-react";
import {
  SETOR_CORES, SETOR_TAMANHO_PADRAO, AREA_CORES, AREA_TAMANHO_PADRAO,
} from "@shared/inventarioMapa";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNetworkMap } from "./NetworkMapContext";
import { createEmptyEquipment } from "./lib/emptyEquipment";
import { generateId } from "./lib/ids";
import { exportProjectJson, importProjectJson } from "./lib/projectJson";
import { parseColetas, coletaToEquipment } from "./lib/coletaImport";
import { exportExcel, exportPdf, exportDocx } from "./lib/reportExport";

const NOME_PROJETO = "inventario";

export function MapToolbar() {
  const {
    addEquipment, addEquipments, addSetor, addArea,
    equipments, setores, areas, undo, redo, canUndo, canRedo,
    importProject, snapshot, isSaving,
  } = useNetworkMap();
  const { screenToFlowPosition } = useReactFlow();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coletasInputRef = useRef<HTMLInputElement | null>(null);

  const centroDoMapa = () => {
    try {
      return screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    } catch {
      return { x: 300, y: 200 };
    }
  };

  const handleAddEquipment = () => {
    const c = centroDoMapa();
    addEquipment(
      createEmptyEquipment("Computador", {
        x: c.x + Math.round((Math.random() - 0.5) * 120),
        y: c.y + Math.round((Math.random() - 0.5) * 120),
      }),
    );
  };

  const handleAddSetor = () => {
    const c = centroDoMapa();
    addSetor({
      id: generateId("setor"),
      nome: `Novo setor ${setores.length + 1}`,
      cor: SETOR_CORES[setores.length % SETOR_CORES.length],
      areaId: null,
      posicao: { x: Math.round(c.x - SETOR_TAMANHO_PADRAO.width / 2), y: Math.round(c.y - SETOR_TAMANHO_PADRAO.height / 2) },
      tamanho: { ...SETOR_TAMANHO_PADRAO },
    });
  };

  const handleAddArea = () => {
    const c = centroDoMapa();
    addArea({
      id: generateId("area"),
      nome: `Nova área ${areas.length + 1}`,
      cor: AREA_CORES[areas.length % AREA_CORES.length],
      posicao: { x: Math.round(c.x - AREA_TAMANHO_PADRAO.width / 2), y: Math.round(c.y - AREA_TAMANHO_PADRAO.height / 2) },
      tamanho: { ...AREA_TAMANHO_PADRAO },
    });
  };

  const handleExport = (formato: "json" | "excel" | "pdf" | "docx") => {
    if (formato === "json") exportProjectJson(snapshot(), NOME_PROJETO);
    else if (formato === "excel") exportExcel(equipments, setores, areas, NOME_PROJETO);
    else if (formato === "pdf") exportPdf(equipments, setores, areas, NOME_PROJETO);
    else if (formato === "docx") void exportDocx(equipments, setores, areas, NOME_PROJETO);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importProject(await importProjectJson(file));
      toast.success("Projeto restaurado");
    } catch {
      toast.error("Não foi possível importar. Verifique se é um JSON válido exportado por este sistema.");
    } finally {
      event.target.value = "";
    }
  };

  const handleColetasChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    // Processa arquivo a arquivo: um JSON inválido não derruba os demais.
    const coletas: ReturnType<typeof parseColetas> = [];
    const falhas: string[] = [];
    await Promise.all(
      files.map(async (f) => {
        try {
          coletas.push(...parseColetas(await f.text()));
        } catch {
          falhas.push(f.name);
        }
      }),
    );

    if (coletas.length) {
      addEquipments(coletas.map((c, i) => coletaToEquipment(c, i)));
      toast.success(`${coletas.length} computador(es) importado(s) — arraste-os para os setores`);
    }
    if (falhas.length) {
      toast.error(
        `Não foi possível ler ${falhas.length} arquivo(s): ${falhas.join(", ")}. ` +
          `Verifique se é um .json válido gerado pelo coletor.`,
      );
    } else if (!coletas.length) {
      toast.error("Nenhuma coleta encontrada nos arquivos selecionados.");
    }

    event.target.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
      <Button size="sm" variant="outline" onClick={handleAddArea}>
        <Boxes size={16} className="mr-1.5" /> Nova área
      </Button>
      <Button size="sm" variant="secondary" onClick={handleAddSetor}>
        <LayoutGrid size={16} className="mr-1.5" /> Novo setor
      </Button>
      <Button size="sm" onClick={handleAddEquipment}>
        <Plus size={16} className="mr-1.5" /> <span className="hidden sm:inline">Adicionar computador</span><span className="sm:hidden">Computador</span>
      </Button>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <span className="mr-1 hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
          {isSaving ? (
            <><Loader2 size={13} className="animate-spin" /> Salvando…</>
          ) : (
            <><Check size={13} className="text-emerald-500" /> Salvo</>
          )}
        </span>

        <Button size="icon" variant="ghost" className="h-8 w-8" title="Desfazer (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 size={17} />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Refazer (Ctrl+Y)" onClick={redo} disabled={!canRedo}>
          <Redo2 size={17} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><Download size={16} className="mr-1.5" /> Exportar</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport("excel")}>
              <FileSpreadsheet size={16} className="mr-2 text-emerald-500" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("pdf")}>
              <FileText size={16} className="mr-2 text-red-500" /> PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("docx")}>
              <FileType size={16} className="mr-2 text-indigo-500" /> Word (.docx)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport("json")}>
              <FileJson size={16} className="mr-2 text-amber-500" /> JSON (backup)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline"><Upload size={16} className="mr-1.5" /> Importar</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => coletasInputRef.current?.click()}>
              <HardDriveDownload size={16} className="mr-2 text-cyan-500" /> Coletas do pendrive (.json)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <FileJson size={16} className="mr-2 text-amber-500" /> Restaurar projeto (.json)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChange} />
        <input ref={coletasInputRef} type="file" accept="application/json,.json" multiple hidden onChange={handleColetasChange} />
      </div>
    </div>
  );
}
