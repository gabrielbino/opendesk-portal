import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { X, Send, Paperclip, AlertCircle, CheckCircle, Clock, Pause, XCircle, User, Briefcase, Tag, Calendar, Loader2, Download, Eye, Trash2 } from 'lucide-react';
import { FileUpload } from './FileUpload';
import { AttachmentPreview } from './AttachmentPreview';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Ticket } from '@/pages/Dashboard';
import MentionInput, { renderMentionText } from './MentionInput';
import { useTicketView } from '@/contexts/TicketViewContext';
import TicketEvaluationModal from './TicketEvaluationModal';


interface TicketDetailModalProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdate?: () => void;
}

const statusColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  'Novos': { bg: 'bg-blue-100', text: 'text-blue-700', icon: <AlertCircle size={16} /> },
  'Em Andamento': { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock size={16} /> },
  'Pendente Cliente': { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Pause size={16} /> },
  'Em Análise': { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle size={16} /> },
  'Pendente ERP': { bg: 'bg-orange-100', text: 'text-orange-700', icon: <XCircle size={16} /> },
  'Concluído': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: <CheckCircle size={16} /> },
  'Resolvido / Aguardando Validação': { bg: 'bg-amber-100', text: 'text-amber-700', icon: <Clock size={16} /> },
};

const priorityColors: Record<string, string> = {
  'Baixa': 'text-green-700',
  'Média': 'text-amber-700',
  'Alta': 'text-orange-600',
  'Crítica': 'text-red-600',
};

