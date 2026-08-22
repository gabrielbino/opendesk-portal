import { useMemo, useState } from "react";
import { Search, Plus, Users, User } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * ContatoPicker — busca e multi-seleção da BASE DE CONTATOS WhatsApp compartilhada do portal
 * (router `contatos`, sobre monarq_destino). Localiza os contatos/grupos já salvos e permite
 * adicionar um novo inline. Reutilizável por qualquer painel que dispare WhatsApp (Monitor,
 * alerta do Pedidos por Layout, etc.) — a base é única, então a busca fica sincronizada.
 */
export interface ContatoPickerProps {
  /** IDs (monarq_destino.id) selecionados. */
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Altura máxima da lista. */
  maxListHeight?: string;
}

export default function ContatoPicker({ selectedIds, onChange, maxListHeight = "max-h-48" }: ContatoPickerProps) {
  const utils = trpc.useUtils();
  const listaQuery = trpc.contatos.listar.useQuery();
  const criar = trpc.contatos.criar.useMutation();

  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [novoTipo, setNovoTipo] = useState<"contato" | "grupo">("contato");
  const [novoNome, setNovoNome] = useState("");
  const [novoIdent, setNovoIdent] = useState("");

  const selecionados = useMemo(() => new Set(selectedIds), [selectedIds]);
  const contatos = listaQuery.data ?? [];

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contatos;
    return contatos.filter(
      (c) => c.nome.toLowerCase().includes(q) || c.identificador.toLowerCase().includes(q),
    );
  }, [contatos, busca]);

  function toggle(id: number) {
    if (selecionados.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  async function adicionar() {
    if (!novoNome.trim() || !novoIdent.trim()) {
      toast.error("Informe o nome e o número/grupo.");
      return;
    }
    try {
      const { id } = await criar.mutateAsync({ tipo: novoTipo, nome: novoNome, identificador: novoIdent });
      await utils.contatos.listar.invalidate();
      if (id && !selecionados.has(id)) onChange([...selectedIds, id]);
      setNovoNome("");
      setNovoIdent("");
      setAdicionando(false);
      toast.success("Contato adicionado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar.");
    }
  }

  return (
    <div className="rounded-lg border">
      {/* Busca + adicionar */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar contato salvo…"
            className="h-8 border-0 pl-6 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-7 shrink-0" onClick={() => setAdicionando((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo
        </Button>
      </div>

      {/* Form de novo contato (inline) */}
      {adicionando && (
        <div className="space-y-2 border-b bg-muted/30 px-3 py-2.5">
          <div className="grid grid-cols-[6.5rem_1fr] gap-2">
            <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as "contato" | "grupo")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contato">Contato</SelectItem>
                <SelectItem value="grupo">Grupo</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Apelido (ex.: TI Plantão)"
              className="h-8 text-xs"
            />
          </div>
          <Input
            value={novoIdent}
            onChange={(e) => setNovoIdent(e.target.value)}
            placeholder={novoTipo === "grupo" ? "Nome do grupo ou id …@g.us" : "Número E.164 (ex.: 5548999999999)"}
            className="h-8 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setAdicionando(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" className="h-7" onClick={adicionar} disabled={criar.isPending}>
              Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className={cn("overflow-y-auto", maxListHeight)}>
        {listaQuery.isLoading && <p className="px-3 py-3 text-xs text-muted-foreground">Carregando…</p>}
        {!listaQuery.isLoading && filtrados.length === 0 && (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {contatos.length === 0 ? "Nenhum contato salvo. Clique em “Novo”." : `Nada encontrado para “${busca}”.`}
          </p>
        )}
        {filtrados.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => toggle(c.id)} />
            {c.tipo === "grupo" ? (
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{c.nome}</p>
              <p className="truncate text-[11px] text-muted-foreground">{c.identificador}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
