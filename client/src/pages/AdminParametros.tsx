import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sliders, Plus, Pencil, CheckCircle, XCircle } from "lucide-react";
import SubmodulePage from "@/components/templates/SubmodulePage";

export default function AdminParametros() {
  const { data: parametros = [], isLoading, refetch } = trpc.admin.getParametros.useQuery();
  const updateMutation = trpc.admin.updateParametro.useMutation({
    onSuccess: () => { toast.success("Parametro atualizado"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const createMutation = trpc.admin.createParametro.useMutation({
    onSuccess: () => { toast.success("Parametro criado"); refetch(); setShowCreate(false); },
    onError: (e) => toast.error(e.message),
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newParam, setNewParam] = useState({ chave: "", valor: "", tipo: "number" as "number" | "boolean" | "string", modulo: "superestocados", descricao: "" });
  const [filterModulo, setFilterModulo] = useState<string>("all");

  const modulos = Array.from(new Set(parametros.map((p: any) => p.modulo)));
  const filtered = filterModulo === "all" ? parametros : parametros.filter((p: any) => p.modulo === filterModulo);

  return (
    <SubmodulePage
      title="Parâmetros"
      subtitle="Configurações e constantes do sistema"
      icon={<Sliders size={20} />}
      iconGradient="from-slate-500 to-slate-600"
      backPath="/admin"
      backLabel="Administração"
      headerActions={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={filterModulo} onValueChange={setFilterModulo}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar modulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {modulos.map((m: any) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary">{filtered.length} parâmetro(s)</Badge>
            </div>
          </div>

          {/* Tabela de Parametros */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Chave</th>
                      <th className="text-left p-3 font-medium">Valor</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Tipo</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Módulo</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Descrição</th>
                      <th className="text-right p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs">{p.chave}</td>
                        <td className="p-3">
                          {editingId === p.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="h-7 w-24 text-xs"
                              />
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                                updateMutation.mutate({ id: p.id, valor: editValue });
                                setEditingId(null);
                              }}>
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline" className="font-mono">{p.valor}</Badge>
                          )}
                        </td>
                        <td className="p-3 hidden sm:table-cell">
                          <Badge variant="secondary" className="text-xs">{p.tipo}</Badge>
                        </td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{p.modulo}</td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs max-w-[200px] truncate">{p.descricao}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingId(p.id); setEditValue(p.valor); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Dialog Criar Parametro */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Parâmetro</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Chave</Label>
                  <Input placeholder="EX: DIAS_ESTOQUE_ENTRADA" value={newParam.chave} onChange={(e) => setNewParam({ ...newParam, chave: e.target.value })} />
                </div>
                <div>
                  <Label>Valor</Label>
                  <Input placeholder="90" value={newParam.valor} onChange={(e) => setNewParam({ ...newParam, valor: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={newParam.tipo} onValueChange={(v) => setNewParam({ ...newParam, tipo: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="string">Texto</SelectItem>
                        <SelectItem value="boolean">Booleano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Módulo</Label>
                    <Select value={newParam.modulo} onValueChange={(v) => setNewParam({ ...newParam, modulo: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="superestocados">Superestocados</SelectItem>
                        <SelectItem value="suporte">Suporte</SelectItem>
                        <SelectItem value="geral">Geral</SelectItem>
                        <SelectItem value="comercial">Comercial</SelectItem>
                        <SelectItem value="projetos">Projetos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Input placeholder="Descricao do parametro" value={newParam.descricao} onChange={(e) => setNewParam({ ...newParam, descricao: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate(newParam)}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </SubmodulePage>
  );
}
