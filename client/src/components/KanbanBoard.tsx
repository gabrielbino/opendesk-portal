import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, User, Link2, GripVertical, Zap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import KanbanCardTemplate from '@/components/templates/KanbanCardTemplate';

type Project = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  projectType?: string;
  integrationSystem?: string | null;
  startDate: number | null;
  endDate: number | null;
  createdByName: string;
  ownerName?: string | null;
  kanbanOrder?: number | null;
  isBeingTreated?: boolean | null;
  treatedByName?: string | null;
  treatedAt?: number | null;
};

type Ticket = {
  id: number;
  ticketId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdByName: string;
  assignedToName?: string | null;
  createdAt: number;
  [key: string]: any;
};

type KanbanBoardProps = {
  projects: Project[];
  tickets?: Ticket[];
  onStatusChange: (projectId: number, newStatus: string) => void;
  onProjectClick: (project: Project) => void;
  onTicketClick?: (ticket: Ticket) => void;
  onTicketStatusChange?: () => void;
  onProjectsRefresh?: () => void;
};

const typeColumns = [
  { id: 'integracao interna', title: 'Integração Interna', color: 'bg-orange-500', bgLight: 'bg-orange-50', borderColor: '#f97316', dbValue: 'Integração Interna' },
  { id: 'integracao externa', title: 'Integração Externa', color: 'bg-teal-500', bgLight: 'bg-teal-50', borderColor: '#14b8a6', dbValue: 'Integração Externa' },
];

const ticketStatusColumns = [
  { id: 'Novos', title: 'Novos', color: 'bg-blue-500', bgLight: 'bg-blue-50', borderColor: '#3b82f6' },
  { id: 'Em Andamento', title: 'Em Andamento', color: 'bg-amber-500', bgLight: 'bg-amber-50', borderColor: '#f59e0b' },
  { id: 'Pendente Cliente', title: 'Pendente Cliente', color: 'bg-purple-500', bgLight: 'bg-purple-50', borderColor: '#8b5cf6' },
  { id: 'Em Análise', title: 'Em Análise', color: 'bg-green-500', bgLight: 'bg-green-50', borderColor: '#10b981' },
  { id: 'Pendente ERP', title: 'Pendente ERP', color: 'bg-orange-500', bgLight: 'bg-orange-50', borderColor: '#f97316' },
];

const statusColors: Record<string, string> = {
  'Planejamento': 'bg-gray-100 text-gray-800',
  'Em Andamento': 'bg-blue-100 text-blue-800',
  'Concluído': 'bg-green-100 text-green-800',
  'Cancelado': 'bg-red-100 text-red-800',
};

