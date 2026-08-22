import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import {
  Star, TrendingUp, Users, Clock, Filter,
  BarChart3, MessageSquare, Calendar, ChevronDown, ChevronUp
} from 'lucide-react';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
];

function StarDisplay({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rating ? 'fill-amber-400 text-amber-500' : 'fill-transparent text-slate-600'}
        />
      ))}
    </div>
  );
}

function RatingBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = value >= 4 ? 'bg-emerald-500' : value >= 3 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 bg-card rounded-full h-1.5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${
        value >= 4 ? 'text-emerald-700' : value >= 3 ? 'text-amber-500' : 'text-red-600'
      }`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── Weekly Table Component ───────────────────────────────────────────────────
function WeeklyEvaluationsTable({ period }: { period: '7d' | '30d' | '90d' | 'all' }) {
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  // Compute date range from period
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    let start: Date | undefined;
    if (period === '7d') {
      start = new Date(now);
      start.setDate(start.getDate() - 7);
    } else if (period === '30d') {
      start = new Date(now);
      start.setDate(start.getDate() - 30);
    } else if (period === '90d') {
      start = new Date(now);
      start.setDate(start.getDate() - 90);
    }
    return { startDate: start, endDate: end };
  }, [period]);

  const { data: rawData = [], isLoading } = trpc.ticketEvaluations.byWeekAndSector.useQuery(
    { startDate, endDate },
    { enabled: true }
  );

  // Group by week
  const weekGroups = useMemo(() => {
    const map = new Map<string, {
      yearWeek: string;
      weekStart: string;
      sectors: Array<{ sector: string | null; averageRating: number; totalEvaluations: number }>;
      weekAverage: number;
      weekTotal: number;
    }>();

    for (const row of rawData) {
      const key = row.yearWeek;
      if (!map.has(key)) {
        map.set(key, {
          yearWeek: row.yearWeek,
          weekStart: row.weekStart,
          sectors: [],
          weekAverage: 0,
          weekTotal: 0,
        });
      }
      const group = map.get(key)!;
      group.sectors.push({
        sector: row.sector,
        averageRating: Number(row.averageRating),
        totalEvaluations: Number(row.totalEvaluations),
      });
    }

    // Compute week-level averages
    type SectorEntry = { sector: string | null; averageRating: number; totalEvaluations: number };
    map.forEach((group) => {
      const totalEvals = group.sectors.reduce((s: number, r: SectorEntry) => s + r.totalEvaluations, 0);
      const weightedSum = group.sectors.reduce((s: number, r: SectorEntry) => s + r.averageRating * r.totalEvaluations, 0);
      group.weekTotal = totalEvals;
      group.weekAverage = totalEvals > 0 ? weightedSum / totalEvals : 0;
    });

    return Array.from(map.values()).sort((a, b) => b.yearWeek.localeCompare(a.yearWeek));
  }, [rawData]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-16" />
        ))}
      </div>
    );
  }

  if (weekGroups.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Calendar size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Nenhuma avaliação encontrada no período selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weekGroups.map((week, idx) => {
        const isExpanded = expandedWeek === week.yearWeek;
        let weekLabel = '';
        try {
          const parsed = parseISO(week.weekStart);
          weekLabel = `Semana de ${format(parsed, "d 'de' MMMM", { locale: ptBR })}`;
        } catch {
          weekLabel = `Semana ${week.yearWeek}`;
        }

        return (
          <motion.div
            key={week.yearWeek}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            {/* Week Header — clickable to expand */}
            <button
              onClick={() => setExpandedWeek(isExpanded ? null : week.yearWeek)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center shrink-0">
                  <Calendar size={15} className="text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{weekLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {week.weekTotal} avaliação{week.weekTotal !== 1 ? 'ões' : ''} •{' '}
                    {week.sectors.length} setor{week.sectors.length !== 1 ? 'es' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Week average badge */}
                <div className="flex items-center gap-2">
                  <StarDisplay rating={Math.round(week.weekAverage)} size={13} />
                  <span className={`text-sm font-bold ${
                    week.weekAverage >= 4 ? 'text-emerald-700' :
                    week.weekAverage >= 3 ? 'text-amber-500' : 'text-red-600'
                  }`}>
                    {week.weekAverage.toFixed(1)}
                  </span>
                </div>
                {isExpanded
                  ? <ChevronUp size={16} className="text-muted-foreground" />
                  : <ChevronDown size={16} className="text-muted-foreground" />
                }
              </div>
            </button>

            {/* Sector breakdown */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-4 pt-1 border-t border-white/5">
                    <div className="space-y-2 mt-2">
                      {week.sectors
                        .sort((a, b) => b.averageRating - a.averageRating)
                        .map((sector) => (
                          <div
                            key={sector.sector ?? 'sem-setor'}
                            className="flex items-center gap-2 sm:gap-3 bg-muted/30 rounded-lg px-3 py-2.5"
                          >
                            <div className="w-2 h-2 rounded-full bg-cyan-400/60 shrink-0" />
                            <span className="text-sm text-muted-foreground w-28 sm:w-40 truncate shrink-0">
                              {sector.sector ?? 'Setor não informado'}
                            </span>
                            <RatingBar value={sector.averageRating} />
                            <span className="text-xs text-muted-foreground shrink-0 w-16 sm:w-20 text-right">
                              {sector.totalEvaluations} aval.
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TicketEvaluations() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [filterRating, setFilterRating] = useState<number | undefined>();
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'overview' | 'weekly' | 'history'>('overview');

  const { data: stats, isLoading: statsLoading } = trpc.ticketEvaluations.stats.useQuery(undefined, {
    enabled: isAdmin,
  });

  const { data: evaluations = [], isLoading: listLoading } = trpc.ticketEvaluations.list.useQuery(
    { period, rating: filterRating, category: filterCategory },
    { enabled: isAdmin }
  );

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Acesso restrito a administradores.</p>
      </div>
    );
  }

  const avgRating = stats?.averageRating ?? 0;
  const total = stats?.total ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Avaliações Gerenciais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Avaliações sigilosas de atendimento — identificação por setor apenas
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-cyan-300"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-background">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Stats Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Star size={18} className="text-amber-500" />}
            label="Nota Média"
            value={avgRating > 0 ? `${avgRating.toFixed(1)} / 5` : '—'}
            sub={total > 0 ? `${total} avaliação${total !== 1 ? 'ões' : ''}` : 'Sem avaliações'}
            color="bg-amber-100"
          />
          <StatCard
            icon={<TrendingUp size={18} className="text-emerald-700" />}
            label="Satisfeitos"
            value={total > 0
              ? `${Math.round(((stats?.byRating?.filter(r => r.rating >= 4).reduce((s, r) => s + r.count, 0) ?? 0) / total) * 100)}%`
              : '—'}
            sub="Notas 4 e 5 estrelas"
            color="bg-emerald-100"
          />
          <StatCard
            icon={<Users size={18} className="text-blue-700" />}
            label="Setores Avaliados"
            value={stats?.bySector?.length ?? 0}
            sub="Setores distintos"
            color="bg-blue-100"
          />
          <StatCard
            icon={<BarChart3 size={18} className="text-purple-700" />}
            label="Total de Avaliações"
            value={total}
            sub="No período selecionado"
            color="bg-purple-100"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-card rounded-xl p-1 w-full sm:w-fit">
        {([
          { id: 'overview', label: 'Visão Geral', icon: <BarChart3 size={14} /> },
          { id: 'weekly', label: 'Por Semana', icon: <Calendar size={14} /> },
          { id: 'history', label: 'Histórico', icon: <Clock size={14} /> },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none justify-center sm:justify-start ${
              activeTab === tab.id
                ? 'bg-cyan-100 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            {/* Rating Distribution */}
            {!statsLoading && stats && total > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">Distribuição de Notas</h3>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = stats.byRating.find(r => r.rating === star)?.count ?? 0;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-3">
                        <div className="flex items-center gap-1 w-20 shrink-0">
                          <Star size={12} className="fill-amber-400 text-amber-500" />
                          <span className="text-xs text-muted-foreground">{star} estrela{star !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex-1 bg-card rounded-full h-2 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: (5 - star) * 0.1 }}
                            className={`h-full rounded-full ${
                              star >= 4 ? 'bg-emerald-500' : star === 3 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* By Sector */}
            {!statsLoading && stats && stats.bySector.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4">Nota Média por Setor</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stats.bySector.sort((a, b) => b.averageRating - a.averageRating).map((sector) => (
                    <div key={sector.sectorName} className="flex items-center justify-between bg-card rounded-lg p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{sector.sectorName}</p>
                        <p className="text-xs text-muted-foreground">{sector.count} avaliação{sector.count !== 1 ? 'ões' : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarDisplay rating={Math.round(sector.averageRating)} size={14} />
                        <span className="text-sm font-bold text-amber-500">{sector.averageRating.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!statsLoading && (!stats || total === 0) && (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <Star size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">Nenhuma avaliação registrada ainda.</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'weekly' && (
          <motion.div
            key="weekly"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Calendar size={13} />
              <span>
                Avaliações agrupadas por semana e setor do solicitante. Clique em uma semana para ver o detalhamento.
              </span>
            </div>
            <WeeklyEvaluationsTable period={period} />
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Filter size={14} />
                <span>Filtros:</span>
              </div>
              <select
                value={filterRating ?? ''}
                onChange={(e) => setFilterRating(e.target.value ? Number(e.target.value) : undefined)}
                className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-300"
              >
                <option value="" className="bg-background">Todas as notas</option>
                {[5, 4, 3, 2, 1].map(r => (
                  <option key={r} value={r} className="bg-background">{r} estrela{r !== 1 ? 's' : ''}</option>
                ))}
              </select>
              <select
                value={filterCategory ?? ''}
                onChange={(e) => setFilterCategory(e.target.value || undefined)}
                className="bg-card border border-border text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-300"
              >
                <option value="" className="bg-background">Todas as categorias</option>
                {['Técnico', 'Acesso', 'Funcionalidade', 'Dúvida', 'Outro'].map(c => (
                  <option key={c} value={c} className="bg-background">{c}</option>
                ))}
              </select>
              {(filterRating || filterCategory) && (
                <button
                  onClick={() => { setFilterRating(undefined); setFilterCategory(undefined); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {/* Evaluations List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Histórico de Avaliações
                {evaluations.length > 0 && <span className="ml-2 text-muted-foreground">({evaluations.length})</span>}
              </h3>

              {listLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse h-20" />
                  ))}
                </div>
              ) : evaluations.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center">
                  <Star size={32} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhuma avaliação encontrada para os filtros selecionados.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {evaluations.map((evaluation) => (
                    <motion.div
                      key={evaluation.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-card border border-border rounded-xl p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground font-mono">{evaluation.ticketDisplayId}</span>
                            <span className="text-xs bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-full">
                              {evaluation.ticketCategory}
                            </span>
                            {evaluation.evaluatorSectorName && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {evaluation.evaluatorSectorName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-foreground font-medium truncate">{evaluation.ticketTitle}</p>
                          {evaluation.assignedToName && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Atendido por: <span className="text-muted-foreground">{evaluation.assignedToName}</span>
                            </p>
                          )}
                          {evaluation.observation && (
                            <div className="mt-2 flex items-start gap-1.5">
                              <MessageSquare size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                              <p className="text-xs text-muted-foreground italic">&ldquo;{evaluation.observation}&rdquo;</p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StarDisplay rating={evaluation.rating} size={16} />
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(evaluation.evaluatedAt), { addSuffix: true, locale: ptBR })}
                          </span>
                          {evaluation.resolutionTimeMinutes != null && (
                            <span className="text-xs text-slate-600 flex items-center gap-1">
                              <Clock size={10} />
                              {evaluation.resolutionTimeMinutes < 60
                                ? `${evaluation.resolutionTimeMinutes}min`
                                : `${Math.round(evaluation.resolutionTimeMinutes / 60)}h`}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
