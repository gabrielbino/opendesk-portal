import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { useLocation, useRoute } from 'wouter';

import {
  Plus, Search, Filter, Loader2,
  LayoutGrid, List, Star, MessageSquare,
  Headphones, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import TicketsList from '@/components/TicketsList';
import ChatBoxWithQueue from '@/components/ChatBoxWithQueue';
import OperatorPanel from '@/components/OperatorPanel';
import AdminChatView from '@/components/AdminChatView';
import OnlineOperators from '@/components/OnlineOperators';
import CreateTicketModal from '@/components/CreateTicketModal';
import PendingEvaluationsBlocker from '@/components/PendingEvaluationsBlocker';
import TicketDetailModal from '@/components/TicketDetailModal';
import { TicketKanbanBoard } from '@/components/TicketKanbanBoard';
import PanelHeader from '@/components/PanelHeader';
import { TicketViewProvider } from '@/contexts/TicketViewContext';
import TicketEvaluations from './TicketEvaluations';
import PendingEvaluationsNotification from '@/components/PendingEvaluationsNotification';
import { useState, useEffect } from 'react';

// Type for ticket from database
export type Ticket = {
  id: number;
  ticketId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  departmentId: number | null;
  createdById: number;
  createdByName: string;
  assignedToId: number | null;
  assignedToName: string | null;
  waitingForDepartment: string | null;
  lastRespondentRole: 'admin' | 'user' | null;
  lastRespondentId: number | null;
  lastRespondentName: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/suporte/:id');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPendingBlocker, setShowPendingBlocker] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    departmentId: undefined as number | undefined,
  });
  const [showChat, setShowChat] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [showOperatorPanel, setShowOperatorPanel] = useState(false);
  const [adminChat, setAdminChat] = useState<{ conversationId: number; queueId: number; userName: string } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [tabMode, setTabMode] = useState<'tickets' | 'evaluations'>('tickets');

  const { data: tickets = [], isLoading, refetch } = trpc.tickets.list.useQuery({
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    departmentId: filters.departmentId,
    search: searchQuery || undefined,
  });

  useEffect(() => {
    if (match && params?.id) {
      const ticketId = parseInt(params.id, 10);
      const ticket = tickets.find(t => t.id === ticketId);
      if (ticket) setSelectedTicket(ticket);
    }
  }, [match, params?.id, tickets]);

  const { data: announcements = [] } = trpc.announcements.list.useQuery();
  const { data: departments = [] } = trpc.departments.list.useQuery(undefined, {
    enabled: user?.role === 'admin',
  });
  const { data: adminUsers = [] } = trpc.users.listAdmins.useQuery(undefined, {
    enabled: user?.role === 'admin',
  });

  // Query para verificar chamados pendentes de avaliacao do usuario
  const { data: pendingEvaluations = [] } = trpc.ticketEvaluations.getPendingForUser.useQuery(undefined, {
    enabled: user?.role !== 'admin',
  });

  const handleNewTicketClick = () => {
    // Admins nao sao bloqueados
    if (user?.role === 'admin') {
      setShowCreateModal(true);
      return;
    }
    // Verificar se usuario tem chamados pendentes de avaliacao
    if (pendingEvaluations.length > 0) {
      setShowPendingBlocker(true);
    } else {
      setShowCreateModal(true);
    }
  };

  const handleTicketCreated = () => {
    setShowCreateModal(false);
    refetch();
    toast.success('Chamado criado com sucesso!');
  };

  const handleTicketUpdated = () => { refetch(); };


  const activeFiltersCount = [filters.status, filters.priority, filters.departmentId].filter(Boolean).length;

  return (
    <TicketViewProvider>
      {/* ── Full-viewport shell ── */}
      <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-[var(--background)]">

        {/* ── Header ── */}
        <header className="shrink-0 bg-[var(--background)]">
          <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] px-4 py-3 sm:px-6 lg:px-8">
            <PanelHeader
              onBack={() => setLocation('/dashboard')}
              backLabel="Portal"
              icon={MessageSquare}
              title="Suporte"
              subtitle="Help Desk"
              color="blue2"
              tabs={
                user?.role === 'admin'
                  ? [
                      { value: 'tickets', label: 'Chamados', icon: <LayoutGrid size={14} /> },
                      { value: 'evaluations', label: 'Avaliações', icon: <Star size={14} /> },
                    ]
                  : undefined
              }
              activeTab={tabMode}
              onTabChange={(v) => setTabMode(v as 'tickets' | 'evaluations')}
              tabsClassName="sm:max-w-xs"
            />
          </div>
        </header>

        {/* ── Body: scrollable main ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-6 max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >

              {/* ── Evaluations Tab ── */}
              {user?.role === 'admin' && tabMode === 'evaluations' && (
                <TicketEvaluations />
              )}

              {/* ── Tickets Tab ── */}
              {tabMode === 'tickets' && (
                <div className="space-y-4">

                  {/* Page header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h1 className="text-lg sm:text-xl font-bold text-foreground">
                        Central de Chamados
                      </h1>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Gerencie e acompanhe os chamados de suporte técnico
                      </p>
                    </div>
                    <button
                      onClick={handleNewTicketClick}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-sm shrink-0"
                    >
                      <Plus size={15} />
                      <span className="hidden xs:inline">Novo Chamado</span>
                      <span className="xs:hidden">Novo</span>
                    </button>
                  </div>

                  {/* Toolbar: search + filters + view mode */}
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    {/* Search */}
                    <div className="relative flex-1 min-w-0">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar chamados..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring transition-all"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Filters toggle */}
                      <button
                        onClick={() => setShowFilters(v => !v)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          showFilters || activeFiltersCount > 0
                            ? 'border-ring bg-ring/10 text-ring'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent'
                        }`}
                      >
                        <Filter size={14} />
                        <span className="hidden sm:inline">Filtros</span>
                        {activeFiltersCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {activeFiltersCount}
                          </span>
                        )}
                        {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {/* View mode (admin only) */}
                      {user?.role === 'admin' && (
                        <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
                          <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-all ${
                              viewMode === 'list'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                            title="Lista"
                          >
                            <List size={14} />
                            <span className="hidden md:inline text-xs">Lista</span>
                          </button>
                          <button
                            onClick={() => setViewMode('kanban')}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-all ${
                              viewMode === 'kanban'
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                            title="Kanban"
                          >
                            <LayoutGrid size={14} />
                            <span className="hidden md:inline text-xs">Kanban</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Filters Panel */}
                  <AnimatePresence>
                    {showFilters && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="rounded-xl border border-border bg-card p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status</label>
                              <select
                                value={filters.status}
                                onChange={e => setFilters({ ...filters, status: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
                              >
                                <option value="">Todos</option>
                                <option value="Novos">Novos</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Pendente Cliente">Pendente Cliente</option>
                                <option value="Em Análise">Em Análise</option>
                                <option value="Pendente ERP">Pendente ERP</option>
                                <option value="Resolvido / Aguardando Validação">Resolvido</option>
                                <option value="Concluído">Concluído</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Prioridade</label>
                              <select
                                value={filters.priority}
                                onChange={e => setFilters({ ...filters, priority: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
                              >
                                <option value="">Todas</option>
                                <option value="Baixa">Baixa</option>
                                <option value="Média">Média</option>
                                <option value="Alta">Alta</option>
                                <option value="Crítica">Crítica</option>
                              </select>
                            </div>
                            {user?.role === 'admin' && (
                              <div>
                                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Setor</label>
                                <select
                                  value={filters.departmentId?.toString() || ''}
                                  onChange={e => setFilters({ ...filters, departmentId: e.target.value ? parseInt(e.target.value) : undefined })}
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
                                >
                                  <option value="">Todos</option>
                                  {departments.map((dept: any) => (
                                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                          {activeFiltersCount > 0 && (
                            <button
                              onClick={() => setFilters({ status: '', priority: '', departmentId: undefined })}
                              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Limpar filtros
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tickets content */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-7 h-7 animate-spin text-primary" />
                    </div>
                  ) : user?.role === 'admin' && viewMode === 'kanban' ? (
                    <div className="kanban-page-wrapper">
                      <TicketKanbanBoard
                        tickets={tickets}
                        adminUsers={adminUsers.map((admin: any) => ({ id: admin.id, name: admin.name }))}
                        onSelectTicket={setSelectedTicket}
                      />
                    </div>
                  ) : (
                    <>
                      <TicketsList tickets={tickets} onSelectTicket={setSelectedTicket} />
                      {tickets.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                            <MessageSquare size={24} className="text-muted-foreground" />
                          </div>
                          <p className="text-foreground font-medium">Nenhum chamado encontrado</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {searchQuery || activeFiltersCount > 0
                              ? 'Tente ajustar os filtros de busca'
                              : 'Crie um novo chamado para começar'}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleTicketCreated}
        />
      )}
      {showPendingBlocker && (
        <PendingEvaluationsBlocker
          pendingTickets={pendingEvaluations}
          onClose={() => setShowPendingBlocker(false)}
          onAllResolved={() => {
            setShowPendingBlocker(false);
            setShowCreateModal(true);
          }}
        />
      )}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleTicketUpdated}
        />
      )}

      {/* ── Floating Action Buttons ── */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 z-50 bg-primary hover:opacity-90 text-primary-foreground p-4 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
          title="Abrir Chat de Suporte"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
          </svg>
        </button>
      )}
      {user?.role === 'admin' && (
        <button
          onClick={() => setShowOperatorPanel(true)}
          className="fixed bottom-6 right-24 z-50 bg-violet-600 hover:bg-violet-700 text-white p-4 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all"
          title="Painel de Atendimento"
        >
          <Headphones size={20} />
        </button>
      )}

      {/* ── Chat / Operator / Admin Chat ── */}
      {showChat && (
        <ChatBoxWithQueue
          onClose={() => setShowChat(false)}
          minimized={chatMinimized}
          onToggleMinimize={() => setChatMinimized(!chatMinimized)}
          className="shadow-2xl"
        />
      )}
      {showOperatorPanel && (
        <OperatorPanel
          isOpen={showOperatorPanel}
          onClose={() => setShowOperatorPanel(false)}
          onChatAccepted={(conversationId, queueId, userName) => {
            setShowOperatorPanel(false);
            setAdminChat({ conversationId, queueId, userName });
          }}
        />
      )}
      {adminChat && (
        <AdminChatView
          conversationId={adminChat.conversationId}
          queueId={adminChat.queueId}
          userName={adminChat.userName}
          onClose={() => setAdminChat(null)}
          onComplete={() => setAdminChat(null)}
        />
      )}

      <PendingEvaluationsNotification />
    </TicketViewProvider>
  );
}
