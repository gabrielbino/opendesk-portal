import { useMemo, useState, useRef, ChangeEvent, DragEvent, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Building2,
  Search,
  Upload,
  FileText,
  CheckCircle2,
  Calendar,
  DollarSign,
  Percent,
  Pencil,
  Trash2,
  Eye,
  Plus,
  X,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  MapPin,
  Briefcase,
  Pill,
  TrendingUp,
  Loader2,
  Handshake,
  Download,
  Clock,
  User as UserIcon,
  RotateCcw,
  History,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import PanelHeader from "@/components/PanelHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

// ==================================================================
// Tipagens
// ==================================================================
type Estado = "SC" | "RS";
type Grupo = "Associativismo" | "Farmácias";
type StatusContrato = "Vigente" | "Vencido";

interface TaxaRepasse {
  categoria: string;
  percentual: number;
}

interface Contract {
  // id é string para mocks ("c-001") e number para registros do banco
  id: string | number;
  estado: Estado;
  grupo: Grupo;
  status: StatusContrato;
  parceiro: string;
  cnpj: string;
  gatilhoMensal: number;
  vigenciaInicio: string;
  vigenciaFim: string;
  taxasRepasse: TaxaRepasse[];
  filiais: string[];
  apelidoInterno?: string | null;
  observacoes?: string | null;
  pdfFileName?: string | null;
  pdfFileUrl?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  /** Marca contratos que existem só no estado local (sem persistência) */
  isLocal?: boolean;
}

interface ScopeKey {
  estado: Estado;
  grupo: Grupo;
}

// ==================================================================
// Mock data — fallback quando o banco não está disponível
// ==================================================================
const mockContracts: Contract[] = [
  // ---- SC / Associativismo ----
  {
    id: "c-001", estado: "SC", grupo: "Associativismo", status: "Vigente",
    parceiro: "Rede Farmais Santa Catarina", cnpj: "12.345.678/0001-90",
    gatilhoMensal: 25000, vigenciaInicio: "2025-02-01", vigenciaFim: "2026-12-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "EMS", percentual: 4.5 },
      { categoria: "Eurofarma", percentual: 5 },
    ],
    filiais: ["Farmais Centro - Florianópolis", "Farmais Trindade", "Farmais Estreito", "Farmais Balneário Camboriú"],
    apelidoInterno: "FARMAIS-SC-2025", isLocal: true,
  },
  {
    id: "c-002", estado: "SC", grupo: "Associativismo", status: "Vigente",
    parceiro: "Associativismo Pharma SC", cnpj: "23.456.789/0001-12",
    gatilhoMensal: 30000, vigenciaInicio: "2025-05-10", vigenciaFim: "2027-05-09",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3.5 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Cimed", percentual: 4 },
    ],
    filiais: ["Pharma SC Joinville", "Pharma SC Blumenau", "Pharma SC Itajaí"], isLocal: true,
  },
  {
    id: "c-003", estado: "SC", grupo: "Associativismo", status: "Vencido",
    parceiro: "União Farmacêutica Catarinense", cnpj: "34.567.890/0001-34",
    gatilhoMensal: 18000, vigenciaInicio: "2023-01-15", vigenciaFim: "2024-12-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 2.5 },
      { categoria: "Geolab", percentual: 5 },
    ],
    filiais: ["UFC Lages", "UFC Criciúma"], isLocal: true,
  },
  // ---- SC / Farmácias ----
  {
    id: "c-004", estado: "SC", grupo: "Farmácias", status: "Vigente",
    parceiro: "Drogaria Catarinense Ltda.", cnpj: "45.678.901/0001-56",
    gatilhoMensal: 45000, vigenciaInicio: "2025-03-01", vigenciaFim: "2026-08-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Medley", percentual: 4.2 },
      { categoria: "Aché", percentual: 5 },
    ],
    filiais: ["DC Centro Florianópolis", "DC Beira-Mar Norte", "DC Coqueiros", "DC São José", "DC Palhoça"], isLocal: true,
  },
  {
    id: "c-005", estado: "SC", grupo: "Farmácias", status: "Vigente",
    parceiro: "Farmácias Preço Bom SC", cnpj: "56.789.012/0001-78",
    gatilhoMensal: 28000, vigenciaInicio: "2025-07-12", vigenciaFim: "2027-07-11",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3.2 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Sandoz", percentual: 4.8 },
    ],
    filiais: ["Preço Bom Chapecó", "Preço Bom Concórdia", "Preço Bom Xanxerê"], isLocal: true,
  },
  {
    id: "c-006", estado: "SC", grupo: "Farmácias", status: "Vencido",
    parceiro: "Drogaria Litoral Norte", cnpj: "67.890.123/0001-90",
    gatilhoMensal: 15000, vigenciaInicio: "2022-09-01", vigenciaFim: "2024-08-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 2.8 },
      { categoria: "Geolab", percentual: 5.5 },
    ],
    filiais: ["Litoral Norte Itapema", "Litoral Norte Porto Belo"], isLocal: true,
  },
  // ---- RS / Associativismo ----
  {
    id: "c-007", estado: "RS", grupo: "Associativismo", status: "Vigente",
    parceiro: "AFERGS - Associação Farmacêutica do RS", cnpj: "78.901.234/0001-12",
    gatilhoMensal: 50000, vigenciaInicio: "2025-01-20", vigenciaFim: "2026-12-19",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "OpenDesk Distribuição", percentual: 2 },
      { categoria: "EMS", percentual: 4.5 },
    ],
    filiais: ["AFERGS Porto Alegre", "AFERGS Canoas", "AFERGS Gravataí", "AFERGS Novo Hamburgo", "AFERGS Caxias do Sul"], isLocal: true,
  },
  {
    id: "c-008", estado: "RS", grupo: "Associativismo", status: "Vigente",
    parceiro: "Rede Associativa Gaúcha de Farmácias", cnpj: "89.012.345/0001-34",
    gatilhoMensal: 35000, vigenciaInicio: "2025-04-05", vigenciaFim: "2027-04-04",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3.5 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Eurofarma", percentual: 5 },
    ],
    filiais: ["RAG Santa Maria", "RAG Pelotas", "RAG Passo Fundo"], isLocal: true,
  },
  {
    id: "c-009", estado: "RS", grupo: "Associativismo", status: "Vencido",
    parceiro: "Cooperativa Pharma Sul", cnpj: "90.123.456/0001-56",
    gatilhoMensal: 22000, vigenciaInicio: "2022-06-01", vigenciaFim: "2024-05-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 2.5 },
      { categoria: "Geolab", percentual: 5 },
    ],
    filiais: ["Pharma Sul Bagé", "Pharma Sul Uruguaiana"], isLocal: true,
  },
  // ---- RS / Farmácias ----
  {
    id: "c-010", estado: "RS", grupo: "Farmácias", status: "Vigente",
    parceiro: "Panvel Farmácias", cnpj: "01.234.567/0001-78",
    gatilhoMensal: 80000, vigenciaInicio: "2025-02-10", vigenciaFim: "2027-02-09",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Medley", percentual: 4.2 },
      { categoria: "Aché", percentual: 5 },
      { categoria: "Cimed", percentual: 4 },
    ],
    filiais: ["Panvel Moinhos de Vento", "Panvel Menino Deus", "Panvel Bom Fim", "Panvel Zona Sul", "Panvel Cidade Baixa", "Panvel Praia de Belas"], isLocal: true,
  },
  {
    id: "c-011", estado: "RS", grupo: "Farmácias", status: "Vigente",
    parceiro: "Farmácias São João", cnpj: "11.222.333/0001-90",
    gatilhoMensal: 65000, vigenciaInicio: "2025-06-01", vigenciaFim: "2027-05-31",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 3.2 },
      { categoria: "Geolab", percentual: 6 },
      { categoria: "Sandoz", percentual: 4.8 },
      { categoria: "EMS", percentual: 4.5 },
    ],
    filiais: ["São João Centro POA", "São João Cachoeirinha", "São João Sapucaia do Sul", "São João Esteio"], isLocal: true,
  },
  {
    id: "c-012", estado: "RS", grupo: "Farmácias", status: "Vencido",
    parceiro: "Drogaria Serrana RS", cnpj: "22.333.444/0001-12",
    gatilhoMensal: 19000, vigenciaInicio: "2023-03-01", vigenciaFim: "2025-02-28",
    taxasRepasse: [
      { categoria: "Genéricos", percentual: 2.8 },
      { categoria: "Geolab", percentual: 5.5 },
    ],
    filiais: ["Serrana Gramado", "Serrana Canela", "Serrana Nova Petrópolis"], isLocal: true,
  },
];

