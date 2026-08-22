/**
 * KanbanCardTemplate — Template unificado para cards do Kanban.
 *
 * Garante uniformidade visual entre ProjectCard e TicketCard:
 * - Altura mínima consistente (min-h)
 * - Zonas fixas: Alert → Header → Body → Footer
 * - Espaçamento padronizado
 * - Background branco, border-left colorido
 * - Responsividade mobile-first
 *
 * Uso:
 *   <KanbanCardTemplate
 *     borderColor="#f97316"
 *     alert={<AlertBanner />}        // opcional
 *     header={<CardHeader />}        // obrigatório
 *     body={<CardBody />}            // opcional
 *     footer={<CardFooter />}        // opcional
 *     isDragging={false}
 *     isUrgent={false}
 *     isPulsing={false}
 *     onClick={() => {}}
 *   />
 */
import { Card } from '@/components/ui/card';
import type { ReactNode } from 'react';

export type KanbanCardTemplateProps = {
  /** Cor da borda esquerda do card */
  borderColor: string;
  /** Zona de alerta (deadline, tratamento, etc.) — renderizado no topo */
  alert?: ReactNode;
  /** Zona do header (título, badges de prioridade, ações) */
  header: ReactNode;
  /** Zona do body (descrição, tags) */
  body?: ReactNode;
  /** Zona do footer (responsável, data, meta) */
  footer?: ReactNode;
  /** Estado de drag ativo */
  isDragging?: boolean;
  /** Card com urgência (deadline próximo) */
  isUrgent?: boolean;
  /** Card com animação de pulse (em tratamento) */
  isPulsing?: boolean;
  /** Handler de clique */
  onClick?: () => void;
  /** Classes adicionais */
  className?: string;
};

export default function KanbanCardTemplate({
  borderColor,
  alert,
  header,
  body,
  footer,
  isDragging = false,
  isUrgent = false,
  isPulsing = false,
  onClick,
  className = '',
}: KanbanCardTemplateProps) {
  return (
    <Card
      onClick={onClick}
      className={[
        // Base
        'p-3 cursor-pointer transition-all bg-white relative overflow-hidden',
        // Altura mínima para uniformidade
        'min-h-[120px]',
        // Flex column para distribuir zonas
        'flex flex-col',
        // Estados
        isDragging ? 'opacity-50 rotate-1 scale-105 shadow-xl' : '',
        isUrgent ? 'ring-1 ring-red-300' : '',
        isPulsing ? 'shadow-lg' : 'hover:shadow-md',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        borderLeft: `4px solid ${isUrgent ? '#dc2626' : borderColor}`,
        ...(isPulsing && !isUrgent ? { animation: 'card-pulse 2s ease-in-out infinite' } : {}),
      }}
    >
      {/* Zona 1: Alertas (deadline, tratamento, status ativo) */}
      {alert && <div className="mb-2">{alert}</div>}

      {/* Zona 2: Header (título, badge prioridade, ações) */}
      <div className="mb-2">{header}</div>

      {/* Zona 3: Body (descrição, tags de status/prioridade) */}
      {body && <div className="mb-2 flex-1">{body}</div>}

      {/* Zona 4: Footer (responsável, data) */}
      {footer && <div className="mt-auto pt-1 border-t border-gray-100">{footer}</div>}
    </Card>
  );
}
