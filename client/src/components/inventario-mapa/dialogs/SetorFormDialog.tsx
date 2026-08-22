import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { SETOR_CORES } from "@shared/inventarioMapa";
import type { Area } from "@shared/inventarioMapa";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SEM_AREA = "__sem_area__";

interface GrupoValor {
  nome: string;
  cor: string;
}

interface SetorFormDialogProps {
  open: boolean;
  titulo: string;
  valor: GrupoValor | null;
  /** Quando fornecido, mostra o seletor de Área (usado para setores). */
  areas?: Area[];
  areaIdAtual?: string | null;
  onClose: () => void;
  onSubmit: (data: { nome: string; cor: string; areaId: string | null }) => void;
}

export function SetorFormDialog({
  open,
  titulo,
  valor,
  areas,
  areaIdAtual,
  onClose,
  onSubmit,
}: SetorFormDialogProps) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(SETOR_CORES[0]);
  const [areaId, setAreaId] = useState<string>(SEM_AREA);

  useEffect(() => {
    if (valor) {
      setNome(valor.nome);
      setCor(valor.cor);
      setAreaId(areaIdAtual ?? SEM_AREA);
    }
  }, [valor, areaIdAtual]);

  const handleSubmit = () => {
    const nomeFinal = nome.trim() || "Sem nome";
    onSubmit({ nome: nomeFinal, cor, areaId: areaId === SEM_AREA ? null : areaId });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="setor-nome">Nome</Label>
            <Input
              id="setor-nome"
              autoFocus
              placeholder="Ex.: Financeiro, Expedição, Estoque..."
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>

          {areas && (
            <div className="space-y-1.5">
              <Label>Área</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_AREA}>Sem área</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {SETOR_CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-transform hover:scale-110",
                    cor === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ background: c }}
                  aria-label={`Cor ${c}`}
                >
                  {cor === c && <Check size={16} color="#0A0F1C" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