// ==================================================================
// Helpers
// ==================================================================
const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const formatDateTime = (ms?: number | null) => {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

/** Diferença em dias entre hoje e a data (negativo = passado). */
const daysFromToday = (iso: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const scopeIcon = (grupo: Grupo) => (grupo === "Associativismo" ? Briefcase : Pill);

const cleanDigits = (s: string) => s.replace(/\D/g, "");

/** Converte DTO do banco para o formato da UI. */
function dbToUi(d: any): Contract {
  return {
    id: d.id,
    estado: d.estado,
    grupo: d.grupo,
    status: d.status,
    parceiro: d.parceiro,
    cnpj: d.cnpj,
    gatilhoMensal: Number(d.gatilhoMensal),
    vigenciaInicio: d.vigenciaInicio,
    vigenciaFim: d.vigenciaFim,
    taxasRepasse: (d.taxas ?? []).map((t: any) => ({
      categoria: t.categoria,
      percentual: Number(t.percentual),
    })),
    filiais: d.filiais ?? [],
    apelidoInterno: d.apelidoInterno,
    observacoes: d.observacoes,
    pdfFileName: d.pdfFileName,
    pdfFileUrl: d.pdfFileUrl,
    createdByName: d.createdByName,
    updatedByName: d.updatedByName,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    isLocal: false,
  };
}

// ==================================================================
// COMPONENTE PRINCIPAL — Página Repasses
// ==================================================================
export default function Repasses() {
  const [, setLocation] = useLocation();

  // ------- Estado de UI -------
  const [scope, setScope] = useState<ScopeKey>({ estado: "SC", grupo: "Associativismo" });
  const [statusFilter, setStatusFilter] = useState<"Todos" | StatusContrato>("Todos");
  const [search, setSearch] = useState("");

  // ------- Upload / extração IA -------
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [draftContract, setDraftContract] = useState<Contract | null>(null);
  const [draftFileName, setDraftFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ------- Modais CRUD -------
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [deleteContract, setDeleteContract] = useState<Contract | null>(null);
  const [renewContract, setRenewContract] = useState<Contract | null>(null);

  // ------- tRPC com fallback -------
  const utils = trpc.useUtils();
  const repassesQuery = trpc.repasses.list.useQuery(
    {},
    { retry: false, refetchOnWindowFocus: false }
  );
  const usingDb = repassesQuery.isSuccess && !repassesQuery.error;

  // Contratos somente locais (mocks + criados quando DB indisponível)
  const [localContracts, setLocalContracts] = useState<Contract[]>(mockContracts);

  const contracts: Contract[] = useMemo(() => {
    if (usingDb) {
      const dbList = (repassesQuery.data ?? []).map(dbToUi);
      // se houver contratos locais criados após o load, mantemos eles também
      const localOnly = localContracts.filter(
        (c) => c.isLocal && typeof c.id === "string"
      );
      return [...dbList, ...localOnly.filter((lc) => !lc.id.toString().startsWith("c-0"))];
    }
    return localContracts;
  }, [usingDb, repassesQuery.data, localContracts]);

  const createMutation = trpc.repasses.create.useMutation({
    onSuccess: () => {
      utils.repasses.list.invalidate();
      toast.success("Contrato efetivado e persistido no banco.");
    },
    onError: (err) => {
      toast.error(`Falha ao salvar no banco: ${err.message}. Mantido apenas localmente.`);
    },
  });

  const updateMutation = trpc.repasses.update.useMutation({
    onSuccess: () => {
      utils.repasses.list.invalidate();
      toast.success("Contrato atualizado.");
    },
    onError: (err) => toast.error(`Falha ao atualizar: ${err.message}`),
  });

  const deleteMutation = trpc.repasses.delete.useMutation({
    onSuccess: () => {
      utils.repasses.list.invalidate();
      toast.success("Contrato removido.");
    },
    onError: (err) => toast.error(`Falha ao remover: ${err.message}`),
  });

  const renewMutation = trpc.repasses.renewContract.useMutation({
    onSuccess: () => {
      utils.repasses.list.invalidate();
      toast.success("Contrato atualizado com sucesso!");
      setRenewContract(null);
    },
    onError: (err) => toast.error(`Falha ao atualizar contrato: ${err.message}`),
  });

  // ------- Derivações -------
  const scopedContracts = useMemo(
    () => contracts.filter((c) => c.estado === scope.estado && c.grupo === scope.grupo),
    [contracts, scope]
  );

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cleaned = cleanDigits(term);
    return scopedContracts.filter((c) => {
      const okStatus = statusFilter === "Todos" || c.status === statusFilter;
      if (!term) return okStatus;
      const matchesParceiro = c.parceiro.toLowerCase().includes(term);
      const matchesApelido = (c.apelidoInterno ?? "").toLowerCase().includes(term);
      const matchesCnpj = cleaned.length >= 2 && cleanDigits(c.cnpj).includes(cleaned);
      return okStatus && (matchesParceiro || matchesApelido || matchesCnpj);
    });
  }, [scopedContracts, statusFilter, search]);

  const kpis = useMemo(() => {
    const vigentes = scopedContracts.filter((c) => c.status === "Vigente");
    const vencidos = scopedContracts.filter((c) => c.status === "Vencido");
    const avgGatilho =
      scopedContracts.length === 0
        ? 0
        : scopedContracts.reduce((sum, c) => sum + c.gatilhoMensal, 0) / scopedContracts.length;
    const totalFiliais = scopedContracts.reduce((sum, c) => sum + c.filiais.length, 0);
    return {
      vigentes: vigentes.length,
      vencidos: vencidos.length,
      avgGatilho,
      totalFiliais,
    };
  }, [scopedContracts]);

  const statusCounts = useMemo(
    () => ({
      Todos: scopedContracts.length,
      Vigente: scopedContracts.filter((c) => c.status === "Vigente").length,
      Vencido: scopedContracts.filter((c) => c.status === "Vencido").length,
    }),
    [scopedContracts]
  );

  // ------- Handlers de upload -------
  const triggerFilePicker = () => fileInputRef.current?.click();

  const extractMutation = trpc.repasses.extractFromPdf.useMutation({
    onSuccess: (data) => {
      const draft: Contract = {
        id: `draft-${Date.now()}`,
        parceiro: data.parceiro,
        cnpj: data.cnpj,
        estado: data.estado as Estado,
        grupo: data.grupo as Grupo,
        status: data.status as StatusContrato,
        vigenciaInicio: data.vigenciaInicio,
        vigenciaFim: data.vigenciaFim,
        gatilhoMensal: data.gatilhoMensal,
        taxasRepasse: data.taxasRepasse,
        filiais: data.filiais,
        observacoes: data.observacoes,
        pdfFileName: data.pdfFileName,
        pdfFileUrl: data.pdfFileUrl,
        isLocal: true,
      };
      setDraftContract(draft);
      setIsExtracting(false);
    },
    onError: (err) => {
      toast.error(`Falha na extração: ${err.message}`);
      setIsExtracting(false);
      setDraftFileName("");
    },
  });

  const handleFileSelected = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setDraftFileName(file.name);
    setIsExtracting(true);
    setDraftContract(null);

    try {
      // 1. Upload do PDF para S3
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-file-key": `contratos-repasse/${Date.now()}-${file.name}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Falha no upload do arquivo.");
      }

      const { url: pdfUrl } = await uploadRes.json();

      // 2. Extrair dados via IA
      extractMutation.mutate({ pdfUrl, fileName: file.name });
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo.");
      setIsExtracting(false);
      setDraftFileName("");
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  // ------- CRUD -------
  const efetivarContrato = async (draft: Contract) => {
    const cleanFiliais = draft.filiais.filter((f) => f.trim().length > 0);
    const cleanTaxas = draft.taxasRepasse.filter((t) => t.categoria.trim().length > 0);

    if (usingDb) {
      try {
        await createMutation.mutateAsync({
          parceiro: draft.parceiro,
          cnpj: draft.cnpj,
          estado: draft.estado,
          grupo: draft.grupo,
          status: draft.status,
          gatilhoMensal: draft.gatilhoMensal,
          vigenciaInicio: draft.vigenciaInicio,
          vigenciaFim: draft.vigenciaFim,
          apelidoInterno: draft.apelidoInterno ?? null,
          observacoes: draft.observacoes ?? null,
          pdfFileName: draft.pdfFileName ?? null,
          taxas: cleanTaxas,
          filiais: cleanFiliais,
        });
      } catch {
        // Toast já tratado no onError; cria localmente como fallback
        appendLocal(draft, cleanTaxas, cleanFiliais);
      }
    } else {
      appendLocal(draft, cleanTaxas, cleanFiliais);
      toast.success("Contrato efetivado localmente (banco indisponível).");
    }

    setScope({ estado: draft.estado, grupo: draft.grupo });
    setDraftContract(null);
    setDraftFileName("");
  };

  const appendLocal = (draft: Contract, taxas: TaxaRepasse[], filiais: string[]) => {
    const final: Contract = {
      ...draft,
      id: `local-${Date.now()}`,
      taxasRepasse: taxas,
      filiais,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocal: true,
    };
    setLocalContracts((prev) => [final, ...prev]);
  };

  const saveEdit = async (updated: Contract) => {
    const cleanFiliais = updated.filiais.filter((f) => f.trim().length > 0);
    const cleanTaxas = updated.taxasRepasse.filter((t) => t.categoria.trim().length > 0);
    if (typeof updated.id === "number") {
      try {
        await updateMutation.mutateAsync({
          id: updated.id,
          data: {
            apelidoInterno: updated.apelidoInterno ?? null,
            observacoes: updated.observacoes ?? null,
            status: updated.status,
            gatilhoMensal: updated.gatilhoMensal,
            vigenciaInicio: updated.vigenciaInicio,
            vigenciaFim: updated.vigenciaFim,
            taxas: cleanTaxas,
            filiais: cleanFiliais,
          },
        });
      } catch {
        /* toast já tratado */
      }
    } else {
      // contrato local
      setLocalContracts((prev) =>
        prev.map((c) =>
          c.id === updated.id
            ? { ...updated, taxasRepasse: cleanTaxas, filiais: cleanFiliais, updatedAt: Date.now() }
            : c
        )
      );
      toast.success("Contrato atualizado localmente.");
    }
    setEditContract(null);
  };

  const confirmDelete = async (contract: Contract) => {
    if (typeof contract.id === "number") {
      try {
        await deleteMutation.mutateAsync({ id: contract.id });
      } catch {
        /* toast já tratado */
      }
    } else {
      setLocalContracts((prev) => prev.filter((c) => c.id !== contract.id));
      toast.success("Contrato removido localmente.");
    }
    setDeleteContract(null);
  };

  // ==================================================================
  // RENDER
  // ==================================================================
  return (
    <div className="min-h-screen w-full bg-[var(--background)] flex flex-col">
      {/* Header — barra de topo do shell (sidebar + conteúdo abaixo) */}
      <header className="w-full border-b border-border">
        <div className="px-4 py-3 sm:px-6 lg:px-8">
          <PanelHeader
            onBack={() => setLocation("/contratos")}
            backLabel="Contratos"
            icon={Handshake}
            title="Repasses"
            subtitle="Contratos comerciais de repasse"
            color="sky"
          />
        </div>
      </header>

      {/* ============ CONTENT ============ */}
      <div className="flex flex-1 min-h-0">
        {/* SIDEBAR DE ESCOPOS */}
        <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-border bg-card lg:flex">
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Escopo de Atuação
            </p>

            {(["SC", "RS"] as Estado[]).map((estado) => (
              <div key={estado} className="mb-3">
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {estado === "SC" ? "Santa Catarina" : "Rio Grande do Sul"}
                </div>
                <div className="space-y-1">
                  {(["Associativismo", "Farmácias"] as Grupo[]).map((grupo) => {
                    const Icon = scopeIcon(grupo);
                    const active = scope.estado === estado && scope.grupo === grupo;
                    const count = contracts.filter(
                      (c) => c.estado === estado && c.grupo === grupo
                    ).length;
                    return (
                      <button
                        key={grupo}
                        onClick={() => setScope({ estado, grupo })}
                        className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                          active
                            ? "bg-sky-50 font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon
                            className={`h-4 w-4 ${
                              active ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground/70"
                            }`}
                          />
                          {grupo}
                        </span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            active
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>


        </aside>

        {/* MAIN */}
        <main className="min-w-0 flex-1">
          {/* Sub-header */}
          <div className="border-b border-border bg-card/40 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-6 py-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{scope.estado === "SC" ? "Santa Catarina" : "Rio Grande do Sul"}</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-semibold text-foreground">{scope.grupo}</span>
                </div>
                <h2 className="mt-0.5 truncate text-lg font-bold tracking-tight text-foreground">
                  {scope.estado} — {scope.grupo}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar Razão Social, apelido ou CNPJ…"
                    className="w-80 pl-9"
                  />
                </div>
                <Button onClick={triggerFilePicker} className="bg-sky-600 hover:bg-sky-700">
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline ml-2">Novo Contrato (Upload)</span>
                  <span className="sm:hidden ml-2">Upload</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={onFileInputChange}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6 px-6 py-6">
            {/* SCOPE PILLS MOBILE */}
            <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {(["SC", "RS"] as Estado[]).flatMap((estado) =>
                (["Associativismo", "Farmácias"] as Grupo[]).map((grupo) => {
                  const active = scope.estado === estado && scope.grupo === grupo;
                  return (
                    <button
                      key={`${estado}-${grupo}`}
                      onClick={() => setScope({ estado, grupo })}
                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-sky-600 text-white shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {estado} · {grupo}
                    </button>
                  );
                })
              )}
            </div>

            {/* KPI CARDS */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Contratos Vigentes" value={kpis.vigentes.toString()} hint="Acordos atualmente ativos" icon={CheckCircle2} tone="emerald" />
              <KpiCard label="Contratos Vencidos" value={kpis.vencidos.toString()} hint="Renegociação pendente" icon={AlertTriangle} tone="rose" />
              <KpiCard label="Gatilho Médio Mensal" value={formatBRL(kpis.avgGatilho)} hint="Volume médio acordado" icon={TrendingUp} tone="sky" />
              <KpiCard label="Filiais Atendidas" value={kpis.totalFiliais.toString()} hint="Pontos de venda beneficiados" icon={Building2} tone="slate" />
            </section>

            {/* FILTROS + TABELA */}
            <Card className="p-0 gap-0 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { key: "Todos", label: "Todos", tone: "slate" },
                      { key: "Vigente", label: "Vigentes", tone: "emerald" },
                      { key: "Vencido", label: "Vencidos", tone: "rose" },
                    ] as const
                  ).map((pill) => {
                    const active = statusFilter === pill.key;
                    const baseTone =
                      pill.tone === "emerald"
                        ? "ring-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
                        : pill.tone === "rose"
                        ? "ring-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
                        : "ring-border bg-muted text-foreground";
                    return (
                      <button
                        key={pill.key}
                        onClick={() => setStatusFilter(pill.key)}
                        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                          active
                            ? `${baseTone} ring-1 ring-inset shadow-sm`
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {pill.label}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            active ? "bg-white/70 text-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {statusCounts[pill.key as keyof typeof statusCounts]}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative sm:hidden">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar…"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/40">
                    <tr>
                      <Th>Parceiro / Razão Social</Th>
                      <Th>CNPJ</Th>
                      <Th>Gatilho Mensal</Th>
                      <Th>Vigência</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Ações</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {filteredContracts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <EmptyState onUpload={triggerFilePicker} />
                        </td>
                      </tr>
                    ) : (
                      filteredContracts.map((c) => (
                        <tr key={c.id} className="transition hover:bg-accent/40">
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {c.parceiro}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {c.apelidoInterno ? (
                                    <span className="font-mono text-[10px] uppercase tracking-wider">
                                      {c.apelidoInterno} ·{" "}
                                    </span>
                                  ) : null}
                                  {c.filiais.length}{" "}
                                  {c.filiais.length === 1 ? "filial" : "filiais"} ·{" "}
                                  {c.taxasRepasse.length} faixas
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-muted-foreground">
                            {c.cnpj}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-foreground">
                            {formatBRL(c.gatilhoMensal)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
                              {formatDate(c.vigenciaInicio)}{" "}
                              <span className="text-muted-foreground/50">→</span>{" "}
                              {formatDate(c.vigenciaFim)}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <ActionButton
                                icon={Eye}
                                label="Visualizar"
                                onClick={() => setViewContract(c)}
                              />
                              <ActionButton
                                icon={Pencil}
                                label="Editar"
                                onClick={() => setEditContract(c)}
                              />
                              <ActionButton
                                icon={Trash2}
                                label="Remover"
                                danger
                                onClick={() => setDeleteContract(c)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <p>
                  Exibindo{" "}
                  <span className="font-semibold text-foreground">{filteredContracts.length}</span>{" "}
                  de{" "}
                  <span className="font-semibold text-foreground">{scopedContracts.length}</span>{" "}
                  contratos no escopo
                </p>
                <p className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-sky-500" />
                  Importação por IA habilitada — Upload &amp; Verify
                </p>
              </div>
            </Card>

            {/* DROPZONE */}
            <DropZone
              isDragging={isDragging}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={triggerFilePicker}
            />
          </div>
        </main>
      </div>

      {/* ============ MODAIS ============ */}
      <UploadValidationDialog
        fileName={draftFileName}
        isExtracting={isExtracting}
        draft={draftContract}
        onCancel={() => {
          setDraftContract(null);
          setDraftFileName("");
          setIsExtracting(false);
        }}
        onConfirm={efetivarContrato}
        isSaving={createMutation.isPending}
      />

      <ViewDialog
        contract={viewContract}
        onClose={() => setViewContract(null)}
        onEdit={(c) => {
          setViewContract(null);
          setEditContract(c);
        }}
        onRenew={(c) => {
          setViewContract(null);
          setRenewContract(c);
        }}
      />

      <EditDialog
        contract={editContract}
        onClose={() => setEditContract(null)}
        onSave={saveEdit}
        isSaving={updateMutation.isPending}
      />

      <RenewDialog
        contract={renewContract}
        onClose={() => setRenewContract(null)}
        extractMutation={extractMutation}
        renewMutation={renewMutation}
      />

      <DeleteDialog
        contract={deleteContract}
        onClose={() => setDeleteContract(null)}
        onConfirm={confirmDelete}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}

// ==================================================================
// SUBCOMPONENTES
// ==================================================================

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "rose" | "sky" | "slate";
}) {
  const tones: Record<typeof tone, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-100 dark:ring-emerald-900" },
    rose: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-100 dark:ring-rose-900" },
    sky: { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-300", ring: "ring-sky-100 dark:ring-sky-900" },
    slate: { bg: "bg-muted", text: "text-foreground", ring: "ring-border" },
  };
  const t = tones[tone];
  return (
    <Card className="p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: StatusContrato }) {
  const isVigente = status === "Vigente";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        isVigente
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900"
          : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isVigente ? "bg-emerald-500" : "bg-rose-500"}`} />
      {isVigente ? "Vigente" : "Vencido"}
    </span>
  );
}

function ActionButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition ${
        danger
          ? "text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">
        Nenhum contrato encontrado neste filtro
      </p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Ajuste a busca ou os filtros de status. Você também pode importar um novo PDF — a IA fará a
        leitura e você valida na tela.
      </p>
      <Button variant="outline" size="sm" onClick={onUpload} className="mt-4">
        <Upload className="h-3.5 w-3.5 mr-1.5" />
        Importar contrato
      </Button>
    </div>
  );
}

function DropZone({
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  isDragging: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`group flex cursor-pointer items-center justify-between gap-4 rounded-xl border-2 border-dashed bg-card px-5 py-4 transition ${
        isDragging
          ? "border-sky-500 bg-sky-50/60 dark:bg-sky-950/30"
          : "border-border hover:border-sky-300 hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 transition group-hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Arraste um PDF aqui ou clique para importar
          </p>
          <p className="text-xs text-muted-foreground">
            A IA extrai automaticamente parceiro, vigência, gatilho, taxas e filiais — você só
            confere.
          </p>
        </div>
      </div>
      <span className="hidden text-xs font-semibold text-sky-700 dark:text-sky-300 sm:inline-flex">
        Upload &amp; Verify →
      </span>
    </div>
  );
}

// ==================================================================
// MODAL 1: Upload & Verify (curadoria de novo contrato)
// ==================================================================
function UploadValidationDialog({
  fileName,
  isExtracting,
  draft,
  onCancel,
  onConfirm,
  isSaving,
}: {
  fileName: string;
  isExtracting: boolean;
  draft: Contract | null;
  onCancel: () => void;
  onConfirm: (draft: Contract) => void | Promise<void>;
  isSaving: boolean;
}) {
  const [local, setLocal] = useState<Contract | null>(null);
  useEffect(() => setLocal(draft), [draft]);

  const isOpen = isExtracting || draft !== null;
  if (!isOpen) return null;

  const set = <K extends keyof Contract>(key: K, val: Contract[K]) =>
    setLocal((prev) => (prev ? { ...prev, [key]: val } : prev));

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-gradient-to-r from-sky-50 to-card dark:from-sky-950/40">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm flex-shrink-0">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                Upload &amp; Verify
              </p>
              <DialogTitle className="text-base sm:text-lg">Curadoria do Contrato Importado</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{fileName || "documento.pdf"}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body - scrollable */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {isExtracting || !local ? (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
              <div className="relative">
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-sky-600" />
                <div className="absolute inset-0 h-10 w-10 sm:h-12 sm:w-12 animate-ping rounded-full bg-sky-200/30" />
              </div>
              <p className="mt-5 text-sm font-semibold text-foreground">
                A IA está analisando o contrato…
              </p>
              <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">
                Extraindo parceiro, vigência, gatilho, taxas de repasse e filiais beneficiadas do PDF.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse [animation-delay:200ms]" />
                <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse [animation-delay:400ms]" />
              </div>
            </div>
          ) : (
            <ContractFormFields contract={local} onChange={set} />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Curadoria humana antes da efetivação.
            </span>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto sm:ml-auto">
              <Button variant="outline" onClick={onCancel} disabled={isSaving} className="flex-1 sm:flex-none">
                Cancelar
              </Button>
              <Button
                onClick={() => local && onConfirm(local)}
                disabled={isExtracting || !local || isSaving}
                className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="ml-2">Efetivar</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================================================================
// MODAL 2: Visualizar
// ==================================================================
function ViewDialog({
  contract,
  onClose,
  onEdit,
  onRenew,
}: {
  contract: Contract | null;
  onClose: () => void;
  onEdit: (c: Contract) => void;
  onRenew?: (c: Contract) => void;
}) {
  if (!contract) return null;

  const days = daysFromToday(contract.vigenciaFim);
  const vigenciaHint =
    contract.status === "Vencido"
      ? `Vencido há ${Math.abs(days)} dia(s)`
      : days <= 60
      ? `Expira em ${days} dia(s)`
      : `Expira em ${days} dia(s)`;

  const totalGatilhoAno = contract.gatilhoMensal * 12;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 flex-shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={contract.status} />
                {contract.apelidoInterno && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {contract.apelidoInterno}
                  </Badge>
                )}
              </div>
              <DialogTitle className="mt-1 text-sm sm:text-base break-words">{contract.parceiro}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{contract.cnpj}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5">
          {/* KPIs do contrato */}
          <div className="grid grid-cols-2 gap-3">
            <ViewKpi
              icon={Calendar}
              label="Vigência"
              value={`${formatDate(contract.vigenciaInicio)} → ${formatDate(contract.vigenciaFim)}`}
              hint={vigenciaHint}
              tone={contract.status === "Vencido" ? "rose" : days <= 60 ? "amber" : "emerald"}
            />
            <ViewKpi
              icon={DollarSign}
              label="Gatilho Mensal"
              value={formatBRL(contract.gatilhoMensal)}
              hint={`~ ${formatBRL(totalGatilhoAno)}/ano`}
              tone="sky"
            />
            <ViewKpi
              icon={Building2}
              label="Filiais"
              value={contract.filiais.length.toString()}
              hint="Pontos de venda"
              tone="slate"
            />
            <ViewKpi
              icon={Percent}
              label="Faixas de Repasse"
              value={contract.taxasRepasse.length.toString()}
              hint="Categorias acordadas"
              tone="slate"
            />
          </div>

          {/* Escopo */}
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium text-foreground">
                {contract.estado === "SC" ? "Santa Catarina" : "Rio Grande do Sul"}
              </span>
              <ChevronRight className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium text-foreground">{contract.grupo}</span>
            </div>
            {contract.pdfFileName && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-1.5 px-2 w-full justify-start max-w-full"
                disabled={!contract.pdfFileUrl}
                title={contract.pdfFileName}
              >
                <Download className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                <span className="text-xs truncate">{contract.pdfFileName}</span>
              </Button>
            )}
          </div>

          {/* Taxas */}
          <section>
            <SectionTitle icon={Percent}>Tabela de Taxas de Repasse</SectionTitle>
            {contract.taxasRepasse.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-4 py-6 text-center">
                Nenhuma taxa cadastrada.
              </p>
            ) : (
              <div className="space-y-2">
                {contract.taxasRepasse.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 bg-card">
                    <span className="text-sm text-foreground break-words min-w-0 flex-1">{t.categoria}</span>
                    <span className="font-mono text-sm font-semibold text-foreground flex-shrink-0">
                      {t.percentual.toFixed(2).replace(".", ",")}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Filiais */}
          <section>
            <SectionTitle icon={MapPin}>Filiais Beneficiadas ({contract.filiais.length})</SectionTitle>
            {contract.filiais.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma filial cadastrada.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {contract.filiais.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Observações */}
          {contract.observacoes && (
            <section>
              <SectionTitle icon={FileText}>Observações Internas</SectionTitle>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2">
                {contract.observacoes}
              </p>
            </section>
          )}

          {/* Metadados */}
          <Separator />
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <UserIcon className="h-3.5 w-3.5" />
              Criado por <span className="font-medium text-foreground">{contract.createdByName ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              {formatDateTime(contract.createdAt)}
            </div>
            {contract.updatedAt && contract.updatedAt !== contract.createdAt && (
              <>
                <div className="flex items-center gap-2">
                  <UserIcon className="h-3.5 w-3.5" />
                  Editado por <span className="font-medium text-foreground">{contract.updatedByName ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTime(contract.updatedAt)}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={onClose} className="whitespace-nowrap">
              Fechar
            </Button>
            {onRenew && typeof contract.id === "number" && (
              <Button
                onClick={() => onRenew(contract)}
                className="bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
              >
                <RotateCcw className="h-4 w-4 mr-2 flex-shrink-0" />
                Atualizar
              </Button>
            )}
            <Button onClick={() => onEdit(contract)} className="bg-sky-600 hover:bg-sky-700 whitespace-nowrap">
              <Pencil className="h-4 w-4 mr-2 flex-shrink-0" />
              Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ViewKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "emerald" | "rose" | "amber" | "sky" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    rose: "text-rose-700 dark:text-rose-300",
    amber: "text-amber-700 dark:text-amber-300",
    sky: "text-sky-700 dark:text-sky-300",
    slate: "text-foreground",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3 flex-shrink-0" />
        {label}
      </div>
      <p className="mt-1 text-xs sm:text-sm font-bold text-foreground break-words leading-tight">{value}</p>
      <p className={`mt-0.5 text-[11px] font-medium break-words leading-tight ${tones[tone]}`}>{hint}</p>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h4>
  );
}

// ==================================================================
// MODAL 3: Editar
// ==================================================================
function EditDialog({
  contract,
  onClose,
  onSave,
  isSaving,
}: {
  contract: Contract | null;
  onClose: () => void;
  onSave: (updated: Contract) => void | Promise<void>;
  isSaving: boolean;
}) {
  const [local, setLocal] = useState<Contract | null>(contract);

  useEffect(() => setLocal(contract), [contract]);

  if (!contract || !local) return null;

  const set = <K extends keyof Contract>(key: K, val: Contract[K]) =>
    setLocal((prev) => (prev ? { ...prev, [key]: val } : prev));

  return (
    <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900 flex-shrink-0">
              <Pencil className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm sm:text-base">Editar Contrato</DialogTitle>
              <DialogDescription className="text-xs break-words">
                {contract.parceiro} · <span className="font-mono">{contract.cnpj}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          <ContractFormFields contract={local} onChange={set} editMode />
        </div>

        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={onClose} disabled={isSaving} className="whitespace-nowrap">
              Cancelar
            </Button>
            <Button onClick={() => onSave(local)} disabled={isSaving} className="bg-sky-600 hover:bg-sky-700 whitespace-nowrap">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" /> : <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================================================================
// MODAL 5: Atualizar Contrato (Renovação / Substituição de PDF)
// ==================================================================
function RenewDialog({
  contract,
  onClose,
  extractMutation,
  renewMutation,
}: {
  contract: Contract | null;
  onClose: () => void;
  extractMutation: ReturnType<typeof trpc.repasses.extractFromPdf.useMutation>;
  renewMutation: ReturnType<typeof trpc.repasses.renewContract.useMutation>;
}) {
  const [step, setStep] = useState<"upload" | "curadoria">("upload");
  const [isDraggingRenew, setIsDraggingRenew] = useState(false);
  const [isExtractingRenew, setIsExtractingRenew] = useState(false);
  const [renewDraft, setRenewDraft] = useState<Contract | null>(null);
  const [renewFileName, setRenewFileName] = useState("");
  const [motivo, setMotivo] = useState("");
  const renewFileRef = useRef<HTMLInputElement | null>(null);

  // Reset state when contract changes
  useEffect(() => {
    if (contract) {
      setStep("upload");
      setIsDraggingRenew(false);
      setIsExtractingRenew(false);
      setRenewDraft(null);
      setRenewFileName("");
      setMotivo("");
    }
  }, [contract]);

  if (!contract) return null;

  const handleRenewFileSelected = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setRenewFileName(file.name);
    setIsExtractingRenew(true);
    setRenewDraft(null);

    try {
      // 1. Upload do PDF para S3
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "x-file-key": `contratos-repasse/${Date.now()}-${file.name}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Falha no upload do arquivo.");
      }

      const { url: pdfUrl } = await uploadRes.json();

      // 2. Extrair dados via IA
      extractMutation.mutate(
        { pdfUrl, fileName: file.name },
        {
          onSuccess: (data) => {
            const draft: Contract = {
              ...contract,
              parceiro: data.parceiro,
              cnpj: data.cnpj,
              estado: data.estado as Estado,
              grupo: data.grupo as Grupo,
              status: data.status as StatusContrato,
              vigenciaInicio: data.vigenciaInicio,
              vigenciaFim: data.vigenciaFim,
              gatilhoMensal: data.gatilhoMensal,
              taxasRepasse: data.taxasRepasse,
              filiais: data.filiais,
              observacoes: data.observacoes ?? contract.observacoes,
              pdfFileName: data.pdfFileName,
              pdfFileUrl: data.pdfFileUrl,
            };
            setRenewDraft(draft);
            setIsExtractingRenew(false);
            setStep("curadoria");
          },
          onError: (err) => {
            toast.error(`Falha na extração: ${err.message}`);
            setIsExtractingRenew(false);
            setRenewFileName("");
          },
        }
      );
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo.");
      setIsExtractingRenew(false);
      setRenewFileName("");
    }
  };

  const onRenewFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleRenewFileSelected(file);
    e.target.value = "";
  };

  const onRenewDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingRenew(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleRenewFileSelected(file);
  };

  const setDraft = <K extends keyof Contract>(key: K, val: Contract[K]) =>
    setRenewDraft((prev) => (prev ? { ...prev, [key]: val } : prev));

  const handleConfirmRenew = () => {
    if (!renewDraft || typeof contract.id !== "number") return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo da atualização.");
      return;
    }

    const cleanFiliais = renewDraft.filiais.filter((f) => f.trim().length > 0);
    const cleanTaxas = renewDraft.taxasRepasse.filter((t) => t.categoria.trim().length > 0);

    renewMutation.mutate({
      id: contract.id as number,
      motivo: motivo.trim(),
      data: {
        parceiro: renewDraft.parceiro,
        cnpj: renewDraft.cnpj,
        estado: renewDraft.estado,
        grupo: renewDraft.grupo,
        status: renewDraft.status,
        gatilhoMensal: renewDraft.gatilhoMensal,
        vigenciaInicio: renewDraft.vigenciaInicio,
        vigenciaFim: renewDraft.vigenciaFim,
        apelidoInterno: renewDraft.apelidoInterno ?? null,
        observacoes: renewDraft.observacoes ?? null,
        pdfFileName: renewDraft.pdfFileName ?? null,
        pdfFileUrl: renewDraft.pdfFileUrl ?? null,
        taxas: cleanTaxas,
        filiais: cleanFiliais,
      },
    });
  };

  return (
    <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[95vw] max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-gradient-to-r from-amber-50 to-card dark:from-amber-950/40">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm flex-shrink-0">
              <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Atualizar Contrato
              </p>
              <DialogTitle className="text-base sm:text-lg">Substituir dados do contrato</DialogTitle>
              <DialogDescription className="text-xs break-words">
                {contract.parceiro} · <span className="font-mono">{contract.cnpj}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-5">
            <div className={`flex items-center gap-2 text-xs font-semibold ${
              step === "upload" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            }`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                step === "upload"
                  ? "bg-amber-600 text-white"
                  : renewDraft ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {renewDraft ? <CheckCircle2 className="h-3.5 w-3.5" /> : "1"}
              </span>
              Upload PDF
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <div className={`flex items-center gap-2 text-xs font-semibold ${
              step === "curadoria" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            }`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                step === "curadoria" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"
              }`}>
                2
              </span>
              Curadoria
            </div>
          </div>

          {step === "upload" && !isExtractingRenew && (
            <div className="space-y-4">
              {/* Drag-and-drop area */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => renewFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingRenew(true); }}
                onDragLeave={() => setIsDraggingRenew(false)}
                onDrop={onRenewDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition cursor-pointer ${
                  isDraggingRenew
                    ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/30"
                    : "border-border hover:border-amber-300 hover:bg-amber-50/40 dark:hover:bg-amber-950/20"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">
                    Arraste o novo PDF aqui ou clique para selecionar
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O contrato atual será substituído pelos dados extraídos do novo PDF.
                  </p>
                </div>
              </div>
              <input
                ref={renewFileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={onRenewFileInput}
              />

              {/* Info box about current contract */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 dark:bg-amber-950/20 dark:border-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-semibold">Atenção</p>
                    <p className="mt-0.5">
                      Os dados atuais do contrato serão registrados no histórico antes da substituição.
                      O PDF anterior não será mantido.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isExtractingRenew && (
            <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center">
              <div className="relative">
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-amber-600" />
                <div className="absolute inset-0 h-10 w-10 sm:h-12 sm:w-12 animate-ping rounded-full bg-amber-200/30" />
              </div>
              <p className="mt-5 text-sm font-semibold text-foreground">
                A IA está analisando o novo contrato…
              </p>
              <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">
                Extraindo dados atualizados de parceiro, vigência, gatilho, taxas e filiais.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse [animation-delay:200ms]" />
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse [animation-delay:400ms]" />
              </div>
            </div>
          )}

          {step === "curadoria" && renewDraft && (
            <div className="space-y-5">
              {/* Arquivo carregado */}
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span className="truncate font-medium">{renewFileName}</span>
                <span className="text-emerald-600 dark:text-emerald-400">— dados extraídos com sucesso</span>
              </div>

              {/* Formulário de curadoria */}
              <ContractFormFields contract={renewDraft} onChange={setDraft} />

              {/* Campo de motivo */}
              <Card className="p-4 border-amber-200 dark:border-amber-900">
                <CardContent className="p-0 space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      <History className="h-4 w-4" />
                    </span>
                    Motivo da Atualização
                  </h3>
                  <Textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: Renovação 2025-2026, Correção de taxas, Novo aditivo contratual…"
                    rows={2}
                    className="resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Campo obrigatório. Será registrado no histórico de alterações do contrato.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            {step === "curadoria" && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Dados anteriores serão registrados no histórico.
              </span>
            )}
            <div className={`flex items-center gap-2 sm:gap-3 ${step === "upload" ? "w-full justify-end" : "w-full sm:w-auto sm:ml-auto"}`}>
              <Button variant="outline" onClick={onClose} disabled={renewMutation.isPending} className="whitespace-nowrap">
                Cancelar
              </Button>
              {step === "curadoria" && (
                <Button
                  onClick={handleConfirmRenew}
                  disabled={!renewDraft || !motivo.trim() || renewMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap"
                >
                  {renewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="ml-2">Confirmar</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================================================================
// MODAL 6: Excluir
// ==================================================================
function DeleteDialog({
  contract,
  onClose,
  onConfirm,
  isDeleting,
}: {
  contract: Contract | null;
  onClose: () => void;
  onConfirm: (c: Contract) => void | Promise<void>;
  isDeleting: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [contract]);

  if (!contract) return null;

  const cnpjTarget = cleanDigits(contract.cnpj);
  const cnpjTyped = cleanDigits(typed);
  const canDelete = cnpjTyped === cnpjTarget && cnpjTarget.length > 0;

  return (
    <AlertDialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <AlertDialogTitle>Excluir contrato de repasse?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação é <strong>irreversível</strong>. Todos os dados de taxas, filiais e
                histórico associados serão permanentemente removidos.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-4 py-3 dark:bg-rose-950/20 dark:border-rose-900">
          <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300 font-semibold">
            Contrato
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">{contract.parceiro}</p>
          <p className="font-mono text-xs text-muted-foreground">{contract.cnpj}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-cnpj" className="text-xs">
            Para confirmar, digite o CNPJ:{" "}
            <span className="font-mono text-foreground">{contract.cnpj}</span>
          </Label>
          <Input
            id="confirm-cnpj"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Digite o CNPJ para liberar a exclusão"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete || isDeleting}
            onClick={(e) => {
              e.preventDefault();
              if (canDelete) onConfirm(contract);
            }}
            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Excluir definitivamente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ==================================================================
// FORMULÁRIO COMPARTILHADO — usado nos modais de criação e edição
// ==================================================================
function ContractFormFields({
  contract,
  onChange,
  editMode = false,
}: {
  contract: Contract;
  onChange: <K extends keyof Contract>(key: K, val: Contract[K]) => void;
  editMode?: boolean;
}) {
  const updateTaxa = (idx: number, patch: Partial<TaxaRepasse>) => {
    onChange(
      "taxasRepasse",
      contract.taxasRepasse.map((t, i) => (i === idx ? { ...t, ...patch } : t))
    );
  };
  const removeTaxa = (idx: number) =>
    onChange("taxasRepasse", contract.taxasRepasse.filter((_, i) => i !== idx));
  const addTaxa = () =>
    onChange("taxasRepasse", [...contract.taxasRepasse, { categoria: "", percentual: 0 }]);

  const updateFilial = (idx: number, value: string) =>
    onChange("filiais", contract.filiais.map((f, i) => (i === idx ? value : f)));
  const removeFilial = (idx: number) =>
    onChange("filiais", contract.filiais.filter((_, i) => i !== idx));
  const addFilial = () => onChange("filiais", [...contract.filiais, ""]);

  return (
    <div className="space-y-5">
      {!editMode && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-semibold">Confira antes de efetivar.</p>
            <p className="mt-0.5">
              A IA preenche os campos a partir do PDF. Edite o que for necessário — os dados só
              entram na base após você confirmar.
            </p>
          </div>
        </div>
      )}

      <FormSection icon={Building2} title="Identificação do Parceiro">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="parceiro">Razão Social / Parceiro</Label>
            <Input
              id="parceiro"
              value={contract.parceiro}
              onChange={(e) => onChange("parceiro", e.target.value)}
              disabled={editMode}
            />
            {editMode && (
              <p className="text-[10px] text-muted-foreground">
                Identidade jurídica não é editável. Crie um novo contrato se for outra empresa.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input
              id="cnpj"
              value={contract.cnpj}
              onChange={(e) => onChange("cnpj", e.target.value)}
              className="font-mono"
              disabled={editMode}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apelido">Apelido Interno</Label>
            <Input
              id="apelido"
              value={contract.apelidoInterno ?? ""}
              onChange={(e) => onChange("apelidoInterno", e.target.value)}
              placeholder="ex.: PANVEL-RS-2026"
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Nomenclatura usada internamente pela operação comercial.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <Select value={contract.estado} onValueChange={(v) => onChange("estado", v as Estado)}>
                <SelectTrigger id="estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SC">Santa Catarina (SC)</SelectItem>
                  <SelectItem value="RS">Rio Grande do Sul (RS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grupo">Grupo</Label>
              <Select value={contract.grupo} onValueChange={(v) => onChange("grupo", v as Grupo)}>
                <SelectTrigger id="grupo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Associativismo">Associativismo</SelectItem>
                  <SelectItem value="Farmácias">Farmácias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection icon={DollarSign} title="Vigência e Gatilho Comercial">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vig-ini">Início</Label>
              <Input
                id="vig-ini"
                type="date"
                value={contract.vigenciaInicio}
                onChange={(e) => onChange("vigenciaInicio", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vig-fim">Fim</Label>
              <Input
                id="vig-fim"
                type="date"
                value={contract.vigenciaFim}
                onChange={(e) => onChange("vigenciaFim", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gatilho">Gatilho Mensal (R$)</Label>
              <Input
                id="gatilho"
                type="number"
                min={0}
                step={500}
                value={contract.gatilhoMensal}
                onChange={(e) => onChange("gatilhoMensal", Number(e.target.value))}
              />
            </div>
            {editMode && (
              <div className="space-y-1.5">
                <Label htmlFor="status">Status (manual)</Label>
                <Select
                  value={contract.status}
                  onValueChange={(v) => onChange("status", v as StatusContrato)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vigente">Vigente</SelectItem>
                    <SelectItem value="Vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Status é auto-calculado pela vigência. Use esse campo para override manual.
                </p>
              </div>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection icon={Percent} title="Tabela de Taxas de Repasse">
        <div className="space-y-2">
          {contract.taxasRepasse.map((t, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row gap-2 rounded-lg border border-border p-3 bg-card">
              <div className="flex-1 min-w-0 space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">Categoria / Laboratório</Label>
                <Input
                  value={t.categoria}
                  onChange={(e) => updateTaxa(idx, { categoria: e.target.value })}
                  placeholder="Ex.: Genéricos, Geolab, EMS…"
                  className="text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1 sm:flex-none">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">% Repasse</Label>
                  <div className="relative w-full sm:w-24">
                    <Input
                      type="number"
                      step={0.1}
                      min={0}
                      value={t.percentual}
                      onChange={(e) => updateTaxa(idx, { percentual: Number(e.target.value) })}
                      className="pr-7 text-sm"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                <ActionButton icon={Trash2} label="Remover taxa" danger onClick={() => removeTaxa(idx)} />
              </div>
            </div>
          ))}
          {contract.taxasRepasse.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
              Nenhuma taxa cadastrada.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={addTaxa} className="mt-3">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar taxa
        </Button>
      </FormSection>

      <FormSection icon={MapPin} title="Filiais Beneficiadas">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {contract.filiais.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={f}
                onChange={(e) => updateFilial(idx, e.target.value)}
                placeholder={`Filial ${idx + 1}`}
              />
              <ActionButton icon={Trash2} label="Remover filial" danger onClick={() => removeFilial(idx)} />
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addFilial} className="mt-3">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Adicionar filial
        </Button>
      </FormSection>

      {editMode && (
        <FormSection icon={FileText} title="Observações Internas">
          <Textarea
            value={contract.observacoes ?? ""}
            onChange={(e) => onChange("observacoes", e.target.value)}
            placeholder="Notas livres do gestor (renegociação prevista, contatos, atenções…)"
            rows={3}
          />
        </FormSection>
      )}
    </div>
  );
}

function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <CardContent className="p-0 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h3>
        <div>{children}</div>
      </CardContent>
    </Card>
  );
}
