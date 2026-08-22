import { useState } from 'react';
import { Star, X, Send, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  operatorId: number;
  operatorName: string;
  onRatingSubmitted?: () => void;
}

export default function RatingModal({
  isOpen,
  onClose,
  conversationId,
  operatorId,
  operatorName,
  onRatingSubmitted,
}: RatingModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRatingMutation = trpc.chatRatings.submit.useMutation();

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Por favor, selecione uma avaliação');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitRatingMutation.mutateAsync({
        conversationId,
        operatorId,
        operatorName,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success('Obrigado pela sua avaliação!');
      onRatingSubmitted?.();
      onClose();
    } catch (error) {
      toast.error('Erro ao enviar avaliação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const ratingLabels = [
    '',
    'Muito Ruim',
    'Ruim',
    'Regular',
    'Bom',
    'Excelente',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              <h3 className="font-semibold">Avalie o Atendimento</h3>
            </div>
            <button
              onClick={handleSkip}
              className="p-1 hover:bg-accent rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-foreground/80 mt-1">
            Atendido por <span className="font-medium">{operatorName}</span>
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Stars */}
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground mb-3">
              Como foi seu atendimento?
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? 'fill-yellow-400 text-amber-700'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              ))}
            </div>
            {(hoveredRating || rating) > 0 && (
              <p className="text-sm font-medium mt-2 text-foreground">
                {ratingLabels[hoveredRating || rating]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="text-sm text-muted-foreground mb-2 block">
              Deixe um comentário (opcional)
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiência..."
              className="resize-none h-24"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              {comment.length}/500
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleSkip}
              className="flex-1"
              disabled={isSubmitting}
            >
              Pular
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
              disabled={isSubmitting || rating === 0}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  Enviar Avaliação
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-muted/50 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            Sua avaliação nos ajuda a melhorar nosso atendimento
          </p>
        </div>
      </div>
    </div>
  );
}
