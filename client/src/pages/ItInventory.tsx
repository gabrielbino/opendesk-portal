import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Plus, Search, Package, Network, Edit2,
  Loader2, Box, CheckCircle2, Wrench, Trash2, ArrowRightLeft,
  Filter, X,
} from "lucide-react";
import PanelHeader from "@/components/PanelHeader";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import CreateItInventoryItemModal from "@/components/CreateItInventoryItemModal";
import EditItInventoryItemModal from "@/components/EditItInventoryItemModal";
import { MapaInventario } from "@/components/inventario-mapa/MapaInventario";
import { useAuth } from "@/_core/hooks/useAuth";
import { motion } from "framer-motion";

const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  "Disponível":  { label: "Disponível",  className: "bg-emerald-50 text-emerald-500 border-emerald-200", icon: <CheckCircle2 size={11} /> },
  "Em Uso":      { label: "Em Uso",      className: "bg-blue-50 text-blue-500 border-blue-200",         icon: <Box size={11} /> },
  "Manutenção":  { label: "Manutenção",  className: "bg-amber-50 text-amber-500 border-amber-200",      icon: <Wrench size={11} /> },
  "Descartado":  { label: "Descartado",  className: "bg-red-50 text-red-500 border-red-200",            icon: <Trash2 size={11} /> },
  "Emprestado":  { label: "Emprestado",  className: "bg-violet-50 text-violet-700 border-violet-200",   icon: <ArrowRightLeft size={11} /> },
};

