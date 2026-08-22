import "@xyflow/react/dist/style.css";
import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NetworkMapProvider, useNetworkMap } from "./NetworkMapContext";
import { MapToolbar } from "./MapToolbar";
import { MapSidebar } from "./MapSidebar";
import { MapCanvas } from "./MapCanvas";

function MapaInventarioInner() {
  const { isLoading, undo, redo } = useNetworkMap();
  const [maximized, setMaximized] = useState(false);

  // Atalhos globais do mapa (só enquanto a aba está montada): desfazer/refazer + sair da tela cheia.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && maximized) {
        setMaximized(false);
        return;
      }
      // Ignora quando o foco está num campo de texto (não sequestra o Ctrl+Z do input).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, maximized]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-[280px] shrink-0 border-r border-border p-3 lg:block">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="mt-3 h-24 w-full" />
          </div>
          <div className="flex-1 p-6">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        maximized ? "fixed inset-0 z-[60] h-screen" : "h-full",
      )}
    >
      <MapToolbar />
      <div className="flex min-h-0 flex-1">
        <MapSidebar />
        <MapCanvas maximized={maximized} onToggleMaximize={() => setMaximized((v) => !v)} />
      </div>
    </div>
  );
}

/** Aba "Mapa de Inventário" do Almoxarifado de TI. */
export function MapaInventario() {
  return (
    <NetworkMapProvider>
      <ReactFlowProvider>
        <MapaInventarioInner />
      </ReactFlowProvider>
    </NetworkMapProvider>
  );
}

export default MapaInventario;
