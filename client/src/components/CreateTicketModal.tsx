import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { X, AlertCircle, Loader2, Paperclip, FileIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface CreateTicketModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateTicketModal({ onClose, onSuccess }: CreateTicketModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [errors, setErrors] = useState<Record<string, string>>({}); 
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Técnico' as const,
    priority: 'Média' as const,
    departmentId: undefined as number | undefined,
    assignedToId: undefined as number | undefined,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(false);

  const { data: departments = [] } = trpc.departments.list.useQuery();
  const { data: users = [] } = trpc.userManagement.listAll.useQuery();
  const approvedUsers = users.filter(u => u.approvalStatus === 'approved');

  const createTicketMutation = trpc.tickets.create.useMutation({
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao criar chamado: ' + error.message);
    },
  });

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Título é obrigatório';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Descrição é obrigatória';
    }
    if (!formData.departmentId) {
      newErrors.departmentId = 'Setor é obrigatório';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const uploadAttachmentMutation = trpc.attachments.create.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      // Create ticket first
      const ticket = await createTicketMutation.mutateAsync({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        departmentId: formData.departmentId,
        assignedToId: formData.assignedToId,
      });

      // Upload attachments if any
      if (selectedFiles.length > 0 && ticket) {
        setUploadProgress(true);
        
        for (const file of selectedFiles) {
          try {
            // Convert file to base64
            const reader = new FileReader();
            const fileData = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            // Upload to S3 via tRPC
            const response = await fetch('/api/upload-attachment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                fileData: fileData.split(',')[1], // Remove data:mime;base64, prefix
                mimeType: file.type,
                ticketId: ticket.id,
              }),
            });

            if (!response.ok) {
              throw new Error('Falha no upload');
            }

            const { fileUrl, fileKey } = await response.json();

            // Save attachment metadata
            await uploadAttachmentMutation.mutateAsync({
              ticketId: ticket.id,
              fileName: file.name,
              fileUrl,
              fileKey,
              mimeType: file.type,
              fileSize: file.size,
            });
          } catch (error) {
            console.error('Erro ao fazer upload do arquivo:', file.name, error);
            toast.error(`Erro ao fazer upload de ${file.name}`);
          }
        }

        setUploadProgress(false);
      }

      onSuccess();
    } catch (error: any) {
      toast.error('Erro ao criar chamado: ' + error.message);
    }
  };

  const isLoading = createTicketMutation.isPending;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        onClick={onClose}
      >
        <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="backdrop-blur-xl bg-muted/50 border border-border rounded-xl md:rounded-2xl p-4 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold text-foreground">Novo Chamado</h2>
          <button
            onClick={onClose}
            className="p-1.5 md:p-2 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition"
          >
            <X size={20} className="md:w-6 md:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
              Título do Chamado *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Descreva brevemente"
              className="w-full px-3 md:px-4 py-2 rounded-lg bg-muted/50 border border-border text-sm md:text-base text-foreground placeholder-blue-200 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 transition"
              disabled={isLoading}
            />
            {errors.title && (
              <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.title}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
              Descrição Detalhada *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Forneça detalhes"
              rows={4}
              className="w-full px-3 md:px-4 py-2 rounded-lg bg-muted/50 border border-border text-sm md:text-base text-foreground placeholder-blue-200 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 transition resize-none"
              disabled={isLoading}
            />
            {errors.description && (
              <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {errors.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
                Categoria
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 md:px-4 py-1.5 md:py-2 rounded-lg bg-card border border-border text-xs md:text-sm text-foreground focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 transition"
                disabled={isLoading}
              >
                <option value="Técnico">Técnico</option>
                <option value="Acesso">Acesso</option>
                <option value="Funcionalidade">Funcionalidade</option>
                <option value="Dúvida">Dúvida</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
                Prioridade
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full px-3 md:px-4 py-1.5 md:py-2 rounded-lg bg-card border border-border text-xs md:text-sm text-foreground focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 transition"
                disabled={isLoading}
              >
                <option value="Baixa">Baixa</option>
                <option value="Média">Média</option>
                <option value="Alta">Alta</option>
                <option value="Crítica">Crítica</option>
              </select>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
                Setor *
              </label>
              <select
                value={formData.departmentId?.toString() || ""}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value ? parseInt(e.target.value) : undefined })}
                className={`w-full px-3 md:px-4 py-1.5 md:py-2 rounded-lg bg-card border text-xs md:text-sm text-foreground focus:outline-none focus:ring-2 transition ${
                  errors.departmentId
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-400/50'
                    : 'border-border focus:border-cyan-400 focus:ring-cyan-400/50'
                }`}
                disabled={isLoading}
              >
                <option value="">Selecione um setor</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
              {errors.departmentId && (
                <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={14} /> {errors.departmentId}
                </p>
              )}
            </div>
            {isAdmin && (
              <div>
                <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
                  Atribuir para (opcional)
                </label>
                <select
                  value={formData.assignedToId?.toString() || ""}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-3 md:px-4 py-1.5 md:py-2 rounded-lg bg-card border border-border text-xs md:text-sm text-foreground focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/50 transition"
                  disabled={isLoading}
                >
                  <option value="">Não atribuir</option>
                  {approvedUsers.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* File Upload Section */}
          <div className="mt-3 md:mt-4">
            <label className="block text-xs md:text-sm font-medium text-muted-foreground mb-1.5 md:mb-2">
              <Paperclip size={14} className="inline mr-1 md:w-4 md:h-4" />
              Anexar arquivos (opcional)
            </label>
            <div className="space-y-2">
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.xls,.xlsx"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const validFiles = files.filter(f => {
                    const ext = f.name.split('.').pop()?.toLowerCase();
                    return ['png', 'jpg', 'jpeg', 'pdf', 'xls', 'xlsx'].includes(ext || '');
                  });
                  if (validFiles.length !== files.length) {
                    toast.error('Alguns arquivos foram ignorados. Apenas PNG, JPEG, PDF, XLS e XLSX são permitidos.');
                  }
                  setSelectedFiles(prev => [...prev, ...validFiles]);
                  e.target.value = ''; // Reset input
                }}
                className="w-full px-4 py-2 rounded-lg bg-card border border-border text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-500 file:text-white hover:file:bg-cyan-600 file:cursor-pointer"
                disabled={isLoading || uploadProgress}
              />
              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-card/50 rounded-lg border border-border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileIcon size={16} />
                        <span className="truncate max-w-xs">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:text-red-700 transition"
                        disabled={isLoading || uploadProgress}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 flex-1 py-2 px-4 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Chamado'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2 px-4 rounded-lg border border-blue-400 text-blue-700 font-semibold hover:bg-blue-400/10 transition disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
