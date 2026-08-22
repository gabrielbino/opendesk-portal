import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Plus, Edit, Trash2, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import PurchasingLayout from '@/components/PurchasingLayout';

export default function Products() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const { data: products = [], refetch } = trpc.products.list.useQuery();

  const deleteProductMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success('Produto excluído com sucesso');
      refetch();
    },
    onError: (error) => {
      toast.error('Erro ao excluir produto: ' + error.message);
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Deseja realmente excluir o produto "${name}"?`)) {
      deleteProductMutation.mutate({ id });
    }
  };

  return (
    <PurchasingLayout 
      title="Produtos" 
      description="Gerencie o catálogo de medicamentos"
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-end mb-8">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          >
            <Plus size={20} />
            Novo Produto
          </button>
        </div>

        {/* Products Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-card">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Estoque</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Unidade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-card transition">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-foreground">{product.code}</td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    <div className="flex items-center gap-2">
                      <Package size={16} className="text-primary" />
                      <div>
                        <div className="font-medium">{product.name}</div>
                        {product.requiresPrescription && (
                          <span className="text-xs text-orange-600">Requer receita</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{product.category || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      {(product.currentStock ?? 0) <= (product.minStock ?? 0) && (
                        <AlertTriangle size={16} className="text-orange-600" />
                      )}
                      <span className={(product.currentStock ?? 0) <= (product.minStock ?? 0) ? 'text-orange-600 font-semibold' : 'text-foreground'}>
                        {product.currentStock}
                      </span>
                      <span className="text-muted-foreground text-xs">/ mín: {product.minStock}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">{product.unit}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        product.status === 'Ativo'
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="p-2 text-blue-700 hover:bg-blue-100 rounded-lg transition"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {products.length === 0 && (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum produto cadastrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingProduct) && (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            refetch();
            setShowCreateModal(false);
            setEditingProduct(null);
          }}
        />
      )}
    </PurchasingLayout>
  );
}

function ProductModal({
  product,
  onClose,
  onSuccess,
}: {
  product?: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    code: product?.code || '',
    name: product?.name || '',
    description: product?.description || '',
    category: product?.category || '',
    unit: product?.unit || 'UN',
    minStock: product?.minStock || 0,
    currentStock: product?.currentStock || 0,
    status: product?.status || 'Ativo',
    requiresPrescription: product?.requiresPrescription || false,
    notes: product?.notes || '',
  });

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      toast.success('Produto criado com sucesso');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao criar produto: ' + error.message);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      toast.success('Produto atualizado com sucesso');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar produto: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (product) {
      updateMutation.mutate({ id: product.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-card rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-foreground mb-6">
          {product ? 'Editar Produto' : 'Novo Produto'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Código *</label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Nome *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Categoria</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Unidade</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              >
                <option value="UN">UN - Unidade</option>
                <option value="CX">CX - Caixa</option>
                <option value="FR">FR - Frasco</option>
                <option value="CP">CP - Comprimido</option>
                <option value="ML">ML - Mililitro</option>
                <option value="G">G - Grama</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Estoque Mínimo</label>
              <input
                type="number"
                min="0"
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 rounded-lg bg-muted border border-border text-foreground focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Estoque Atual</label>
              <input
                type="number"
                min="0"
                value={formData.currentStock}
                onChange={(e) => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
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
              </select>
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requiresPrescription}
                  onChange={(e) => setFormData({ ...formData, requiresPrescription: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-muted text-cyan-500 focus:ring-cyan-400"
                />
                Requer receita médica
              </label>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Observações</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
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
              {isLoading ? 'Salvando...' : product ? 'Atualizar' : 'Criar'}
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
