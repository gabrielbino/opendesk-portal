import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import {
  EQUIPMENT_STATUSES,
  PERIFERICO_TIPOS,
} from "@shared/inventarioMapa";
import type { Equipment, Periferico, Setor } from "@shared/inventarioMapa";
import { generateId } from "../lib/ids";
import { statusLabels } from "../constants";
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

const SEM_SETOR = "__sem_setor__";

interface FormValues {
  setorId: string;
  geral: Equipment["geral"];
  perifericos: Periferico[];
}

interface EquipmentFormDialogProps {
  open: boolean;
  equipment: Equipment | null;
  setores: Setor[];
  onClose: () => void;
  onSubmit: (data: Partial<Equipment> & { tipo: Equipment["tipo"]; setorId: string | null }) => void;
}

function toFormValues(equipment: Equipment): FormValues {
  return {
    setorId: equipment.setorId ?? SEM_SETOR,
    geral: equipment.geral,
    perifericos: equipment.perifericos,
  };
}

export function EquipmentFormDialog({ open, equipment, setores, onClose, onSubmit }: EquipmentFormDialogProps) {
  const { control, handleSubmit, reset, register } = useForm<FormValues>({
    defaultValues: equipment ? toFormValues(equipment) : undefined,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "perifericos" });

  useEffect(() => {
    if (equipment) reset(toFormValues(equipment));
  }, [equipment, reset]);

  if (!equipment) return null;

  const submit = (values: FormValues) => {
    onSubmit({
      tipo: "Computador",
      setorId: values.setorId === SEM_SETOR ? null : values.setorId,
      geral: values.geral,
      perifericos: values.perifericos.map((p) => ({ ...p, id: p.id || generateId("per") })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {equipment.geral.nome ? `Editar ${equipment.geral.nome}` : "Novo computador"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" {...register("geral.nome")} />
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="geral.status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EQUIPMENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="patrimonio">Patrimônio</Label>
                <Input id="patrimonio" {...register("geral.patrimonio")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mac">Endereço MAC</Label>
                <Input id="mac" {...register("geral.mac")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="so">Sistema Operacional</Label>
                <Input id="so" {...register("geral.sistemaOperacional")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resp">Responsável</Label>
                <Input id="resp" {...register("geral.responsavel")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep">Departamento</Label>
                <Input id="dep" {...register("geral.departamento")} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Setor</Label>
                <Controller
                  name="setorId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_SETOR}>Sem setor</SelectItem>
                        {setores.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="my-4 border-t border-border" />

            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">Periféricos</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ id: generateId("per"), tipo: "Monitor", descricao: "", patrimonio: "" })}
              >
                <Plus size={15} className="mr-1" /> Adicionar
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="mb-1 text-sm text-muted-foreground">
                Nenhum periférico. Use "Adicionar" para incluir monitor, nobreak, estabilizador,
                leitor de código de barras, etc.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {fields.map((f, index) => (
                <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[8rem_1fr_8rem_auto]">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Tipo</Label>
                    <Controller
                      name={`perifericos.${index}.tipo`}
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PERIFERICO_TIPOS.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Descrição / modelo</Label>
                    <Input className="h-9" {...register(`perifericos.${index}.descricao`)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Patrimônio</Label>
                    <Input className="h-9" {...register(`perifericos.${index}.patrimonio`)} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-red-500 hover:text-red-600"
                    onClick={() => remove(index)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
