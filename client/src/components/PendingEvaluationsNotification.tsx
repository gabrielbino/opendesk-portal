import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, CheckCircle, Clock } from 'lucide-react';
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

export default function PendingEvaluationsNotification() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  const { data: pendingTickets = [], isLoading } = trpc.ticketEvaluations.getPendingForUser.useQuery(undefined, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  useEffect(() => {
    // Show notification only once per session if there are pending tickets
    if (pendingTickets.length > 0 && !hasShown) {
      setIsOpen(true);
      setHasShown(true);
    }
  }, [pendingTickets, hasShown]);

  if (pendingTickets.length === 0) return null;

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleTicketClick = (ticketId: number) => {
    // The parent component should handle navigation
    handleClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-4 right-4 z-[100] max-w-md"
        >
          <div className="bg-gradient-to-br from-amber-100 to-orange-100 border border-amber-300 rounded-xl shadow-2xl overflow-hidden backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-amber-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-200 flex items-center justify-center">
                  <AlertCircle size={20} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Chamados Aguardando Avaliação</h3>
                  <p className="text-xs text-amber-200">{pendingTickets.length} chamado{pendingTickets.length !== 1 ? 's' : ''} pendente{pendingTickets.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-muted/50 rounded-lg transition-colors text-amber-200 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">Carregando...</p>
                </div>
              ) : (
                pendingTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="bg-card hover:bg-muted/50 rounded-lg p-3 cursor-pointer transition-colors border border-white/5 hover:border-amber-300"
                    onClick={() => handleTicketClick(ticket.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Clock size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-mono mb-0.5">{ticket.ticketId}</p>
                        <p className="text-sm text-foreground font-medium truncate">{ticket.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            {ticket.category}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            ticket.priority === 'Crítica' ? 'bg-red-100 text-red-700' :
                            ticket.priority === 'Alta' ? 'bg-orange-100 text-orange-700' :
                            ticket.priority === 'Média' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {ticket.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-amber-300 bg-card">
              <p className="text-xs text-amber-200 text-center">
                Clique em um chamado para avaliar e concluir
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