const priorityColors: Record<string, string> = {
  'Baixa': 'bg-gray-500',
  'Média': 'bg-blue-500',
  'Alta': 'bg-orange-500',
  'Crítica': 'bg-red-500',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeProjectType(projectType?: string): string {
  if (!projectType) return 'integracao interna';
  return projectType
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}

// ─── Project Card (usando KanbanCardTemplate) ────────────────────────────────

function ProjectCard({
  project,
  isDragging,
  isTopPriority,
  onToggleTreatment,
}: {
  project: Project;
  isDragging?: boolean;
  isTopPriority?: boolean;
  onToggleTreatment?: (e: React.MouseEvent) => void;
}) {
  const typeColumn = typeColumns.find(t => t.id === normalizeProjectType(project.projectType));
  const borderColor = typeColumn?.borderColor || '#6b7280';

  // Deadline urgency check (4 days or less)
  const getDeadlineUrgency = () => {
    if (!project.endDate || project.status === 'Concluído' || project.status === 'Cancelado') return null;
    const now = new Date();
    const deadline = new Date(Number(project.endDate));
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return { urgent: true, daysText: `${Math.abs(diffDays)} dia${Math.abs(diffDays) !== 1 ? 's' : ''} atrasado` };
    } else if (diffDays <= 4) {
      return { urgent: true, daysText: diffDays === 0 ? 'Vence hoje!' : `Vence em ${diffDays} dia${diffDays !== 1 ? 's' : ''}` };
    }
    return null;
  };
  const deadlineUrgency = getDeadlineUrgency();

  const isPulsing = project.isBeingTreated === true;
  const isActive = project.status === 'Em Andamento';
  const treatedBy = project.treatedByName || project.ownerName || project.createdByName;
  const projectOwner = project.ownerName || project.createdByName;

  // ─── Alert Zone ───
  const alertContent = (() => {
    const alerts: React.ReactNode[] = [];

    if (deadlineUrgency?.urgent) {
      alerts.push(
        <div key="deadline" className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          <AlertTriangle size={11} className="text-red-600 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-red-700">{deadlineUrgency.daysText}</span>
        </div>
      );
    }

    if (isPulsing) {
      alerts.push(
        <Tooltip key="treating">
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-md px-2 py-1 cursor-default w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
              </span>
              <span className="text-[10px] font-bold text-orange-700 whitespace-nowrap max-w-[100px] truncate">
                {treatedBy}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {project.treatedAt
              ? <>Em tratamento desde {format(new Date(project.treatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
              : <>⚡ Em tratamento</>}
          </TooltipContent>
        </Tooltip>
      );
    }

    if (!isPulsing && isActive) {
      alerts.push(
        <div key="active" className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-md px-2 py-1 w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[10px] font-semibold text-green-700 whitespace-nowrap max-w-[90px] truncate">
            {projectOwner}
          </span>
        </div>
      );
    }

    return alerts.length > 0 ? <div className="flex flex-col gap-1">{alerts}</div> : undefined;
  })();

  // ─── Header Zone ───
  const headerContent = (
    <div className="flex justify-between items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isTopPriority && (
            <Badge className="bg-yellow-500 text-foreground text-[10px] px-1.5 py-0">★ Prioridade</Badge>
          )}
          <h4 className="font-bold text-sm text-gray-900 leading-tight line-clamp-2 flex-1">{project.name}</h4>
          {(normalizeProjectType(project.projectType) === 'integracao interna' || normalizeProjectType(project.projectType) === 'integracao externa') && (
            <Link2 size={13} className="text-purple-600 flex-shrink-0" />
          )}
        </div>
      </div>
      {onToggleTreatment && (
        <button
          title={isPulsing ? 'Desmarcar como em tratamento' : 'Marcar como em tratamento agora'}
          onClick={onToggleTreatment}
          className={`ml-1 flex-shrink-0 rounded-full p-1 transition-colors ${
            isPulsing
              ? 'text-orange-500 bg-orange-50 hover:bg-orange-100'
              : 'text-muted-foreground hover:text-orange-600 hover:bg-orange-50'
          }`}
        >
          <Zap size={13} fill={isPulsing ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );

  // ─── Body Zone ───
  const bodyContent = (
    <div>
      {project.description && (
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{project.description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`text-[10px] px-1.5 py-0 ${priorityColors[project.priority] || 'bg-gray-500'}`}>
          {project.priority}
        </Badge>
        <Badge className={`text-[10px] px-1.5 py-0 ${statusColors[project.status] || 'bg-gray-100 text-gray-800'}`}>
          {project.status}
        </Badge>
      </div>
    </div>
  );

  // ─── Footer Zone ───
  const footerContent = (
    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
      <div className="flex items-center gap-1.5">
        {isActive || isPulsing ? (
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full text-white text-[9px] font-bold flex-shrink-0"
            style={{ backgroundColor: isPulsing ? '#f97316' : borderColor }}
          >
            {getInitials(treatedBy)}
          </div>
        ) : (
          <User size={11} className="flex-shrink-0" />
        )}
        <span className={`truncate max-w-[80px] ${isActive || isPulsing ? 'font-semibold text-gray-700' : ''}`}>
          {projectOwner}
        </span>
      </div>
      {project.endDate && (
        <div className="flex items-center gap-1">
          <Calendar size={11} />
          <span>{format(project.endDate, 'dd/MM', { locale: ptBR })}</span>
        </div>
      )}
    </div>
  );

  return (
    <KanbanCardTemplate
      borderColor={borderColor}
      alert={alertContent}
      header={headerContent}
      body={bodyContent}
      footer={footerContent}
      isDragging={isDragging}
      isUrgent={!!deadlineUrgency?.urgent}
      isPulsing={isPulsing}
    />
  );
}

// ─── Ticket Card (usando KanbanCardTemplate) ─────────────────────────────────

function TicketCard({ ticket, isDragging, isTopPriority, borderColor, onTicketClick }: {
  ticket: Ticket;
  isDragging?: boolean;
  isTopPriority?: boolean;
  borderColor: string;
  onTicketClick?: (ticket: Ticket) => void;
}) {
  // ─── Header Zone ───
  const headerContent = (
    <div className="flex items-start gap-1.5">
      <GripVertical size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          {isTopPriority && (
            <Badge className="bg-yellow-500 text-foreground text-[10px] px-1.5 py-0">★ Prioridade</Badge>
          )}
        </div>
        <h4 className="font-bold text-sm text-gray-900 leading-tight line-clamp-2">{ticket.title}</h4>
      </div>
    </div>
  );

  // ─── Body Zone ───
  const bodyContent = (
    <div>
      {ticket.description && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{ticket.description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`text-[10px] px-1.5 py-0 ${
          ticket.priority === 'Crítica' ? 'bg-red-100 text-red-800' :
          ticket.priority === 'Alta' ? 'bg-orange-100 text-orange-800' :
          ticket.priority === 'Média' ? 'bg-yellow-100 text-yellow-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {ticket.priority}
        </Badge>
        <span className="text-[10px] text-muted-foreground font-mono">#{ticket.ticketId?.split('_')[1] || ticket.id}</span>
      </div>
    </div>
  );

  // ─── Footer Zone ───
  const footerContent = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
      <User size={11} className="flex-shrink-0" />
      <span className="truncate max-w-[120px]">{ticket.createdByName}</span>
    </div>
  );

  return (
    <KanbanCardTemplate
      borderColor={borderColor}
      header={headerContent}
      body={bodyContent}
      footer={footerContent}
      isDragging={isDragging}
      onClick={() => onTicketClick?.(ticket)}
    />
  );
}

// ─── Sortable Wrappers ───────────────────────────────────────────────────────

function SortableProjectCard({
  project,
  onProjectClick,
  isTopPriority,
  onToggleTreatment,
}: {
  project: Project;
  onProjectClick: (project: Project) => void;
  isTopPriority?: boolean;
  onToggleTreatment?: (projectId: number, current: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `project-${project.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleTreatment?.(project.id, !!project.isBeingTreated);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onProjectClick(project)}
    >
      <ProjectCard
        project={project}
        isDragging={isDragging}
        isTopPriority={isTopPriority}
        onToggleTreatment={handleToggle}
      />
    </div>
  );
}

function SortableTicketCard({ ticket, onTicketClick, isTopPriority, borderColor }: {
  ticket: Ticket;
  onTicketClick?: (ticket: Ticket) => void;
  isTopPriority?: boolean;
  borderColor: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `ticket-${ticket.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onTicketClick?.(ticket)}
      className="cursor-grab active:cursor-grabbing"
    >
      <TicketCard ticket={ticket} isDragging={isDragging} isTopPriority={isTopPriority} borderColor={borderColor} />
    </div>
  );
}

// ─── Column Components ───────────────────────────────────────────────────────

function KanbanTypeColumn({
  typeColumn,
  projects,
  onProjectClick,
  isOver,
  onToggleTreatment,
}: {
  typeColumn: typeof typeColumns[0];
  projects: Project[];
  onProjectClick: (project: Project) => void;
  isOver?: boolean;
  onToggleTreatment?: (projectId: number, current: boolean) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `type-col-${typeColumn.id}` });
  const topPriorityIds = new Set(projects.slice(0, 3).map(p => p.id));

  return (
    <div className="flex-shrink-0 w-[280px] sm:w-[300px]">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${typeColumn.color}`} />
          <h3 className="font-semibold text-sm truncate">{typeColumn.title}</h3>
          <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">{projects.length}</Badge>
        </div>
        <div className="h-1 bg-gray-200 rounded-full">
          <div className={`h-full ${typeColumn.color} rounded-full`} style={{ width: '100%' }} />
        </div>
      </div>
      <SortableContext items={projects.map(p => `project-${p.id}`)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-2 p-2.5 rounded-xl min-h-[420px] transition-all ${typeColumn.bgLight} ${
            isOver ? 'ring-2 ring-offset-1' : ''
          }`}
          style={isOver ? { outline: `2px dashed ${typeColumn.borderColor}` } : {}}
        >
          {projects.length > 0 ? (
            projects.map((project) => (
              <SortableProjectCard
                key={project.id}
                project={project}
                onProjectClick={onProjectClick}
                isTopPriority={topPriorityIds.has(project.id)}
                onToggleTreatment={onToggleTreatment}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum projeto</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function TicketStatusColumn({
  column,
  tickets,
  onTicketClick,
}: {
  column: typeof ticketStatusColumns[0];
  tickets: Ticket[];
  onTicketClick?: (ticket: Ticket) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `ticket-col-${column.id}` });
  const topPriorityIds = new Set(tickets.slice(0, 3).map(t => t.id));

  return (
    <div className="flex-shrink-0 w-[280px] sm:w-[300px]">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${column.color}`} />
          <h3 className="font-semibold text-sm">{column.title}</h3>
          <Badge variant="secondary" className="ml-auto text-xs">{tickets.length}</Badge>
        </div>
        <div className="h-1 bg-gray-200 rounded-full">
          <div className={`h-full ${column.color} rounded-full`} style={{ width: '100%' }} />
        </div>
      </div>
      <SortableContext items={tickets.map(t => `ticket-${t.id}`)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-2 p-2.5 rounded-xl min-h-[420px] transition-colors ${
            isOver ? 'bg-opacity-80 ring-2 ring-offset-1 ring-current' : ''
          } ${column.bgLight}`}
          style={isOver ? { outline: `2px dashed ${column.borderColor}` } : {}}
        >
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <SortableTicketCard
                key={ticket.id}
                ticket={ticket}
                onTicketClick={onTicketClick}
                isTopPriority={topPriorityIds.has(ticket.id)}
                borderColor={column.borderColor}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">Nenhum chamado</div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main KanbanBoard ─────────────────────────────────────────────────────────

export default function KanbanBoard({
  projects,
  tickets = [],
  onStatusChange,
  onProjectClick,
  onTicketClick,
  onTicketStatusChange,
  onProjectsRefresh,
}: KanbanBoardProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [projectsState, setProjectsState] = useState<Project[]>(projects);
  const [projectTypeOverride, setProjectTypeOverride] = useState<Record<number, string>>({});
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [ticketStatusOverride, setTicketStatusOverride] = useState<Record<number, string>>({});
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  // Sync external projects prop into local state
  useEffect(() => {
    setProjectsState(projects);
  }, [projects]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const reorderMutation = trpc.projects.reorder.useMutation({
    onError: () => toast.error('Erro ao salvar ordem'),
  });

  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
    onError: () => toast.error('Erro ao mover projeto'),
  });

  const toggleTreatmentMutation = trpc.projects.toggleTreatment.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
    onError: () => toast.error('Erro ao atualizar status de tratamento'),
  });

  const updateTicketMutation = trpc.tickets.update.useMutation({
    onSuccess: () => onTicketStatusChange?.(),
    onError: (err, variables) => {
      setTicketStatusOverride(prev => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast.error('Erro ao atualizar status do chamado');
    },
  });

  // ── Toggle treatment handler ───────────────────────────────────────────────
  const handleToggleTreatment = useCallback((projectId: number, current: boolean) => {
    const newValue = !current;
    setProjectsState(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, isBeingTreated: newValue, treatedByName: newValue ? (p.ownerName || p.createdByName) : null, treatedAt: newValue ? Date.now() : null }
          : p
      )
    );
    toggleTreatmentMutation.mutate({ id: projectId, isBeingTreated: newValue });
    toast.success(newValue ? '⚡ Projeto marcado como em tratamento' : 'Tratamento encerrado');
  }, [toggleTreatmentMutation]);

  // ── Sensors ────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Derived data ───────────────────────────────────────────────────────────
  const ticketsWithOverride = tickets.map(t => ({
    ...t,
    status: ticketStatusOverride[t.id] ?? t.status,
  }));

  const ticketsByStatus = ticketStatusColumns.reduce((acc, col) => {
    acc[col.id] = ticketsWithOverride.filter(t => t.status === col.id);
    return acc;
  }, {} as Record<string, Ticket[]>);

  // Projects with type override applied
  const projectsWithOverride = projectsState.map(p => ({
    ...p,
    projectType: projectTypeOverride[p.id] !== undefined
      ? projectTypeOverride[p.id]
      : p.projectType,
  }));

  // Group projects by type column
  const projectsByType = typeColumns.reduce((acc, column) => {
    const filtered = projectsWithOverride.filter(p =>
      normalizeProjectType(p.projectType) === column.id
    );
    acc[column.id] = filtered.sort((a, b) => {
      const orderA = a.kanbanOrder ?? projectsWithOverride.indexOf(a);
      const orderB = b.kanbanOrder ?? projectsWithOverride.indexOf(b);
      return orderA - orderB;
    });
    return acc;
  }, {} as Record<string, Project[]>);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('project-')) {
      const projectId = Number(id.replace('project-', ''));
      setActiveProject(projectsWithOverride.find(p => p.id === projectId) || null);
      setActiveTicket(null);
    } else if (id.startsWith('ticket-')) {
      const ticketId = Number(id.replace('ticket-', ''));
      setActiveTicket(ticketsWithOverride.find(t => t.id === ticketId) || null);
      setActiveProject(null);
    }
  };

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // ── Ticket drag-over ──
    if (activeId.startsWith('ticket-')) {
      const ticketId = Number(activeId.replace('ticket-', ''));
      const ticket = ticketsWithOverride.find(t => t.id === ticketId);
      if (!ticket) return;

      if (overId.startsWith('ticket-col-')) {
        const newStatus = overId.replace('ticket-col-', '');
        if (newStatus !== ticket.status) {
          setTicketStatusOverride(prev => ({ ...prev, [ticketId]: newStatus }));
        }
      } else if (overId.startsWith('ticket-')) {
        const overTicketId = Number(overId.replace('ticket-', ''));
        const overTicket = ticketsWithOverride.find(t => t.id === overTicketId);
        if (overTicket && overTicket.status !== ticket.status) {
          setTicketStatusOverride(prev => ({ ...prev, [ticketId]: overTicket.status }));
        }
      }
      return;
    }

    // ── Project drag-over: detect column change ──
    if (activeId.startsWith('project-')) {
      if (overId.startsWith('type-col-')) {
        const colId = overId.replace('type-col-', '');
        setOverColumnId(colId);
        const projectId = Number(activeId.replace('project-', ''));
        const project = projectsWithOverride.find(p => p.id === projectId);
        if (project && normalizeProjectType(project.projectType) !== colId) {
          setProjectTypeOverride(prev => ({ ...prev, [projectId]: typeColumns.find(c => c.id === colId)?.dbValue || colId }));
        }
      } else if (overId.startsWith('project-')) {
        const overProjectId = Number(overId.replace('project-', ''));
        const overProject = projectsWithOverride.find(p => p.id === overProjectId);
        if (overProject) {
          setOverColumnId(normalizeProjectType(overProject.projectType));
        }
      }
    }
  }, [ticketsWithOverride, projectsWithOverride]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    setOverColumnId(null);

    // ── Ticket drop ──
    if (activeId.startsWith('ticket-')) {
      const ticketId = Number(activeId.replace('ticket-', ''));
      const newStatus = ticketStatusOverride[ticketId];
      const originalTicket = tickets.find(t => t.id === ticketId);
      if (newStatus && originalTicket && newStatus !== originalTicket.status) {
        updateTicketMutation.mutate({ id: ticketId, status: newStatus as any });
        toast.success(`Chamado movido para "${newStatus}"`);
      }
      setActiveTicket(null);
      return;
    }

    // ── Project drop ──
    if (activeId.startsWith('project-') && over) {
      const projectId = Number(activeId.replace('project-', ''));
      const project = projectsWithOverride.find(p => p.id === projectId);
      if (!project) { setActiveProject(null); return; }

      const overId = String(over.id);
      const currentType = normalizeProjectType(project.projectType);

      let targetType = currentType;
      if (overId.startsWith('type-col-')) {
        targetType = overId.replace('type-col-', '');
      } else if (overId.startsWith('project-')) {
        const overProjectId = Number(overId.replace('project-', ''));
        const overProject = projectsWithOverride.find(p => p.id === overProjectId);
        if (overProject) targetType = normalizeProjectType(overProject.projectType);
      }

      if (targetType !== currentType) {
        const newDbType = typeColumns.find(c => c.id === targetType)?.dbValue || targetType;
        updateProjectMutation.mutate({ id: projectId, projectType: newDbType as any });
        toast.success(`Projeto movido para "${typeColumns.find(c => c.id === targetType)?.title || targetType}"`);
      } else {
        if (overId.startsWith('project-')) {
          const overProjectId = Number(overId.replace('project-', ''));
          const col = projectsByType[currentType];
          const activeIndex = col.findIndex(p => p.id === projectId);
          const overIndex = col.findIndex(p => p.id === overProjectId);
          if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
            const reordered = arrayMove(col, activeIndex, overIndex);
            const colOffsets: Record<string, number> = {
              'integração interna': 1000, 'integracao interna': 1000,
              'integração externa': 2000, 'integracao externa': 2000,
              'chamados': 3000
            };
            const offset = colOffsets[currentType.toLowerCase()] ?? 1000;
            const updates = reordered.map((p, idx) => ({ id: p.id, kanbanOrder: offset + idx }));
            reorderMutation.mutate(updates);
            setProjectsState(prev => {
              const next = [...prev];
              reordered.forEach((p, idx) => {
                const i = next.findIndex(x => x.id === p.id);
                if (i !== -1) next[i] = { ...next[i], kanbanOrder: offset + idx };
              });
              return next;
            });
          }
        }
      }
    }

    setActiveProject(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 pb-6 px-1 overflow-x-auto">
        {/* Project Type Columns */}
        {typeColumns.map((column) => (
          <KanbanTypeColumn
            key={column.id}
            typeColumn={column}
            projects={projectsByType[column.id] || []}
            onProjectClick={onProjectClick}
            isOver={overColumnId === column.id}
            onToggleTreatment={handleToggleTreatment}
          />
        ))}

        {/* Divider */}
        <div className="flex flex-col items-center justify-start pt-2 flex-shrink-0">
          <div className="w-px bg-border h-full min-h-[400px]" />
        </div>

        {/* Ticket Column - single column showing all open tickets */}
        <div className="flex-shrink-0 w-[280px] sm:w-[300px]">
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0 bg-orange-500" />
              <h3 className="font-semibold text-sm truncate">Chamados</h3>
              <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">{tickets.length}</Badge>
            </div>
            <div className="h-1 bg-gray-200 rounded-full">
              <div className="h-full bg-orange-500 rounded-full" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="space-y-2 p-2.5 rounded-xl min-h-[420px] bg-orange-50">
            {tickets.length > 0 ? (
              tickets.map((ticket, idx) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onTicketClick={onTicketClick}
                  isTopPriority={idx < 3}
                  borderColor="#f97316"
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhum chamado</div>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeProject ? (
          <ProjectCard project={activeProject} isDragging />
        ) : activeTicket ? (
          <TicketCard
            ticket={activeTicket}
            isDragging
            borderColor={
              ticketStatusColumns.find(c => c.id === (ticketStatusOverride[activeTicket.id] ?? activeTicket.status))?.borderColor || '#6b7280'
            }
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
