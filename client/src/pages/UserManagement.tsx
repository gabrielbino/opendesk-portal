import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocation } from 'wouter';
import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Loader2, UserCheck, UserX, Shield, User as UserIcon,
  Trash2, Clock, CheckCircle2, XCircle,
  Users, UserCog, Building2, Plus, Edit, Settings,
  Search, Filter, Power, PowerOff, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PermissionsDialog } from '@/components/PermissionsDialog';
import { GroupSelector } from '@/components/GroupSelector';
import { CreateUserModal } from '@/components/CreateUserModal';
import { EditUserModal } from '@/components/EditUserModal';
import { DataTablePagination } from '@/components/DataTablePagination';
import PanelHeader from '@/components/PanelHeader';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type Tab = 'pending' | 'all';

const PAGE_SIZE = 15;

export default function UserManagement() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [permissionsDialog, setPermissionsDialog] = useState<{ open: boolean; userId: number; userName: string; permissions: any } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const utils = trpc.useUtils();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);

  const { data: pendingUsers, isLoading: loadingPending } = trpc.userManagement.listPending.useQuery(
    undefined, { enabled: isAuthenticated && user?.role === 'admin' }
  );
  const { data: allUsers, isLoading: loadingAll } = trpc.userManagement.listAll.useQuery(
    undefined, { enabled: isAuthenticated && user?.role === 'admin' && activeTab === 'all' }
  );
  const { data: departments } = trpc.departments.list.useQuery(
    undefined, { enabled: isAuthenticated && user?.role === 'admin' }
  );
  const { data: groups } = trpc.permissionGroups.list.useQuery(
    undefined, { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const approveMutation = trpc.userManagement.approve.useMutation({
    onSuccess: () => { toast.success('Usuário aprovado!'); utils.userManagement.listPending.invalidate(); utils.userManagement.listAll.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const rejectMutation = trpc.userManagement.reject.useMutation({
    onSuccess: () => { toast.success('Usuário rejeitado'); utils.userManagement.listPending.invalidate(); utils.userManagement.listAll.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const updateRoleMutation = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => { toast.success('Papel atualizado'); utils.userManagement.listAll.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.userManagement.delete.useMutation({
    onSuccess: () => { toast.success('Usuário excluído'); utils.userManagement.listPending.invalidate(); utils.userManagement.listAll.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const toggleEnabledMutation = trpc.userManagement.toggleEnabled.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.enabled ? 'Usuário habilitado' : 'Usuário desabilitado');
      utils.userManagement.listAll.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Filtered and paginated users
  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    let result = [...allUsers];

    // Search by name or email
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    // Filter by department
    if (filterDepartment !== 'all') {
      const deptId = parseInt(filterDepartment);
      result = result.filter(u => u.departmentId === deptId);
    }

    // Filter by group
    if (filterGroup !== 'all') {
      if (filterGroup === 'none') {
        result = result.filter(u => !u.groupId);
      } else {
        const gId = parseInt(filterGroup);
        result = result.filter(u => u.groupId === gId);
      }
    }

    // Filter by status (enabled/disabled)
    if (filterStatus !== 'all') {
      if (filterStatus === 'enabled') {
        result = result.filter(u => u.enabled !== false);
      } else if (filterStatus === 'disabled') {
        result = result.filter(u => u.enabled === false);
      }
    }

    return result;
  }, [allUsers, searchQuery, filterDepartment, filterGroup, filterStatus]);

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [searchQuery, filterDepartment, filterGroup, filterStatus]);

  const activeFiltersCount = [filterDepartment, filterGroup, filterStatus].filter(f => f !== 'all').length;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== 'admin')) setLocation('/dashboard');
  }, [authLoading, isAuthenticated, user, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
      pending:  { icon: <Clock size={11} />,         label: 'Pendente',  cls: 'bg-amber-50 text-amber-500 border-amber-200' },
      approved: { icon: <CheckCircle2 size={11} />,  label: 'Aprovado',  cls: 'bg-emerald-50 text-emerald-500 border-emerald-200' },
      rejected: { icon: <XCircle size={11} />,       label: 'Rejeitado', cls: 'bg-red-50 text-red-500 border-red-200' },
    };
    const c = cfg[status];
    if (!c) return null;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${c.cls}`}>
        {c.icon}{c.label}
      </span>
    );
  };

  const getRoleBadge = (role: string) => (
    role === 'admin'
      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-violet-50 text-violet-700 border-violet-200"><Shield size={11} />Admin</span>
      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-blue-50 text-blue-500 border-blue-200"><UserIcon size={11} />Usuário</span>
  );

  const getEnabledBadge = (enabled: boolean | undefined | null) => {
    if (enabled === false) {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-red-50 text-red-500 border-red-200"><PowerOff size={11} />Desabilitado</span>;
    }
    return null; // Don't show badge for enabled users (it's the default state)
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const initials = (name: string) => name?.charAt(0).toUpperCase() || '?';

  const clearFilters = () => {
    setSearchQuery('');
    setFilterDepartment('all');
    setFilterGroup('all');
    setFilterStatus('all');
  };

  return (
    <div className="min-h-screen w-full bg-[var(--background)]">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] min-[2560px]:max-w-[2200px] space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <PanelHeader
          onBack={() => setLocation('/admin')}
          backLabel="Admin"
          icon={UserCog}
          title="Usuários"
          subtitle="Gerenciamento de Acesso"
          color="violet"
          tabs={[
            { value: 'all', label: 'Todos', icon: <Users size={14} /> },
            {
              value: 'pending',
              label: 'Pendentes',
              icon: <Clock size={14} />,
              badge:
                pendingUsers && pendingUsers.length > 0 ? (
                  <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {pendingUsers.length}
                  </span>
                ) : undefined,
            },
          ]}
          activeTab={activeTab}
          onTabChange={(v) => setActiveTab(v as Tab)}
          tabsClassName="sm:max-w-xs"
          actions={
            <>
              <button
                onClick={() => setLocation('/grupos-permissoes')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              >
                <Shield size={14} />
                <span className="hidden md:inline">Grupos</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
              >
                <Plus size={15} />
                <span className="hidden sm:inline">Novo Usuário</span>
                <span className="sm:hidden">Novo</span>
              </button>
            </>
          }
        />

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

            {/* Pending Tab */}
            {activeTab === 'pending' && (
              <div className="space-y-3">
                {loadingPending ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  </div>
                ) : pendingUsers && pendingUsers.length > 0 ? (
                  pendingUsers.map(pu => (
                    <div key={pu.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                            {initials(pu.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{pu.name}</p>
                            <p className="text-sm text-muted-foreground truncate">{pu.email}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {getStatusBadge(pu.approvalStatus)}
                              {pu.departmentId && departments && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Building2 size={11} />
                                  {departments.find(d => d.id === pu.departmentId)?.name || 'Setor desconhecido'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground/60 mt-1">Cadastrado em: {formatDate(pu.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => approveMutation.mutate({ userId: pu.id })}
                            disabled={approveMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            <UserCheck size={14} /> Aprovar
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate({ userId: pu.id })}
                            disabled={rejectMutation.isPending}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            <UserX size={14} /> Rejeitar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                    </div>
                    <p className="font-medium text-foreground">Nenhum usuário pendente</p>
                    <p className="text-sm text-muted-foreground mt-1">Todos os cadastros foram processados</p>
                  </div>
                )}
              </div>
            )}

            {/* All Users Tab */}
            {activeTab === 'all' && (
              <div className="space-y-4">
                {/* ── Search & Filters Bar ── */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    {/* Search input */}
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome ou email..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Filter toggle button (mobile) */}
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`sm:hidden flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        activeFiltersCount > 0
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Filter size={14} />
                      Filtros
                      {activeFiltersCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>

                    {/* Desktop filters (always visible) */}
                    <div className="hidden sm:flex items-center gap-2">
                      <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                        <SelectTrigger className="h-9 w-[140px] text-xs">
                          <SelectValue placeholder="Setor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os setores</SelectItem>
                          {departments?.map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterGroup} onValueChange={setFilterGroup}>
                        <SelectTrigger className="h-9 w-[140px] text-xs">
                          <SelectValue placeholder="Grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os grupos</SelectItem>
                          <SelectItem value="none">Sem grupo</SelectItem>
                          {groups?.map(g => (
                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="h-9 w-[130px] text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="enabled">Habilitados</SelectItem>
                          <SelectItem value="disabled">Desabilitados</SelectItem>
                        </SelectContent>
                      </Select>

                      {activeFiltersCount > 0 && (
                        <button
                          onClick={clearFilters}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <X size={12} /> Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile filters (collapsible) */}
                  {showFilters && (
                    <div className="sm:hidden flex flex-col gap-2 p-3 rounded-lg border border-border bg-card">
                      <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Setor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os setores</SelectItem>
                          {departments?.map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterGroup} onValueChange={setFilterGroup}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os grupos</SelectItem>
                          <SelectItem value="none">Sem grupo</SelectItem>
                          {groups?.map(g => (
                            <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="enabled">Habilitados</SelectItem>
                          <SelectItem value="disabled">Desabilitados</SelectItem>
                        </SelectContent>
                      </Select>

                      {activeFiltersCount > 0 && (
                        <button
                          onClick={clearFilters}
                          className="flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
                        >
                          <X size={12} /> Limpar filtros
                        </button>
                      )}
                    </div>
                  )}

                  {/* Results count */}
                  {allUsers && (
                    <p className="text-xs text-muted-foreground">
                      {filteredUsers.length === allUsers.length
                        ? `${allUsers.length} usuário${allUsers.length !== 1 ? 's' : ''}`
                        : `${filteredUsers.length} de ${allUsers.length} usuário${allUsers.length !== 1 ? 's' : ''}`
                      }
                    </p>
                  )}
                </div>

                {/* ── Table ── */}
                {loadingAll ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length > 0 ? (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full min-w-[800px]">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Setor</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grupo</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Papel</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Último Acesso</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {paginatedUsers.map(lu => (
                            <tr key={lu.id} className={`hover:bg-accent/40 transition-colors ${lu.enabled === false ? 'opacity-60' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                                    lu.enabled === false
                                      ? 'bg-muted-foreground/50'
                                      : 'bg-gradient-to-br from-blue-500 to-blue-600'
                                  }`}>
                                    {initials(lu.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{lu.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{lu.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {lu.departmentId && departments ? departments.find(d => d.id === lu.departmentId)?.name || '-' : '-'}
                              </td>
                              <td className="px-4 py-3"><GroupSelector userId={lu.id} currentGroupId={lu.groupId} /></td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  {getStatusBadge(lu.approvalStatus)}
                                  {getEnabledBadge(lu.enabled)}
                                </div>
                              </td>
                              <td className="px-4 py-3">{getRoleBadge(lu.role)}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(lu.lastSignedIn)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {lu.approvalStatus === 'pending' && (
                                    <>
                                      <button onClick={() => approveMutation.mutate({ userId: lu.id })} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors" title="Aprovar"><UserCheck size={14} /></button>
                                      <button onClick={() => rejectMutation.mutate({ userId: lu.id })} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Rejeitar"><UserX size={14} /></button>
                                    </>
                                  )}
                                  {/* Toggle enabled/disabled */}
                                  {lu.id !== user?.id && lu.approvalStatus === 'approved' && (
                                    <button
                                      onClick={() => toggleEnabledMutation.mutate({ userId: lu.id, enabled: lu.enabled === false })}
                                      className={`p-1.5 rounded-lg transition-colors ${
                                        lu.enabled === false
                                          ? 'text-emerald-500 hover:bg-emerald-50'
                                          : 'text-amber-500 hover:bg-amber-50'
                                      }`}
                                      title={lu.enabled === false ? 'Habilitar usuário' : 'Desabilitar usuário'}
                                    >
                                      {lu.enabled === false ? <Power size={14} /> : <PowerOff size={14} />}
                                    </button>
                                  )}
                                  {lu.approvalStatus === 'approved' && lu.id !== user?.id && (
                                    <button onClick={() => updateRoleMutation.mutate({ userId: lu.id, role: lu.role === 'admin' ? 'user' : 'admin' })} className="p-1.5 text-violet-700 hover:bg-violet-50 rounded-lg transition-colors" title={lu.role === 'admin' ? 'Remover admin' : 'Tornar admin'}><Shield size={14} /></button>
                                  )}
                                  {lu.approvalStatus === 'approved' && lu.role !== 'admin' && (
                                    <button onClick={() => setPermissionsDialog({ open: true, userId: lu.id, userName: lu.name, permissions: lu.permissions || [] })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Permissões"><Settings size={14} /></button>
                                  )}
                                  <button onClick={() => setEditingUser({ id: lu.id, name: lu.name, email: lu.email })} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors" title="Editar"><Edit size={14} /></button>
                                  {lu.id !== user?.id && (
                                    <button onClick={() => { if (confirm('Excluir este usuário?')) deleteMutation.mutate({ userId: lu.id }); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={14} /></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-border">
                      {paginatedUsers.map(lu => (
                        <div key={lu.id} className={`p-4 space-y-3 ${lu.enabled === false ? 'opacity-60' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                              lu.enabled === false
                                ? 'bg-muted-foreground/50'
                                : 'bg-gradient-to-br from-blue-500 to-blue-600'
                            }`}>
                              {initials(lu.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-foreground truncate">{lu.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{lu.email}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {getStatusBadge(lu.approvalStatus)}
                            {getRoleBadge(lu.role)}
                            {getEnabledBadge(lu.enabled)}
                            {lu.departmentId && departments && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-muted-foreground border border-border">
                                <Building2 size={11} />
                                {departments.find(d => d.id === lu.departmentId)?.name || '-'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            {lu.approvalStatus === 'pending' && (
                              <>
                                <button onClick={() => approveMutation.mutate({ userId: lu.id })} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"><UserCheck size={14} /></button>
                                <button onClick={() => rejectMutation.mutate({ userId: lu.id })} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><UserX size={14} /></button>
                              </>
                            )}
                            {lu.id !== user?.id && lu.approvalStatus === 'approved' && (
                              <button
                                onClick={() => toggleEnabledMutation.mutate({ userId: lu.id, enabled: lu.enabled === false })}
                                className={`p-2 rounded-lg transition-colors ${
                                  lu.enabled === false
                                    ? 'text-emerald-500 hover:bg-emerald-50'
                                    : 'text-amber-500 hover:bg-amber-50'
                                }`}
                                title={lu.enabled === false ? 'Habilitar' : 'Desabilitar'}
                              >
                                {lu.enabled === false ? <Power size={14} /> : <PowerOff size={14} />}
                              </button>
                            )}
                            {lu.approvalStatus === 'approved' && lu.id !== user?.id && (
                              <button onClick={() => updateRoleMutation.mutate({ userId: lu.id, role: lu.role === 'admin' ? 'user' : 'admin' })} className="p-2 text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"><Shield size={14} /></button>
                            )}
                            <button onClick={() => setEditingUser({ id: lu.id, name: lu.name, email: lu.email })} className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"><Edit size={14} /></button>
                            {lu.id !== user?.id && (
                              <button onClick={() => { if (confirm('Excluir este usuário?')) deleteMutation.mutate({ userId: lu.id }); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    <DataTablePagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={filteredUsers.length}
                      onPageChange={setPage}
                      itemLabel="usuários"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                      {searchQuery || activeFiltersCount > 0 ? (
                        <Search size={24} className="text-muted-foreground" />
                      ) : (
                        <Users size={24} className="text-muted-foreground" />
                      )}
                    </div>
                    <p className="font-medium text-foreground">
                      {searchQuery || activeFiltersCount > 0
                        ? 'Nenhum usuário encontrado'
                        : 'Nenhum usuário cadastrado'
                      }
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {searchQuery || activeFiltersCount > 0
                        ? 'Tente ajustar os filtros ou a busca'
                        : 'Os usuários aparecerão aqui após o cadastro'
                      }
                    </p>
                    {(searchQuery || activeFiltersCount > 0) && (
                      <button
                        onClick={clearFilters}
                        className="mt-3 text-sm text-primary hover:underline"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
        </motion.div>
      </div>

      {/* ── Modals ── */}
      {permissionsDialog && (
        <PermissionsDialog
          open={permissionsDialog.open}
          onOpenChange={open => !open && setPermissionsDialog(null)}
          userId={permissionsDialog.userId}
          userName={permissionsDialog.userName}
          currentPermissions={permissionsDialog.permissions}
        />
      )}
      <CreateUserModal open={showCreateModal} onOpenChange={setShowCreateModal} />
      {editingUser && (
        <EditUserModal
          isOpen={true}
          onClose={() => setEditingUser(null)}
          user={editingUser}
          onSuccess={() => { utils.userManagement.listAll.invalidate(); utils.userManagement.listPending.invalidate(); }}
        />
      )}
    </div>
  );
}