export default function ItInventory() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<"inventory" | "mapa">("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");

  // Estabilizar o input da query para evitar re-renders infinitos
  const queryInput = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter : undefined,
    categoryId: categoryFilter !== "all" ? parseInt(categoryFilter) : undefined,
    search: searchTerm || undefined,
    tag: tagFilter || undefined,
    sector: sectorFilter || undefined,
    responsible: responsibleFilter || undefined,
  }), [statusFilter, categoryFilter, searchTerm, tagFilter, sectorFilter, responsibleFilter]);

  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = trpc.itInventory.items.list.useQuery(queryInput);

  const { data: categories = [] } = trpc.itInventory.categories.list.useQuery();
  const { data: stats = { total: 0, available: 0, inUse: 0, maintenance: 0, discarded: 0, borrowed: 0 } } =
    trpc.itInventory.stats.summary.useQuery();

  const statCards = [
    { label: "Total",       value: stats.total,       color: "text-foreground",       bg: "bg-muted/50" },
    { label: "Disponíveis", value: stats.available,    color: "text-emerald-500",      bg: "bg-emerald-50" },
    { label: "Em Uso",      value: stats.inUse,        color: "text-blue-500",         bg: "bg-blue-50" },
    { label: "Manutenção",  value: stats.maintenance,  color: "text-amber-500",        bg: "bg-amber-50" },
    { label: "Descartados", value: stats.discarded,    color: "text-red-500",          bg: "bg-red-50" },
  ];

  const hasActiveFilters = tagFilter || sectorFilter || responsibleFilter || statusFilter !== "all" || categoryFilter !== "all";

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setTagFilter("");
    setSectorFilter("");
    setResponsibleFilter("");
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-[var(--background)]">

      {/* ── Header ── */}
      <header className="shrink-0 bg-[var(--background)]">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] px-4 py-3 sm:px-6 lg:px-8">
          <PanelHeader
            onBack={() => setLocation("/dashboard")}
            backLabel="Portal"
            icon={Package}
            title="Almoxarifado de TI"
            subtitle="Mapeamento de equipamentos"
            color="emerald"
            tabs={[
              { value: "inventory", label: "Equipamentos", icon: <Package size={14} /> },
              { value: "mapa", label: "Mapa de Inventário", icon: <Network size={14} /> },
            ]}
            activeTab={activeTab}
            onTabChange={(v) => setActiveTab(v as "inventory" | "mapa")}
            tabsClassName="sm:max-w-md"
            actions={
              activeTab === "inventory" ? (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
                >
                  <Plus size={15} />
                  <span className="hidden sm:inline">Novo Equipamento</span>
                  <span className="sm:hidden">Novo</span>
                </button>
              ) : undefined
            }
          />
        </div>
      </header>

      {/* ── Body ── */}
      {activeTab === "mapa" ? (
        <div className="min-h-0 flex-1">
          <div className="mx-auto h-full max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] px-4 py-4 sm:px-6 lg:px-8">
            <div className="h-full overflow-hidden rounded-xl border border-border">
              <MapaInventario />
            </div>
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >

            {/* ── Inventory Tab ── */}
            {activeTab === "inventory" && (
              <div className="space-y-5">

                {/* Stats */}
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {statCards.map(s => (
                    <div key={s.label} className={`rounded-xl border border-border ${s.bg} p-4`}>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Search & Filters */}
                <div className="space-y-3">
                  {/* Main search row */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Buscar por nome, TAG, setor, responsável..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground focus:ring-ring/50"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-44 bg-card border-border text-foreground">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os Status</SelectItem>
                        <SelectItem value="Disponível">Disponível</SelectItem>
                        <SelectItem value="Em Uso">Em Uso</SelectItem>
                        <SelectItem value="Manutenção">Manutenção</SelectItem>
                        <SelectItem value="Descartado">Descartado</SelectItem>
                        <SelectItem value="Emprestado">Emprestado</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all shrink-0 ${
                        showAdvancedFilters || hasActiveFilters
                          ? "border-primary/50 bg-primary/5 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Filter size={14} />
                      Filtros
                      {hasActiveFilters && (
                        <span className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  </div>

                  {/* Advanced filters row */}
                  {showAdvancedFilters && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-card/50"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">TAG</Label>
                        <Input
                          placeholder="Filtrar por TAG..."
                          value={tagFilter}
                          onChange={e => setTagFilter(e.target.value)}
                          className="h-9 text-sm bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Setor</Label>
                        <Input
                          placeholder="Filtrar por setor..."
                          value={sectorFilter}
                          onChange={e => setSectorFilter(e.target.value)}
                          className="h-9 text-sm bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Responsável</Label>
                        <Input
                          placeholder="Filtrar por responsável..."
                          value={responsibleFilter}
                          onChange={e => setResponsibleFilter(e.target.value)}
                          className="h-9 text-sm bg-background border-border"
                        />
                      </div>
                      {hasActiveFilters && (
                        <div className="sm:col-span-3 flex justify-end">
                          <button
                            onClick={clearAllFilters}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X size={12} />
                            Limpar todos os filtros
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Items grid */}
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <Package size={24} className="text-muted-foreground" />
                    </div>
                    <p className="text-foreground font-medium">Nenhum equipamento encontrado</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchTerm || hasActiveFilters
                        ? "Tente ajustar os filtros"
                        : "Adicione o primeiro equipamento ao inventário"}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className="mt-3 text-sm text-primary hover:underline"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {items.length} equipamento{items.length !== 1 ? "s" : ""} encontrado{items.length !== 1 ? "s" : ""}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {items.map((item, index) => {
                        const sc = statusConfig[item.status] || statusConfig["Disponível"];
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04, duration: 0.25 }}
                            className="group rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all overflow-hidden cursor-pointer"
                            onClick={() => { setEditingItemId(item.id); setShowEditModal(true); }}
                          >
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${sc.className}`}>
                                  {sc.icon}
                                  {sc.label}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {item.tag || item.itemId}
                                </span>
                              </div>

                              <h3 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                                {item.name}
                              </h3>

                              <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-3 mt-3">
                                {item.sector && (
                                  <div className="flex justify-between gap-2">
                                    <span className="font-medium text-foreground/70">Setor</span>
                                    <span className="truncate">{item.sector}</span>
                                  </div>
                                )}
                                {item.responsible && (
                                  <div className="flex justify-between gap-2">
                                    <span className="font-medium text-foreground/70">Responsável</span>
                                    <span className="truncate">{item.responsible}</span>
                                  </div>
                                )}
                                {item.location && (
                                  <div className="flex justify-between gap-2">
                                    <span className="font-medium text-foreground/70">Local</span>
                                    <span className="truncate">{item.location}</span>
                                  </div>
                                )}
                                <div className="pt-1 text-[11px] text-muted-foreground/60">
                                  Criado em {format(new Date(item.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                                  {item.updatedAt !== item.createdAt && (
                                    <> | Atualizado em {format(new Date(item.updatedAt), "dd/MM/yyyy", { locale: ptBR })}</>
                                  )}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
      )}

      {/* ── Modals ── */}
      <CreateItInventoryItemModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        categories={categories as any}
        onSuccess={() => refetchItems()}
      />
      <EditItInventoryItemModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        itemId={editingItemId}
        onSuccess={() => { refetchItems(); setEditingItemId(null); }}
      />
    </div>
  );
}
