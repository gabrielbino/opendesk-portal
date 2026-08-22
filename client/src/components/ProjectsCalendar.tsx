import { Calendar, dateFnsLocalizer, Event } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Card } from '@/components/ui/card';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: number | null;
  endDate: number | null;
  ownerId: number;
  sector: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

interface ProjectsCalendarProps {
  projects: Project[];
  onSelectEvent: (project: Project) => void;
}

interface CalendarEvent extends Event {
  resource: Project;
}

export function ProjectsCalendar({ projects, onSelectEvent }: ProjectsCalendarProps) {
  // Convert projects to calendar events (filter out projects without dates)
  const events: CalendarEvent[] = projects
    .filter((project) => project.startDate && project.endDate)
    .map((project) => ({
      title: project.name,
      start: new Date(Number(project.startDate)),
      end: new Date(Number(project.endDate)),
      resource: project,
    }));

  // Custom event style based on project status and priority
  const eventStyleGetter = (event: CalendarEvent) => {
    const project = event.resource;
    let backgroundColor = '#3b82f6'; // default blue
    
    // Color by status
    if (project.status === 'Concluído') {
      backgroundColor = '#10b981'; // green
    } else if (project.status === 'Cancelado') {
      backgroundColor = '#6b7280'; // gray
    } else if (project.status === 'Pausado') {
      backgroundColor = '#f59e0b'; // orange
    }
    
    // Check if overdue
    const now = new Date();
    const endDate = new Date(Number(project.endDate));
    if (endDate < now && project.status !== 'Concluído' && project.status !== 'Cancelado') {
      backgroundColor = '#ef4444'; // red for overdue
    }
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block',
        fontSize: '0.875rem',
        fontWeight: '500',
      },
    };
  };

  return (
    <Card className="p-6 bg-white/95 backdrop-blur-sm border-border shadow-2xl">
      <div className="h-[600px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={(event) => onSelectEvent(event.resource)}
          messages={{
            next: 'Próximo',
            previous: 'Anterior',
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            day: 'Dia',
            agenda: 'Agenda',
            date: 'Data',
            time: 'Hora',
            event: 'Evento',
            noEventsInRange: 'Não há projetos neste período.',
            showMore: (total) => `+ Ver mais (${total})`,
          }}
          culture="pt-BR"
        />
      </div>
    </Card>
  );
}