export default function TicketDetailModal({ ticket, onClose, onUpdate }: TicketDetailModalProps) {
  const { user } = useAuth();
  const { setTicketViewing } = useTicketView();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (user) {
      setTicketViewing(ticket.id, { userId: user.id, userName: user.name });
    }
    return () => {
      setTicketViewing(ticket.id, null);
    };
  }, [ticket.id, user]);

  const [commentText, setCommentText] = useState('');
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(ticket.status);
  const [selectedPriority, setSelectedPriority] = useState(ticket.priority);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(ticket.departmentId);
  const [selectedAssigned, setSelectedAssigned] = useState(ticket.assignedToName || '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);

  // Fetch comments for this ticket
  const { data: comments = [], refetch: refetchComments } = trpc.comments.list.useQuery({ ticketId: ticket.id });
  
  // Fetch activities for this ticket
  const { data: activities = [], refetch: refetchActivities } = trpc.activities.list.useQuery({ ticketId: ticket.id });
  
  // Fetch attachments for this ticket
  const { data: attachments = [], refetch: refetchAttachments } = trpc.attachments.list.useQuery({ ticketId: ticket.id });

  // Fetch users and departments for dropdowns
  const { data: users = [] } = trpc.userManagement.listAll.useQuery();
  const { data: departments = [] } = trpc.departments.list.useQuery();

  // Mutations
  const updateTicketMutation = trpc.tickets.update.useMutation({
    onSuccess: () => {
      refetchActivities();
      onUpdate?.();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar chamado: ' + error.message);
    },
  });

  const addCommentMutation = trpc.comments.create.useMutation({
    onSuccess: () => {
      setCommentText('');
      setMentionIds([]);
      refetchComments();
      refetchActivities();
      onUpdate?.();
      toast.success('Comentário adicionado');
    },
    onError: (error) => {
      toast.error('Erro ao adicionar comentário: ' + error.message);
    },
  });

  const deleteCommentMutation = trpc.comments.delete.useMutation({
    onSuccess: () => {
      refetchComments();
      toast.success('Comentário deletado');
      setDeleteConfirmOpen(false);
      setCommentToDelete(null);
    },
    onError: (error) => {
      toast.error('Erro ao deletar comentário: ' + error.message);
    },
  });

  const handleDeleteCommentClick = (commentId: number) => {
    setCommentToDelete(commentId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (commentToDelete) {
      deleteCommentMutation.mutate({ commentId: commentToDelete });
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setSelectedStatus(newStatus);
    updateTicketMutation.mutate({
      id: ticket.id,
      status: newStatus as any,
    });
  };

  const handlePriorityChange = (newPriority: string) => {
    if (!isAdmin) return;
    setSelectedPriority(newPriority);
    updateTicketMutation.mutate({
      id: ticket.id,
      priority: newPriority as any,
    });
  };

  const handleDepartmentChange = (newDepartmentId: number | null) => {
    setSelectedDepartmentId(newDepartmentId);
    updateTicketMutation.mutate({
      id: ticket.id,
      departmentId: newDepartmentId,
    });
  };

  const handleAssignChange = (newAssigned: string) => {
    setSelectedAssigned(newAssigned);
    const selectedUser = users.find(u => u.name === newAssigned);
    updateTicketMutation.mutate({
      id: ticket.id,
      assignedToId: selectedUser?.id || null,
      assignedToName: newAssigned || null,
    });
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    addCommentMutation.mutate({
      ticketId: ticket.id,
      content: commentText,
      mentions: mentionIds.length > 0 ? mentionIds : undefined,
    });
  };

  const [showUpload, setShowUpload] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<any | null>(null);

  const handleUploadComplete = () => {
    refetchAttachments();
    setShowUpload(false);
    toast.success('Arquivo anexado com sucesso!');
  };

  const handleDownload = (url: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusColor = statusColors[ticket.status] || statusColors['Novos'];

  // Regras de status por papel
  const isTicketCreator = user?.id === ticket.createdById;
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);

  // Status visíveis para admin: todos exceto 'Concluído'
  const adminStatuses = ['Novos', 'Em Andamento', 'Pendente Cliente', 'Em Análise', 'Pendente ERP', 'Resolvido / Aguardando Validação'];
  const visibleStatuses = isAdmin ? adminStatuses : [];

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border rounded-xl sm:rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-card">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${statusColor.bg} ${statusColor.text} p-2.5 rounded-xl shrink-0`}>
              {statusColor.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  #{ticket.ticketId.split('_')[1]}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar size={12} />
                  {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight truncate">{ticket.title}</h2>
              {ticket.waitingForDepartment && ticket.status !== 'Em Análise' && ticket.status !== 'Pendente ERP' && (
                <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 animate-pulse">
                  <Clock size={12} />
                  Aguardando {ticket.waitingForDepartment}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
          
          {/* Left Column: Details & Activity */}
          <div className="lg:col-span-2 p-4 sm:p-5 space-y-6 overflow-y-auto">
            {/* Description */}
            <div className="bg-muted/30 rounded-xl p-4 border border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Briefcase size={14} />
                Descrição do Problema
              </h3>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ticket.description}
              </p>
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <User size={14} />
                Comentários ({comments.length})
              </h3>
              
              <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-4">Nenhum comentário ainda.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="bg-card border border-border rounded-xl p-3.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                            {comment.authorName.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-foreground">{comment.authorName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ptBR })}
                          </span>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteCommentClick(comment.id)}
                              className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors"
                              title="Deletar comentário"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground pl-8">{renderMentionText(comment.content)}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="relative">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <MentionInput
                      value={commentText}
                      onChange={setCommentText}
                      onMentionsChange={setMentionIds}
                      placeholder="Escreva um comentário... Use @ para mencionar alguém"
                      className="w-full rounded-xl bg-card border border-border text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
                      disabled={addCommentMutation.isPending}
                      rows={2}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addCommentMutation.isPending || !commentText.trim()}
                    className="p-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {addCommentMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </form>
            </div>

            {/* Activity Feed */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Histórico de Atividades</h3>
              <div className="relative pl-4 border-l-2 border-border space-y-5">
                {activities.map((activity) => (
                  <div key={activity.id} className="relative">
                    <div className="absolute -left-[13px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-200 border-2 border-background"></div>
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true, locale: ptBR })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{activity.authorName}</span>{' '}
                      {activity.description}
                    </div>
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Nenhuma atividade registrada.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Metadata & Actions */}
          <div className="bg-muted/20 p-4 sm:p-5 space-y-6 overflow-y-auto">
            {/* Status Control */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 block">Status</label>
              {/* Admin: pode alterar para todos os status exceto 'Concluído' */}
              {isAdmin && (
                <div className="grid grid-cols-2 gap-1.5">
                  {adminStatuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      disabled={updateTicketMutation.isPending}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all border ${
                        selectedStatus === status
                          ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                          : 'bg-card border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      } disabled:opacity-50`}
                    >
                      {status === 'Resolvido / Aguardando Validação' ? 'Resolvido' : status}
                    </button>
                  ))}
                </div>
              )}

              {/* Usuário: apenas visualiza o status atual */}
              {!isAdmin && (
                <div className="space-y-3">
                  <div className={`px-3 py-2 rounded-lg text-xs font-medium border inline-block ${
                    selectedStatus === 'Resolvido / Aguardando Validação'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                  }`}>
                    {selectedStatus}
                  </div>

                  {/* Botão de concluir: somente se for o solicitante e status for 'Resolvido / Aguardando Validação' */}
                  {isTicketCreator && ticket.status === 'Resolvido / Aguardando Validação' && (
                    <button
                      onClick={() => setShowEvaluationModal(true)}
                      className="w-full px-3 py-2.5 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle size={14} />
                      Concluir e Avaliar Atendimento
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Properties */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Prioridade</label>
                {isAdmin ? (
                  <select
                    value={selectedPriority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    disabled={updateTicketMutation.isPending}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-colors text-sm"
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Crítica">Crítica</option>
                  </select>
                ) : (
                  <div className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-card border border-border ${priorityColors[ticket.priority]}`}>
                    {ticket.priority}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Categoria</label>
                <div className="flex items-center gap-2 text-foreground bg-card px-3 py-2 rounded-lg border border-border text-sm">
                  <Tag size={14} className="text-muted-foreground shrink-0" />
                  {ticket.category}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Setor</label>
                <select
                  value={selectedDepartmentId?.toString() || ""}
                  onChange={(e) => handleDepartmentChange(e.target.value ? parseInt(e.target.value) : null)}
                  disabled={updateTicketMutation.isPending}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-colors text-sm"
                >
                  <option value="">Sem setor</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Responsável</label>
                {isAdmin ? (
                  <select
                    value={selectedAssigned}
                    onChange={(e) => handleAssignChange(e.target.value)}
                    disabled={updateTicketMutation.isPending}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-colors text-sm"
                  >
                    <option value="">Não atribuído</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.name || ''}>
                        {u.name || `Usuário ${u.id}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm">
                    {selectedAssigned || 'Não atribuído'}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anexos</label>
                <span className="bg-muted text-foreground px-1.5 py-0.5 rounded text-[10px] font-medium">{attachments.length}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-card border border-border hover:border-blue-200 transition-colors group">
                    <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 shrink-0">
                      <Paperclip size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate font-medium">{attachment.fileName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true, locale: ptBR })} · {attachment.uploadedByName}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(attachment.mimeType?.startsWith('image/') || attachment.mimeType === 'application/pdf') && (
                        <button
                          onClick={() => setPreviewAttachment(attachment)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          title="Visualizar"
                        >
                          <Eye size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(attachment.fileUrl, attachment.fileName)}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                        title="Baixar arquivo"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {showUpload ? (
                <div className="space-y-2">
                  <FileUpload
                    ticketId={ticket.id}
                    onUploadComplete={handleUploadComplete}
                  />
                  <button
                    onClick={() => setShowUpload(false)}
                    className="w-full px-3 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowUpload(true)}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:bg-card hover:text-foreground hover:border-blue-300 transition-all flex items-center justify-center gap-2 text-xs font-medium"
                >
                  <Paperclip size={14} />
                  Adicionar Anexo
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>

    {/* Attachment Preview */}
    {previewAttachment && (
      <AttachmentPreview
        fileUrl={previewAttachment.fileUrl}
        fileName={previewAttachment.fileName}
        mimeType={previewAttachment.mimeType}
        onClose={() => setPreviewAttachment(null)}
      />
    )}

    {/* Evaluation Modal */}
    {showEvaluationModal && (
      <TicketEvaluationModal
        ticketId={ticket.id}
        ticketTitle={ticket.title}
        onClose={() => setShowEvaluationModal(false)}
        onSuccess={() => {
          setShowEvaluationModal(false);
          onClose();
          onUpdate?.();
        }}
      />
    )}

    {/* Delete Comment Confirmation Dialog */}
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent className="bg-background border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Deletar comentário?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Tem certeza que deseja deletar este comentário? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3 justify-end">
          <AlertDialogCancel className="bg-card text-foreground hover:bg-muted border-border">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Deletar
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
