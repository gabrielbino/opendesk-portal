import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Plus, Edit, Trash2, Building2, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import PurchasingLayout from '@/components/PurchasingLayout';

export default function Suppliers() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);

  const { data: suppliers = [], refetch } = trpc.suppliers.list.useQuery();

  const deleteSupplierMutation = trpc.suppliers.delete.useMutation({
    onSuccess: () => {
      toast.success('Fornecedor excluído com sucesso');
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao excluir fornecedor: ' + error.message);
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Deseja realmente excluir o fornecedor "${name}"?`)) {
      deleteSupplierMutation.mutate({ id });
    }
  };

  return (
    <PurchasingLayout 
      title="Fornecedores" 
      description="Gerencie os fornecedores da distribuidora"
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-end mb-8">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          >
            <Plus size={20} />
            Novo Fornecedor
          </button>
        </div>

        {/* Suppliers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-card rounded-xl p-5 border border-border hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-100 rounded-lg">
                    <Building2 size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{supplier.name}</h3>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        supplier.status === 'Ativo'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : supplier.status === 'Bloqueado'
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {supplier.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground mb-4">
                {supplier.cnpj && (
                  <div className="flex items-center gap-2">
                    <Building2 size={14} />
                    <span>CNPJ: {supplier.cnpj}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
                {supplier.city && supplier.state && (
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    <span>{supplier.city}/{supplier.state}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t border-border">
                <button
                  onClick={() => setEditingSupplier(supplier)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition"
                >
                  <Edit size={16} />
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(supplier.id, supplier.name)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition"
                >
                  <Trash2 size={16} />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>

        {suppliers.length === 0 && (
          <div className="text-center py-12">
            <Building2 size={48} className="mx-auto text-slate-600 mb-4" />
            <p className="text-muted-foreground">Nenhum fornecedor cadastrado</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingSupplier) && (
        <SupplierModal
          supplier={editingSupplier}
          onClose={() => {
            setShowCreateModal(false);
            setEditingSupplier(null);
          }}
          onSuccess={() => {
            refetch();
            setShowCreateModal(false);
            setEditingSupplier(null);
          }}
        />
      )}
    </PurchasingLayout>
  );
}

function SupplierModal({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: supplier?.name || '',
    cnpj: supplier?.cnpj || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    city: supplier?.city || '',
    state: supplier?.state || '',
    zipCode: supplier?.zipCode || '',
    contactPerson: supplier?.contactPerson || '',
    status: supplier?.status || 'Ativo',
    notes: supplier?.notes || '',
  });

  const createMutation = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success('Fornecedor criado com sucesso');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao criar fornecedor: ' + error.message);
    },
  });

  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      toast.success('Fornecedor atualizado com sucesso');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar fornecedor: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (supplier) {
      updateMutation.mutate({ id: supplier.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-foreground mb-6">
          {supplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Nome *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">CNPJ</label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Telefone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">E-mail</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Endereço</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Cidade</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Estado</label>
              <input
                type="text"
                maxLength={2}
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">CEP</label>
              <input
                type="text"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Pessoa de Contato</label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
                <option value="Bloqueado">Bloqueado</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Observações</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold hover:from-cyan-600 hover:to-blue-600 transition disabled:opacity-50"
            >
              {isLoading ? 'Salvando...' : supplier ? 'Atualizar' : 'Criar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2 px-4 rounded-lg border border-blue-400 text-blue-700 font-semibold hover:bg-blue-400/10 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
