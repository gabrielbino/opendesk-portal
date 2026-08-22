import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X, CheckCircle, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface TicketEvaluationModalProps {
  ticketId: number;
  ticketTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TicketEvaluationModal({
  ticketId,
  ticketTitle,
  onClose,
  onSuccess,
}: TicketEvaluationModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [observation, setObservation] = useState('');

  const evaluateMutation = trpc.ticketEvaluations.create.useMutation({
    onSuccess: () => {
      toast.success('Chamado concluído e avaliação registrada! Obrigado pelo feedback.');
      onSuccess();
    },
    onError: (error) => {
      toast.error('Erro ao registrar avaliação: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error('Por favor, selecione uma nota de 1 a 5 estrelas.');
      return;
    }
    evaluateMutation.mutate({ ticketId, rating, observation: observation.trim() || undefined });
  };

  const ratingLabels: Record<number, string> = {
    1: 'Muito insatisfeito',
    2: 'Insatisfeito',
    3: 'Regular',
    4: 'Satisfeito',
    5: 'Muito satisfeito',
  };

  const activeRating = hoveredRating || rating;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-[#0f172a] border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={20} className="text-emerald-700" />
              </div>
              <div>
                <h2 className="text-foreground font-semibold text-base">Avaliar Atendimento</h2>
                <p className="text-muted-foreground text-xs mt-0.5">Sua avaliação é sigilosa</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Ticket info */}
            <div className="bg-card rounded-xl p-4 border border-white/5">
              <p className="text-xs text-muted-foreground mb-1">Chamado</p>
              <p className="text-sm text-foreground font-medium line-clamp-2">{ticketTitle}</p>
            </div>

            {/* Rating stars */}
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-4 block">
                Como você avalia o atendimento recebido?
              </label>
              <div className="flex items-center justify-center gap-3 mb-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      size={36}
                      className={`transition-colors ${
                        star <= activeRating
                          ? 'fill-amber-400 text-amber-500'
                          : 'fill-transparent text-slate-600'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {activeRating > 0 && (
                <motion.p
                  key={activeRating}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center text-sm text-amber-500 font-medium"
                >
                  {ratingLabels[activeRating]}
                </motion.p>
              )}
              {activeRating === 0 && (
                <p className="text-center text-sm text-muted-foreground">Clique em uma estrela para avaliar</p>
              )}
            </div>

            {/* Observation */}
            <div>
              <label className="text-sm font-semibold text-muted-foreground mb-2 block">
                Observação <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <textarea
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Descreva sua experiência com o atendimento..."
                rows={3}
                className="w-full rounded-xl bg-card border border-border text-foreground placeholder-slate-500 p-3 text-sm focus:outline-none focus:border-cyan-300 focus:bg-muted/50 transition-all resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{observation.length}/500</p>
            </div>

            {/* Sigilo notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-blue-700 text-[10px] font-bold">i</span>
              </div>
              <p className="text-xs text-blue-700">
                Sua avaliação é <strong>sigilosa</strong>. O administrador visualiza apenas o setor, nota e observação — sem identificação pessoal.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 pt-0 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-card hover:text-foreground transition-all text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={rating === 0 || evaluateMutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {evaluateMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Enviando...</>
              ) : (
                <><CheckCircle size={16} /> Concluir e Enviar</>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
