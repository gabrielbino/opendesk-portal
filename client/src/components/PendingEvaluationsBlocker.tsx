import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Star, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface PendingTicket {
  id: number;
  ticketId: string;
  title: string;
  category: string;
  priority: string;
  updatedAt: number;
}

interface PendingEvaluationsBlockerProps {
  pendingTickets: PendingTicket[];
  onClose: () => void;
  onAllResolved: () => void;
}

export default function PendingEvaluationsBlocker({
  pendingTickets,
  onClose,
  onAllResolved,
}: PendingEvaluationsBlockerProps) {
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [observations, setObservations] = useState<Record<number, string>>({});
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const evaluateMutation = trpc.ticketEvaluations.create.useMutation({
    onSuccess: (_, variables) => {
      setCompletedIds(prev => {
        const next = new Set(prev);
        next.add(variables.ticketId);
        return next;
      });
      setEvaluatingId(null);
      toast.success('Chamado avaliado e encerrado com sucesso!');

      // Check if all tickets are now resolved
      const remaining = pendingTickets.filter(t => !completedIds.has(t.id) && t.id !== variables.ticketId);
      if (remaining.length === 0) {
        utils.ticketEvaluations.getPendingForUser.invalidate();
        utils.tickets.list.invalidate();
        setTimeout(() => onAllResolved(), 500);
      }
    },
    onError: (error) => {
      toast.error('Erro ao avaliar: ' + error.message);
    },
  });

  const handleEvaluate = (ticketId: number) => {
    const rating = ratings[ticketId];
    if (!rating) {
      toast.error('Selecione uma nota de 1 a 5 estrelas');
      return;
    }
    evaluateMutation.mutate({
      ticketId,
      rating,
      observation: observations[ticketId] || undefined,
    });
  };

  const remainingTickets = pendingTickets.filter(t => !completedIds.has(t.id));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card border border-border rounded-xl p-5 md:p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">
                Chamados Pendentes de Avaliacao
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Voce possui {remainingTickets.length} chamado{remainingTickets.length !== 1 ? 's' : ''} aguardando
                sua validacao. Finalize-os para poder abrir novos chamados.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-muted/50 rounded-lg text-muted-foreground hover:text-foreground transition shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tickets list */}
          <div className="space-y-3">
            {remainingTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="border border-border rounded-lg overflow-hidden"
              >
                {/* Ticket header */}
                <div
                  className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition"
                  onClick={() => setEvaluatingId(evaluatingId === ticket.id ? null : ticket.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock size={14} className="text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">{ticket.ticketId}</p>
                      <p className="text-sm font-medium text-foreground truncate">{ticket.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      ticket.priority === 'Critica' ? 'bg-red-100 text-red-700' :
                      ticket.priority === 'Alta' ? 'bg-orange-100 text-orange-700' :
                      ticket.priority === 'Media' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {ticket.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {evaluatingId === ticket.id ? 'Fechar' : 'Avaliar'}
                    </span>
                  </div>
                </div>

                {/* Evaluation form (expandable) */}
                <AnimatePresence>
                  {evaluatingId === ticket.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 border-t border-border space-y-3">
                        {/* Star rating */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            Avaliacao do atendimento *
                          </label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setRatings(prev => ({ ...prev, [ticket.id]: star }))}
                                className="p-0.5 transition-transform hover:scale-110"
                              >
                                <Star
                                  size={24}
                                  className={`transition-colors ${
                                    (ratings[ticket.id] || 0) >= star
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-muted-foreground/30'
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Observation */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                            Observacao (opcional)
                          </label>
                          <textarea
                            value={observations[ticket.id] || ''}
                            onChange={(e) => setObservations(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                            placeholder="Como foi o atendimento?"
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition resize-none"
                          />
                        </div>

                        {/* Submit button */}
                        <button
                          onClick={() => handleEvaluate(ticket.id)}
                          disabled={evaluateMutation.isPending || !ratings[ticket.id]}
                          className="w-full py-2 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
                        >
                          {evaluateMutation.isPending ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Avaliando...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={14} />
                              Avaliar e Encerrar Chamado
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* All completed message */}
          {remainingTickets.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-6"
            >
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Todos os chamados foram avaliados!</p>
              <p className="text-xs text-muted-foreground mt-1">Voce ja pode abrir novos chamados.</p>
            </motion.div>
          )}

          {/* Footer info */}
          {remainingTickets.length > 0 && (
            <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground text-center">
                Avalie todos os chamados acima para desbloquear a criacao de novos chamados.
                Chamados nao avaliados em 7 dias serao encerrados automaticamente.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
