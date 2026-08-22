import { useMemo } from 'react';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';

interface Project {
  id: number;
  name: string;
  status: string;
  priority: string;
  startDate: number | null;
  endDate: number | null;
  progress: number;
}

interface GanttChartProps {
  projects: Project[];
}

export function GanttChart({ projects }: GanttChartProps) {
  const { timelineStart, timelineEnd, months, totalDays } = useMemo(() => {
    // Filter projects with dates
    const projectsWithDates = projects.filter(p => p.startDate && p.endDate);
    
    if (projectsWithDates.length === 0) {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(addMonths(now, 2));
      return {
        timelineStart: start,
        timelineEnd: end,
        months: [start, addMonths(start, 1), addMonths(start, 2)],
        totalDays: differenceInDays(end, start) + 1,
      };
    }

    // Find min and max dates
    const dates = projectsWithDates.flatMap(p => [
      new Date(p.startDate!),
      new Date(p.endDate!)
    ]);
    
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Expand to full months
    const start = startOfMonth(minDate);
    const end = endOfMonth(maxDate);
    
    // Generate month labels
    const monthsList: Date[] = [];
    let current = start;
    while (current <= end) {
      monthsList.push(current);
      current = addMonths(current, 1);
    }
    
    return {
      timelineStart: start,
      timelineEnd: end,
      months: monthsList,
      totalDays: differenceInDays(end, start) + 1,
    };
  }, [projects]);

  const getProjectPosition = (project: Project) => {
    if (!project.startDate || !project.endDate) return null;
    
    const projectStart = new Date(project.startDate);
    const projectEnd = new Date(project.endDate);
    
    const startOffset = differenceInDays(projectStart, timelineStart);
    const duration = differenceInDays(projectEnd, projectStart) + 1;
    
    const leftPercent = (startOffset / totalDays) * 100;
    const widthPercent = (duration / totalDays) * 100;
    
    return {
      left: `${Math.max(0, leftPercent)}%`,
      width: `${Math.min(100 - leftPercent, widthPercent)}%`,
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Planejamento': return 'bg-blue-500';
      case 'Em Andamento': return 'bg-yellow-500';
      case 'Em Pausa': return 'bg-orange-500';
      case 'Concluído': return 'bg-green-500';
      case 'Cancelado': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getPriorityBorder = (priority: string) => {
    switch (priority) {
      case 'Crítica': return 'border-l-4 border-l-red-500';
      case 'Alta': return 'border-l-4 border-l-orange-500';
      case 'Média': return 'border-l-4 border-l-blue-500';
      case 'Baixa': return 'border-l-4 border-l-gray-500';
      default: return '';
    }
  };

  const projectsWithDates = projects.filter(p => p.startDate && p.endDate);

  if (projectsWithDates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Nenhum projeto com datas definidas</p>
        <p className="text-sm mt-2 opacity-75">Adicione datas de início e fim aos projetos para visualizar no Gantt</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timeline Header */}
      <div className="flex">
        {/* Project names column */}
        <div className="w-64 flex-shrink-0" />
        
        {/* Timeline */}
        <div className="flex-1 min-w-0">
          <div className="flex border-b border-border">
            {months.map((month, idx) => {
              const monthStart = month;
              const monthEnd = endOfMonth(month);
              const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
              const widthPercent = (daysInMonth / totalDays) * 100;
              
              return (
                <div
                  key={idx}
                  style={{ width: `${widthPercent}%` }}
                  className="text-center py-2 border-r border-border text-muted-foreground font-medium text-sm"
                >
                  {format(month, 'MMM yyyy', { locale: ptBR })}
                </div>
              );
            })}
          </div>
          
          {/* Day markers (optional, shows every 7 days) */}
          <div className="flex h-4 border-b border-border">
            {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, idx) => (
              <div
                key={idx}
                style={{ width: `${(7 / totalDays) * 100}%` }}
                className="border-r border-white/5"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Project Rows */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {projectsWithDates.map((project) => {
          const position = getProjectPosition(project);
          if (!position) return null;
          
          const now = Date.now();
          const isOverdue = project.endDate! < now && project.status !== 'Concluído' && project.status !== 'Cancelado';
          
          return (
            <div key={project.id} className="flex items-center group">
              {/* Project name */}
              <div className="w-64 flex-shrink-0 pr-4">
                <div className="text-foreground font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {project.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                    {project.status}
                  </Badge>
                  <span className="text-xs text-blue-700">{project.progress}%</span>
                </div>
              </div>
              
              {/* Timeline bar */}
              <div className="flex-1 min-w-0 relative h-12 flex items-center">
                <div className="absolute inset-0 flex">
                  {/* Grid lines */}
                  {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{ width: `${(7 / totalDays) * 100}%` }}
                      className="border-r border-white/5"
                    />
                  ))}
                </div>
                
                {/* Project bar */}
                <div
                  style={position}
                  className={`
                    absolute h-8 rounded-lg overflow-hidden
                    ${getPriorityBorder(project.priority)}
                    ${isOverdue ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-transparent' : ''}
                    transition-all group-hover:h-9 group-hover:shadow-lg
                  `}
                >
                  {/* Background */}
                  <div className={`h-full ${getStatusColor(project.status)} opacity-60`} />
                  
                  {/* Progress overlay */}
                  <div
                    style={{ width: `${project.progress}%` }}
                    className={`absolute inset-y-0 left-0 ${getStatusColor(project.status)}`}
                  />
                  
                  {/* Label */}
                  <div className="absolute inset-0 flex items-center justify-center px-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {project.startDate && format(new Date(project.startDate), 'dd/MM', { locale: ptBR })}
                      {' → '}
                      {project.endDate && format(new Date(project.endDate), 'dd/MM', { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 pt-4 border-t border-border text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded" />
          <span className="text-muted-foreground">Planejamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-yellow-500 rounded" />
          <span className="text-muted-foreground">Em Andamento</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded" />
          <span className="text-muted-foreground">Concluído</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-l-4 border-l-red-500 bg-gray-600 rounded" />
          <span className="text-muted-foreground">Prioridade Crítica</span>
        </div>
      </div>
    </div>
  );
}
