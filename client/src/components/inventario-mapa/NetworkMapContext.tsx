/**
 * Estado do Mapa de Inventário: reducer de domínio (áreas/setores/equipamentos)
 * com histórico (undo/redo), hidratado a partir do tRPC `snapshot` e persistido
 * de forma otimista. Edições granulares usam mutations por entidade; undo/redo
 * e importação de JSON regravam o mapa inteiro via `replaceAll`.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type {
  Area,
  Equipment,
  EquipmentStatus,
  EquipmentType,
  MapaSnapshot,
  Position,
  Setor,
} from "@shared/inventarioMapa";

interface MapState {
  equipments: Equipment[];
  setores: Setor[];
  areas: Area[];
}

interface HistoryState {
  past: MapState[];
  present: MapState;
  future: MapState[];
}

type DomainAction =
  | { type: "ADD_EQUIPMENT"; payload: Equipment }
  | { type: "ADD_EQUIPMENTS"; payload: Equipment[] }
  | { type: "UPDATE_EQUIPMENT"; payload: { id: string; data: Partial<Equipment> } }
  | { type: "DELETE_EQUIPMENT"; payload: { id: string } }
  | { type: "UPDATE_POSITION"; payload: { id: string; posicao: Position } }
  | { type: "REPARENT_EQUIPMENT"; payload: { id: string; setorId: string | null; posicao: Position } }
  | { type: "ADD_SETOR"; payload: Setor }
  | { type: "UPDATE_SETOR"; payload: { id: string; data: Partial<Setor> } }
  | { type: "DELETE_SETOR"; payload: { id: string } }
  | { type: "REPARENT_SETOR"; payload: { id: string; areaId: string | null; posicao: Position } }
  | { type: "ADD_AREA"; payload: Area }
  | { type: "UPDATE_AREA"; payload: { id: string; data: Partial<Area> } }
  | { type: "DELETE_AREA"; payload: { id: string } }
  | { type: "IMPORT_PROJECT"; payload: MapState };

type HistoryAction = DomainAction | { type: "UNDO" } | { type: "REDO" } | { type: "HYDRATE"; payload: MapState };

const EMPTY: MapState = { equipments: [], setores: [], areas: [] };

function domainReducer(state: MapState, action: DomainAction): MapState {
  switch (action.type) {
    case "ADD_EQUIPMENT":
      return { ...state, equipments: [...state.equipments, action.payload] };
    case "ADD_EQUIPMENTS":
      return { ...state, equipments: [...state.equipments, ...action.payload] };
    case "UPDATE_EQUIPMENT": {
      const { id, data } = action.payload;
      return {
        ...state,
        equipments: state.equipments.map((eq) => (eq.id === id ? { ...eq, ...data } : eq)),
      };
    }
    case "DELETE_EQUIPMENT":
      return { ...state, equipments: state.equipments.filter((eq) => eq.id !== action.payload.id) };
    case "UPDATE_POSITION": {
      const { id, posicao } = action.payload;
      return {
        ...state,
        equipments: state.equipments.map((eq) => (eq.id === id ? { ...eq, posicao } : eq)),
      };
    }
    case "REPARENT_EQUIPMENT": {
      const { id, setorId, posicao } = action.payload;
      return {
        ...state,
        equipments: state.equipments.map((eq) => (eq.id === id ? { ...eq, setorId, posicao } : eq)),
      };
    }
    case "ADD_SETOR":
      return { ...state, setores: [...state.setores, action.payload] };
    case "UPDATE_SETOR": {
      const { id, data } = action.payload;
      return { ...state, setores: state.setores.map((s) => (s.id === id ? { ...s, ...data } : s)) };
    }
    case "DELETE_SETOR": {
      const { id } = action.payload;
      const setor = state.setores.find((s) => s.id === id);
      return {
        ...state,
        setores: state.setores.filter((s) => s.id !== id),
        // Equipamentos do setor ficam soltos com posição convertida p/ absoluta.
        equipments: state.equipments.map((eq) => {
          if (eq.setorId !== id) return eq;
          return {
            ...eq,
            setorId: null,
            posicao: setor
              ? { x: eq.posicao.x + setor.posicao.x, y: eq.posicao.y + setor.posicao.y }
              : eq.posicao,
          };
        }),
      };
    }
    case "REPARENT_SETOR": {
      const { id, areaId, posicao } = action.payload;
      return { ...state, setores: state.setores.map((s) => (s.id === id ? { ...s, areaId, posicao } : s)) };
    }
    case "ADD_AREA":
      return { ...state, areas: [...state.areas, action.payload] };
    case "UPDATE_AREA": {
      const { id, data } = action.payload;
      return { ...state, areas: state.areas.map((a) => (a.id === id ? { ...a, ...data } : a)) };
    }
    case "DELETE_AREA": {
      const { id } = action.payload;
      const area = state.areas.find((a) => a.id === id);
      return {
        ...state,
        areas: state.areas.filter((a) => a.id !== id),
        // Setores da área ficam soltos com posição convertida p/ absoluta.
        setores: state.setores.map((s) => {
          if (s.areaId !== id) return s;
          return {
            ...s,
            areaId: null,
            posicao: area
              ? { x: s.posicao.x + area.posicao.x, y: s.posicao.y + area.posicao.y }
              : s.posicao,
          };
        }),
      };
    }
    case "IMPORT_PROJECT":
      return action.payload;
    default:
      return state;
  }
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "HYDRATE") return { past: [], present: action.payload, future: [] };
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
  }
  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
  }
  const newPresent = domainReducer(state.present, action);
  if (newPresent === state.present) return state;
  return { past: [...state.past, state.present], present: newPresent, future: [] };
}

function stateToSnapshot(s: MapState): MapaSnapshot {
  return { areas: s.areas, setores: s.setores, equipamentos: s.equipments };
}

interface Filters {
  tipos: EquipmentType[];
  status: EquipmentStatus[];
}

interface NetworkMapContextValue {
  equipments: Equipment[];
  setores: Setor[];
  areas: Area[];
  filteredEquipments: Equipment[];
  filteredEquipmentIds: Set<string>;

  selectedEquipmentId: string | null;
  setSelectedEquipmentId: (id: string | null) => void;

  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;

  addEquipment: (equipment: Equipment) => void;
  addEquipments: (equipments: Equipment[]) => void;
  updateEquipment: (id: string, data: Partial<Equipment>) => void;
  deleteEquipment: (id: string) => void;
  updatePosition: (id: string, posicao: Position) => void;
  reparentEquipment: (id: string, setorId: string | null, posicao: Position) => void;

  addSetor: (setor: Setor) => void;
  updateSetor: (id: string, data: Partial<Setor>) => void;
  deleteSetor: (id: string) => void;
  reparentSetor: (id: string, areaId: string | null, posicao: Position) => void;

  addArea: (area: Area) => void;
  updateArea: (id: string, data: Partial<Area>) => void;
  deleteArea: (id: string) => void;

  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;

  importProject: (snap: MapaSnapshot) => void;
  snapshot: () => MapaSnapshot;

  isLoading: boolean;
  isSaving: boolean;
}

const NetworkMapContext = createContext<NetworkMapContextValue | undefined>(undefined);

export function NetworkMapProvider({ children }: { children: React.ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: EMPTY, future: [] });
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<Filters>({ tipos: [], status: [] });
  const [hydrated, setHydrated] = useState(false);

  const { equipments, setores, areas } = history.present;

  // Mantém a última versão do histórico acessível dentro dos callbacks (undo/redo).
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);

  const utils = trpc.useUtils();
  const snapshotQuery = trpc.inventarioMapa.snapshot.useQuery(undefined, { staleTime: Infinity });

  // Hidrata o reducer quando o snapshot chega do servidor.
  useEffect(() => {
    if (snapshotQuery.data && !hydrated) {
      dispatch({
        type: "HYDRATE",
        payload: {
          areas: snapshotQuery.data.areas,
          setores: snapshotQuery.data.setores,
          equipments: snapshotQuery.data.equipamentos,
        },
      });
      setHydrated(true);
    }
  }, [snapshotQuery.data, hydrated]);

  // Mantém o cache do snapshot espelhando o estado de trabalho. Como o
  // provider desmonta ao trocar de aba/módulo e o query usa staleTime: Infinity,
  // sem isto o remount re-hidrataria do snapshot do 1º carregamento (dados
  // desatualizados). Espelhando aqui, ao voltar o mapa já carrega as últimas
  // alterações — sem requisição extra nem hard reload.
  useEffect(() => {
    if (!hydrated) return;
    utils.inventarioMapa.snapshot.setData(undefined, { areas, setores, equipamentos: equipments });
  }, [areas, setores, equipments, hydrated, utils]);

  // Mutations
  const mArea = {
    create: trpc.inventarioMapa.areas.create.useMutation(),
    update: trpc.inventarioMapa.areas.update.useMutation(),
    delete: trpc.inventarioMapa.areas.delete.useMutation(),
  };
  const mSetor = {
    create: trpc.inventarioMapa.setores.create.useMutation(),
    update: trpc.inventarioMapa.setores.update.useMutation(),
    reparent: trpc.inventarioMapa.setores.reparent.useMutation(),
    delete: trpc.inventarioMapa.setores.delete.useMutation(),
  };
  const mEquip = {
    create: trpc.inventarioMapa.equipamentos.create.useMutation(),
    bulkCreate: trpc.inventarioMapa.equipamentos.bulkCreate.useMutation(),
    update: trpc.inventarioMapa.equipamentos.update.useMutation(),
    reparent: trpc.inventarioMapa.equipamentos.reparent.useMutation(),
    delete: trpc.inventarioMapa.equipamentos.delete.useMutation(),
  };
  const mReplaceAll = trpc.inventarioMapa.replaceAll.useMutation();

  const isSaving =
    mArea.create.isPending || mArea.update.isPending || mArea.delete.isPending ||
    mSetor.create.isPending || mSetor.update.isPending || mSetor.reparent.isPending || mSetor.delete.isPending ||
    mEquip.create.isPending || mEquip.bulkCreate.isPending || mEquip.update.isPending ||
    mEquip.reparent.isPending || mEquip.delete.isPending || mReplaceAll.isPending;

  // Ressincroniza o reducer com o servidor após uma falha de gravação.
  const resync = useCallback(async () => {
    const fresh = await utils.inventarioMapa.snapshot.fetch();
    dispatch({
      type: "HYDRATE",
      payload: { areas: fresh.areas, setores: fresh.setores, equipments: fresh.equipamentos },
    });
  }, [utils]);

  const persist = useCallback(
    (p: Promise<unknown>, msgErro: string) => {
      p.catch(() => {
        toast.error(msgErro + " As alterações foram revertidas.");
        void resync();
      });
    },
    [resync],
  );

  // ── Equipamentos ──
  const addEquipment = useCallback((equipment: Equipment) => {
    dispatch({ type: "ADD_EQUIPMENT", payload: equipment });
    persist(mEquip.create.mutateAsync(equipment), "Falha ao adicionar o computador.");
  }, [persist, mEquip.create]);

  const addEquipments = useCallback((list: Equipment[]) => {
    if (!list.length) return;
    dispatch({ type: "ADD_EQUIPMENTS", payload: list });
    persist(mEquip.bulkCreate.mutateAsync({ equipamentos: list }), "Falha ao importar os computadores.");
  }, [persist, mEquip.bulkCreate]);

  const updateEquipment = useCallback((id: string, data: Partial<Equipment>) => {
    dispatch({ type: "UPDATE_EQUIPMENT", payload: { id, data } });
    persist(mEquip.update.mutateAsync({ id, data }), "Falha ao atualizar o computador.");
  }, [persist, mEquip.update]);

  const deleteEquipment = useCallback((id: string) => {
    dispatch({ type: "DELETE_EQUIPMENT", payload: { id } });
    setSelectedEquipmentId((cur) => (cur === id ? null : cur));
    persist(mEquip.delete.mutateAsync({ id }), "Falha ao excluir o computador.");
  }, [persist, mEquip.delete]);

  const updatePosition = useCallback((id: string, posicao: Position) => {
    dispatch({ type: "UPDATE_POSITION", payload: { id, posicao } });
    persist(mEquip.update.mutateAsync({ id, data: { posicao } }), "Falha ao mover o computador.");
  }, [persist, mEquip.update]);

  const reparentEquipment = useCallback((id: string, setorId: string | null, posicao: Position) => {
    dispatch({ type: "REPARENT_EQUIPMENT", payload: { id, setorId, posicao } });
    persist(mEquip.reparent.mutateAsync({ id, setorId, posicao }), "Falha ao mover o computador de setor.");
  }, [persist, mEquip.reparent]);

  // ── Setores ──
  const addSetor = useCallback((setor: Setor) => {
    dispatch({ type: "ADD_SETOR", payload: setor });
    persist(mSetor.create.mutateAsync(setor), "Falha ao criar o setor.");
  }, [persist, mSetor.create]);

  const updateSetor = useCallback((id: string, data: Partial<Setor>) => {
    dispatch({ type: "UPDATE_SETOR", payload: { id, data } });
    persist(mSetor.update.mutateAsync({ id, data }), "Falha ao atualizar o setor.");
  }, [persist, mSetor.update]);

  const deleteSetor = useCallback((id: string) => {
    dispatch({ type: "DELETE_SETOR", payload: { id } });
    persist(mSetor.delete.mutateAsync({ id }), "Falha ao excluir o setor.");
  }, [persist, mSetor.delete]);

  const reparentSetor = useCallback((id: string, areaId: string | null, posicao: Position) => {
    dispatch({ type: "REPARENT_SETOR", payload: { id, areaId, posicao } });
    persist(mSetor.reparent.mutateAsync({ id, areaId, posicao }), "Falha ao mover o setor.");
  }, [persist, mSetor.reparent]);

  // ── Áreas ──
  const addArea = useCallback((area: Area) => {
    dispatch({ type: "ADD_AREA", payload: area });
    persist(mArea.create.mutateAsync(area), "Falha ao criar a área.");
  }, [persist, mArea.create]);

  const updateArea = useCallback((id: string, data: Partial<Area>) => {
    dispatch({ type: "UPDATE_AREA", payload: { id, data } });
    persist(mArea.update.mutateAsync({ id, data }), "Falha ao atualizar a área.");
  }, [persist, mArea.update]);

  const deleteArea = useCallback((id: string) => {
    dispatch({ type: "DELETE_AREA", payload: { id } });
    persist(mArea.delete.mutateAsync({ id }), "Falha ao excluir a área.");
  }, [persist, mArea.delete]);

  // ── Undo / Redo / Import (regravam o mapa inteiro) ──
  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const previous = h.past[h.past.length - 1];
    dispatch({ type: "UNDO" });
    persist(mReplaceAll.mutateAsync(stateToSnapshot(previous)), "Falha ao desfazer.");
  }, [persist, mReplaceAll]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future[0];
    dispatch({ type: "REDO" });
    persist(mReplaceAll.mutateAsync(stateToSnapshot(next)), "Falha ao refazer.");
  }, [persist, mReplaceAll]);

  const importProject = useCallback((snap: MapaSnapshot) => {
    const payload: MapState = { areas: snap.areas, setores: snap.setores, equipments: snap.equipamentos };
    dispatch({ type: "IMPORT_PROJECT", payload });
    setSelectedEquipmentId(null);
    persist(mReplaceAll.mutateAsync(snap), "Falha ao importar o projeto.");
  }, [persist, mReplaceAll]);

  const snapshot = useCallback(() => stateToSnapshot(historyRef.current.present), []);

  // ── Filtros / busca ──
  const filteredEquipmentIds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const ids = equipments
      .filter((eq) => {
        const matchesTerm =
          term.length === 0 ||
          eq.geral.nome.toLowerCase().includes(term) ||
          eq.geral.patrimonio.toLowerCase().includes(term) ||
          eq.geral.responsavel.toLowerCase().includes(term) ||
          eq.geral.departamento.toLowerCase().includes(term) ||
          eq.geral.mac.toLowerCase().includes(term);
        const matchesTipo = filters.tipos.length === 0 || filters.tipos.includes(eq.tipo);
        const matchesStatus = filters.status.length === 0 || filters.status.includes(eq.geral.status);
        return matchesTerm && matchesTipo && matchesStatus;
      })
      .map((eq) => eq.id);
    return new Set(ids);
  }, [equipments, searchTerm, filters]);

  const filteredEquipments = useMemo(
    () => equipments.filter((eq) => filteredEquipmentIds.has(eq.id)),
    [equipments, filteredEquipmentIds],
  );

  const value: NetworkMapContextValue = {
    equipments,
    setores,
    areas,
    filteredEquipments,
    filteredEquipmentIds,
    selectedEquipmentId,
    setSelectedEquipmentId,
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    addEquipment,
    addEquipments,
    updateEquipment,
    deleteEquipment,
    updatePosition,
    reparentEquipment,
    addSetor,
    updateSetor,
    deleteSetor,
    reparentSetor,
    addArea,
    updateArea,
    deleteArea,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
    importProject,
    snapshot,
    isLoading: snapshotQuery.isLoading,
    isSaving,
  };

  return <NetworkMapContext.Provider value={value}>{children}</NetworkMapContext.Provider>;
}

export function useNetworkMap() {
  const ctx = useContext(NetworkMapContext);
  if (!ctx) throw new Error("useNetworkMap deve ser usado dentro de NetworkMapProvider");
  return ctx;
}
