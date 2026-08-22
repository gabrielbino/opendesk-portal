import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLocation } from 'wouter';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Zap,
  Target,
  Calendar
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GanttChart } from '@/components/GanttChart';
import DevPresenceAndFeed from '@/components/DevPresenceAndFeed';
import SubmodulePage from '@/components/templates/SubmodulePage';

export default function ProjectsDashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: analytics, isLoading: loadingAnalytics } = trpc.projects.getAnalytics.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: todayTasks, isLoading: loadingTasks } = trpc.projects.getTodayTasks.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: todayDailyTasks = [] } = trpc.dailyTasks.getToday.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: allProjects = [] } = trpc.projects.list.useQuery(
    {},
    { enabled: isAuthenticated }
  );

  if (authLoading || loadingAnalytics) {
    return (
      <SubmodulePage
        title="Dashboard de Projetos"
        subtitle="Métricas e visão geral"
        icon={<BarChart3 size={20} />}
        iconGradient="from-blue-600 to-indigo-700"
        backPath="/desenvolvimento"
        backLabel="Projetos"
      >
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Carregando dashboard...
        </div>
      </SubmodulePage>
    );
  }

  if (!analytics) {
    return (
      <SubmodulePage
        title="Dashboard de Projetos"
        subtitle="Métricas e visão geral"
        icon={<BarChart3 size={20} />}
        iconGradient="from-blue-600 to-indigo-700"
        backPath="/desenvolvimento"
        backLabel="Projetos"
      >
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Erro ao carregar dados
        </div>
      </SubmodulePage>
    );
  }

  const statusColors = {
    planejamento: 'bg-blue-500',
    emAndamento: 'bg-yellow-500',
    emPausa: 'bg-orange-500',
    concluido: 'bg-green-500',
    cancelado: 'bg-gray-500',
  };

  const priorityColors = {
    baixa: 'bg-gray-400',
    media: 'bg-blue-400',
    alta: 'bg-orange-400',
    critica: 'bg-red-500',
  };

  return (
    <SubmodulePage
      title="Dashboard de Projetos"
      subtitle="Métricas e visão geral"
      icon={<BarChart3 size={20} />}
      iconGradient="from-blue-600 to-indigo-700"
      backPath="/desenvolvimento"
      backLabel="Projetos"
      headerActions={
        <DevPresenceAndFeed currentPage="desenvolvimento/dashboard" />
      }
    >
      <div className="space-y-8">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl p-5 border border-border shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-blue-50 rounded-lg">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-3xl font-bold text-foreground">{analytics.total}</span>
            </div>
            <h3 className="text-sm text-muted-foreground font-medium">Total de Projetos</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl p-5 border border-border shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-amber-50 rounded-lg">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-3xl font-bold text-foreground">{analytics.byStatus.emAndamento}</span>
            </div>
            <h3 className="text-sm text-muted-foreground font-medium">Em Andamento</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl p-5 border border-border shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-3xl font-bold text-foreground">{analytics.overdue}</span>
            </div>
            <h3 className="text-sm text-muted-foreground font-medium">Atrasados</h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card rounded-xl p-5 border border-border shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-3xl font-bold text-foreground">{analytics.byStatus.concluido}</span>
            </div>
            <h3 className="text-sm text-muted-foreground font-medium">Concluídos</h3>
          </motion.div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Status Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-xl p-6 border border-border shadow-sm"
          >
            <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Distribuição por Status
            </h3>
            <div className="space-y-3.5">
              {Object.entries(analytics.byStatus).map(([status, count]) => {
                const percentage = analytics.total > 0 ? (count / analytics.total) * 100 : 0;
                const statusLabels: Record<string, string> = {
                  planejamento: 'Planejamento',
                  emAndamento: 'Em Andamento',
                  emPausa: 'Em Pausa',
                  concluido: 'Concluído',
                  cancelado: 'Cancelado',
                };
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">{statusLabels[status]}</span>
                      <span className="text-sm text-foreground font-semibold">{count}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, delay: 0.5 }}
                        className={`h-full rounded-full ${statusColors[status as keyof typeof statusColors]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Priority Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-card rounded-xl p-6 border border-border shadow-sm"
          >
            <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" />
              Distribuição por Prioridade
            </h3>
            <div className="space-y-3.5">
              {Object.entries(analytics.byPriority).map(([priority, count]) => {
                const percentage = analytics.total > 0 ? (count / analytics.total) * 100 : 0;
                const priorityLabels: Record<string, string> = {
                  baixa: 'Baixa',
                  media: 'Média',
                  alta: 'Alta',
                  critica: 'Crítica',
                };
                return (
                  <div key={priority}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-muted-foreground">{priorityLabels[priority]}</span>
                      <span className="text-sm text-foreground font-semibold">{count}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className={`h-full rounded-full ${priorityColors[priority as keyof typeof priorityColors]}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Today's Tasks & Critical Projects */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Today's Tasks */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-card rounded-xl p-6 border border-border shadow-sm"
          >
            <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Tarefas de Hoje
            </h3>
            {loadingTasks ? (
              <div className="text-muted-foreground text-sm">Carregando...</div>
            ) : (todayTasks && todayTasks.length > 0) || todayDailyTasks.length > 0 ? (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {/* Project Phases */}
                {todayTasks && todayTasks.map((task: any) => (
                  <div
                    key={`phase-${task.id}`}
                    className="bg-muted/40 rounded-lg p-3.5 border border-border/50 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">Fase</span>
                          <h4 className="text-foreground font-medium text-sm truncate">{task.name}</h4>
                        </div>
                        <p className="text-muted-foreground text-xs truncate">{task.projectName}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                        task.priority === 'Crítica' ? 'bg-red-50 text-red-700' :
                        task.priority === 'Alta' ? 'bg-orange-50 text-orange-700' :
                        task.priority === 'Média' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-muted-foreground'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))}
                {/* Daily Tasks */}
                {todayDailyTasks.map((task: any) => (
                  <div
                    key={`daily-${task.id}`}
                    className="bg-muted/40 rounded-lg p-3.5 border border-border/50 hover:bg-muted/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-primary bg-cyan-50 px-1.5 py-0.5 rounded font-medium">Tarefa</span>
                          <h4 className="text-foreground font-medium text-sm truncate">{task.title}</h4>
                        </div>
                        {task.description && (
                          <p className="text-muted-foreground text-xs truncate">{task.description}</p>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                        task.priority === 'Crítica' ? 'bg-red-50 text-red-700' :
                        task.priority === 'Alta' ? 'bg-orange-50 text-orange-700' :
                        task.priority === 'Média' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-muted-foreground'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma tarefa para hoje</p>
              </div>
            )}
          </motion.div>

          {/* Critical Projects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-card rounded-xl p-6 border border-border shadow-sm"
          >
            <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Projetos Críticos
            </h3>
            {analytics.criticalProjects && analytics.criticalProjects.length > 0 ? (
              <div className="space-y-2.5 max-h-80 overflow-y-auto">
                {analytics.criticalProjects.map((project: any) => (
                  <div
                    key={project.id}
                    className="bg-muted/40 rounded-lg p-3.5 border border-red-200/50 hover:bg-muted/60 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/desenvolvimento`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-foreground font-medium text-sm truncate flex-1">{project.name}</h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                        project.priority === 'Crítica' ? 'bg-red-50 text-red-700' :
                        project.priority === 'Alta' ? 'bg-orange-50 text-orange-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {project.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Prazo: {project.endDate ? format(new Date(project.endDate), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem prazo'}</span>
                      <span>Progresso: {project.progress || 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum projeto crítico</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Gantt Chart Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-card rounded-xl p-6 border border-border shadow-sm"
        >
          <h3 className="text-base font-bold text-foreground mb-5 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Linha do Tempo (Gantt)
          </h3>
          <GanttChart projects={allProjects} />
        </motion.div>
      </div>
    </SubmodulePage>
  );
}
