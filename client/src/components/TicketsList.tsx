import { Clock, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ticket } from '@/pages/Dashboard';
import { trpc } from '@/lib/trpc';
import { DeleteTicketButton } from './DeleteTicketButton';
import { motion } from 'framer-motion';

interface TicketsListProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  'Novos':                              { label: 'Novo',          className: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Em Andamento':                       { label: 'Em Andamento',  className: 'bg-amber-50 text-amber-500 border-amber-200' },
  'Pendente Cliente':                   { label: 'Pend. Cliente', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Em Análise':                         { label: 'Em Análise',    className: 'bg-cyan-50 text-primary border-cyan-200' },
  'Pendente ERP':                   { label: 'Pend. ERP', className: 'bg-orange-50 text-orange-600 border-orange-200' },
  'Concluído':                          { label: 'Concluído',     className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Resolvido / Aguardando Validação':   { label: 'Aguard. Valid.', className: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const priorityConfig: Record<string, { dot: string; label: string; text: string }> = {
  'Baixa':   { dot: 'bg-emerald-500', label: 'Baixa',   text: 'text-emerald-500' },
  'Média':   { dot: 'bg-amber-500',   label: 'Média',   text: 'text-amber-500' },
  'Alta':    { dot: 'bg-red-500',     label: 'Alta',    text: 'text-red-500' },
  'Crítica': { dot: 'bg-red-600',     label: 'Crítica', text: 'text-red-600' },
};

const priorityAccent: Record<string, string> = {
  'Baixa':   'border-l-emerald-500',
  'Média':   'border-l-amber-500',
  'Alta':    'border-l-red-500',
  'Crítica': 'border-l-red-600',
};

export default function TicketsList({ tickets, onSelectTicket }: TicketsListProps) {
  const { data: departments = [] } = trpc.departments.list.useQuery();

  const getDepartmentName = (departmentId: number | null) => {
    if (!departmentId) return null;
    return departments.find(d => d.id === departmentId)?.name || null;
  };

  if (tickets.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Table header (desktop) */}
      <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chamado</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Responsável</span>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criado</span>
        <span className="sr-only">Ações</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {tickets.map((ticket, index) => {
          const statusStyle = statusConfig[ticket.status] || statusConfig['Novos'];
          const prioStyle   = priorityConfig[ticket.priority] || priorityConfig['Média'];
          const accentClass = priorityAccent[ticket.priority] || 'border-l-slate-400';
          const deptName    = getDepartmentName(ticket.departmentId);

          return (
            <motion.div
              key={ticket.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.25 }}
              className={`group relative border-l-[3px] ${accentClass} hover:bg-accent/40 transition-colors`}
            >
              {/* Delete button */}
              <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <DeleteTicketButton ticketId={ticket.id} ticketTitle={ticket.title} />
              </div>

              {/* Desktop layout */}
              <div
                className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3.5 items-center cursor-pointer pr-10"
                onClick={() => onSelectTicket(ticket)}
              >
                {/* Title + meta */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {ticket.ticketId}
                    </span>
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${prioStyle.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${prioStyle.dot} shrink-0`} />
                      {prioStyle.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {ticket.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {deptName && (
                      <span className="text-[11px] text-muted-foreground">{deptName}</span>
                    )}
                    {ticket.waitingForDepartment && ticket.status !== 'Concluído' && (
                      <span className="flex items-center gap-1 text-[11px] text-orange-600">
                        <Clock size={10} />
                        Aguardando {ticket.waitingForDepartment}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${statusStyle.className}`}>
                    {statusStyle.label}
                  </span>
                </div>

                {/* Assigned */}
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">
                    {ticket.assignedToName || <span className="text-muted-foreground italic">Não atribuído</span>}
                  </p>
                </div>

                {/* Created */}
                <div>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.createdAt), { locale: ptBR, addSuffix: true })}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">{ticket.createdByName}</p>
                </div>

                {/* Arrow */}
                <ChevronRight size={15} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              </div>

              {/* Mobile layout */}
              <div
                className="md:hidden px-4 py-3.5 cursor-pointer pr-10"
                onClick={() => onSelectTicket(ticket)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {ticket.ticketId}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${statusStyle.className}`}>
                      {statusStyle.label}
                    </span>
                  </div>
                  <span className={`flex items-center gap-1 text-[11px] font-semibold shrink-0 ${prioStyle.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${prioStyle.dot}`} />
                    {prioStyle.label}
                  </span>
                </div>

                <p className="text-sm font-medium text-foreground mb-2 group-hover:text-primary transition-colors">
                  {ticket.title}
                </p>

                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{ticket.assignedToName || 'Não atribuído'}</span>
                  <span>{formatDistanceToNow(new Date(ticket.createdAt), { locale: ptBR, addSuffix: true })}</span>
                </div>

                {ticket.waitingForDepartment && ticket.status !== 'Concluído' && (
                  <div className="flex items-center gap-1 mt-1.5 text-[11px] text-orange-600">
                    <Clock size={10} />
                    Aguardando {ticket.waitingForDepartment}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
