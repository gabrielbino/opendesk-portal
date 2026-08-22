import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import PanelHeader from "@/components/PanelHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EnhancedProgressBar } from "@/components/EnhancedProgressBar";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, Calendar as CalendarIcon, User, Target, Clock, LayoutGrid, CalendarDays, BarChart3, Columns3, CheckCircle2, History, UserCheck, FileEdit, MessageSquare, Trash2, PlayCircle, Paperclip, Eye, EyeOff, AlertTriangle, FolderKanban } from "lucide-react";
import CreateProjectModal from "@/components/CreateProjectModal";
import EditProjectModal from "@/components/EditProjectModal";
import ProjectComments from "@/components/ProjectComments";
import { DailyTasksPanel } from "@/components/DailyTasksPanel";
import { ProjectAttachments } from "@/components/ProjectAttachments";
import { ProjectsCalendar } from "@/components/ProjectsCalendar";
import KanbanBoard from "@/components/KanbanBoard";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getStatusColor as getStatusColorUtil, getPriorityColor as getPriorityColorUtil, BrandColors } from "@/lib/colors";
import DevPresenceAndFeed from "@/components/DevPresenceAndFeed";
import WhatsNewPopup from "@/components/WhatsNewPopup";

export default function Projects() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'calendar' | 'kanban'>('grid');
  const [showCompleted, setShowCompleted] = useState(false);


  const { data: allProjects = [], isLoading } = trpc.projects.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    search: searchTerm || undefined,
  });

  // Filter out completed projects unless showCompleted is toggled on
  // When status filter is specifically set to "Concluído", always show them
  const projects = (showCompleted || statusFilter === 'Concluído')
    ? allProjects
    : allProjects.filter((p: any) => p.status !== 'Concluído');

  // Fetch tickets with active status
  const utils = trpc.useUtils();
  const { data: allTickets = [] } = trpc.tickets.list.useQuery({});
  const tickets = allTickets.filter((t: any) => ['Novos', 'Em Andamento', 'Pendente Cliente', 'Em Análise', 'Pendente ERP'].includes(t.status));
  const handleTicketStatusChange = () => {
    utils.tickets.list.invalidate();
  };
  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
    },
  });

  const handleStatusChange = (projectId: number, newStatus: string) => {
    updateProjectMutation.mutate({ 
      id: projectId, 
      status: newStatus as "Planejamento" | "Em Andamento" | "Concluído" | "Cancelado" | "Em Pausa"
    });
  };

  const getStatusColor = (status: string) => {
    const colors = getStatusColorUtil(status);
    return colors.badge;
  };

  const getPriorityColor = (priority: string) => {
    const colors = getPriorityColorUtil(priority);
    return colors.badge;
  };

  const getDeadlineStatus = (endDate: string | null, status: string) => {
    if (!endDate || status === "Concluído" || status === "Cancelado") return null;
    
    const now = new Date();
    // endDate comes as a timestamp number from database
    const deadline = new Date(Number(endDate));
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    

    if (diffDays < 0) {
      return { label: "Atrasado", color: "bg-red-600 text-white", borderColor: "border-red-500", urgent: true, daysText: `${Math.abs(diffDays)} dia${Math.abs(diffDays) !== 1 ? 's' : ''} atrasado` };
    } else if (diffDays <= 4) {
      return { label: "Prazo Próximo", color: "bg-red-500 text-white", borderColor: "border-red-500", urgent: true, daysText: diffDays === 0 ? 'Vence hoje!' : `Vence em ${diffDays} dia${diffDays !== 1 ? 's' : ''}` };
    } else if (diffDays <= 7) {
      return { label: "Prazo Próximo", color: "bg-yellow-600 text-white", borderColor: "border-yellow-500", urgent: false, daysText: `Vence em ${diffDays} dias` };
    }
    return null;
  };

  const completedCount = allProjects.filter((p: any) => p.status === 'Concluído').length;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Body ── */}
      <div className="max-w-7xl 2xl:max-w-[1600px] min-[1920px]:max-w-[1800px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">

        <div className="mb-6">
          <PanelHeader
            onBack={() => setLocation('/dashboard')}
            backLabel="Portal"
            icon={FolderKanban}
            title="Projetos"
            subtitle="Gerenciamento"
            color="violet"
            tabs={[
              { value: 'grid', label: 'Grade', icon: <LayoutGrid size={14} /> },
              { value: 'kanban', label: 'Kanban', icon: <Columns3 size={14} /> },
              { value: 'calendar', label: 'Calendário', icon: <CalendarDays size={14} /> },
            ]}
            activeTab={viewMode}
            onTabChange={(v) => setViewMode(v as 'grid' | 'kanban' | 'calendar')}
            tabsClassName="sm:max-w-md"
            actions={
              <>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setLocation('/desenvolvimento/dashboard')}>
                  <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
                <WhatsNewPopup />
                <DevPresenceAndFeed currentPage="desenvolvimento" />
              </>
            }
          />
        </div>

        {/* Filters */}
        <Card className="mb-6 border-border shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col gap-3">
              {/* Search + Filters Row */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Buscar projetos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="Planejamento">Planejamento</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Em Pausa">Em Pausa</SelectItem>
                    <SelectItem value="Concluído">Concluído</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-full md:w-44">
                    <SelectValue placeholder="Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Prioridades</SelectItem>
                    <SelectItem value="Crítica">Crítica</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Actions Row */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-1.5">
                  {/* Show Completed Toggle */}
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                      showCompleted
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-card border-border text-muted-foreground hover:bg-accent'
                    }`}
                    title={showCompleted ? 'Ocultar concluídos' : 'Mostrar concluídos'}
                  >
                    {showCompleted ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{showCompleted ? 'Concluídos' : 'Concluídos'}</span>
                    {!showCompleted && completedCount > 0 && (
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                        {completedCount}
                      </span>
                    )}
                  </button>
                </div>

                <Button onClick={() => setShowCreateModal(true)} size="sm" className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Novo Projeto
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects View */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando projetos...</p>
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-16 text-center">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum projeto encontrado</p>
              <Button onClick={() => setShowCreateModal(true)} className="mt-4">
                Criar Primeiro Projeto
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === 'calendar' ? (
          <ProjectsCalendar
            projects={projects}
            onSelectEvent={(project) => setSelectedProject(project.id)}
          />
        ) : viewMode === 'kanban' ? (
          <div className="kanban-scroll-outer rounded-xl border border-border bg-card/30 p-4">
            <KanbanBoard
              projects={projects}
              tickets={tickets}
              onStatusChange={handleStatusChange}
              onProjectClick={(project) => setSelectedProject(project.id)}
              onTicketClick={(ticket) => console.log('Ticket clicked:', ticket)}
              onTicketStatusChange={handleTicketStatusChange}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {projects.map((project) => {
              const deadlineStatus = getDeadlineStatus(project.endDate ? String(project.endDate) : null, project.status);
              return (
              <Card
                key={project.id}
                className={`group hover:shadow-lg hover:scale-[1.01] transition-all duration-200 cursor-pointer border-border relative overflow-visible ${
                  deadlineStatus?.urgent ? 'animate-deadline-pulse ring-1 ring-red-300' : deadlineStatus ? `border-2 ${deadlineStatus.borderColor}` : ""
                }`}
                onClick={() => setSelectedProject(project.id)}
              >
                {/* Deadline Balloon */}
                {deadlineStatus?.urgent && (
                  <div className="absolute -top-3 right-4 z-10 animate-deadline-balloon">
                    <div className="flex items-center gap-1.5 bg-red-600 text-white rounded-full px-3 py-1 shadow-lg text-xs font-bold">
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      <span>{deadlineStatus.daysText}</span>
                    </div>
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-red-600 mx-auto" />
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                    <div className="flex gap-1.5 flex-wrap">
                      <Badge variant="outline" className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                      <Badge variant="outline" className={getPriorityColor(project.priority)}>
                        {project.priority}
                      </Badge>
                      {project.projectType && (() => {
                        const typeColor =
                          project.projectType === 'Integração Interna' ? 'bg-orange-50 text-orange-800 border-orange-200' :
                          project.projectType === 'Integração Externa' ? 'bg-teal-50 text-teal-800 border-teal-200' :
                          'bg-secondary text-secondary-foreground border-border';
                        return (
                          <Badge variant="outline" className={`text-xs font-medium ${typeColor}`}>
                            {project.projectType}
                          </Badge>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      {deadlineStatus && !deadlineStatus.urgent && (
                        <Badge className={deadlineStatus.color}>
                          {deadlineStatus.label}
                        </Badge>
                      )}
                      <DeleteProjectButton project={project} />
                    </div>
                  </div>
                  <CardTitle className="text-base text-foreground font-semibold leading-tight">{project.name}</CardTitle>
                  <CardDescription className="line-clamp-2 text-muted-foreground text-sm mt-1">
                    {project.description || "Sem descrição"}
                  </CardDescription>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground">
                      Atualizado em {format(new Date(project.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                    {project.updatedByName && (
                      <span className="text-xs text-primary font-medium">
                        por {project.updatedByName}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <User className="h-4 w-4 mr-2 text-primary/70" />
                      <span>{project.ownerName}</span>
                    </div>
                    
                    {project.endDate && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <CalendarIcon className="h-4 w-4 mr-2 text-primary/70" />
                        <span>Prazo: {format(new Date(project.endDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                    )}

                    <EnhancedProgressBar progress={project.progress} />
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}

        {/* Project Detail Modal */}
        {selectedProject && (
          <ProjectDetailModal
            projectId={selectedProject}
            onClose={() => setSelectedProject(null)}
            onEdit={() => {
              setEditingProject(selectedProject);
              setSelectedProject(null);
            }}
          />
        )}

        {/* Create Project Modal */}
        {showCreateModal && (
          <CreateProjectModal 
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => setShowCreateModal(false)}
          />
        )}

        {/* Edit Project Modal */}
        {editingProject && (
          <EditProjectModal
            open={true}
            onOpenChange={(open) => !open && setEditingProject(null)}
            projectId={editingProject}
            onSuccess={() => setEditingProject(null)}
          />
        )}
      </div>
    </div>
  );
}

// Project Detail Modal Component
function ProjectDetailModal({ projectId, onClose, onEdit }: { projectId: number; onClose: () => void; onEdit: () => void }) {
  const { data: project } = trpc.projects.getById.useQuery({ id: projectId });
  const { data: phases = [] } = trpc.projectPhases.listByProject.useQuery({ projectId });

  if (!project) return null;

  const getPhaseStatusColor = (status: string) => {
    switch (status) {
      case "Pendente": return "bg-secondary text-muted-foreground border-border";
      case "Em Andamento": return "bg-blue-50 text-blue-700 border-blue-200";
      case "Concluída": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Atrasada": return "bg-red-50 text-red-700 border-red-200";
      default: return "bg-secondary text-muted-foreground border-border";
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto p-5 sm:p-8">
        <DialogHeader className="pb-5 border-b border-border">
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground mb-2 break-words">{project.name}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                {project.description || "Sem descrição"}
              </DialogDescription>
            </div>
            <div className="flex flex-row sm:flex-col gap-3 items-start sm:items-end flex-shrink-0">
              <Button size="sm" variant="outline" onClick={onEdit}>
                <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                Editar
              </Button>
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className={`${project.status === "Planejamento" ? "bg-blue-50 text-blue-700 border-blue-200" : project.status === "Em Andamento" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : project.status === "Em Pausa" ? "bg-amber-50 text-amber-700 border-amber-200" : project.status === "Concluído" ? "bg-secondary text-muted-foreground border-border" : "bg-red-50 text-red-700 border-red-200"}`}>
                  {project.status}
                </Badge>
                <Badge variant="outline" className={`${project.priority === "Crítica" ? "bg-red-50 text-red-700 border-red-200" : project.priority === "Alta" ? "bg-orange-50 text-orange-700 border-orange-200" : project.priority === "Média" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                  {project.priority}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-5">
          {/* Project Info */}
          <Card className="border-border bg-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Informações do Projeto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border">
                  <User className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground block">Responsável</span>
                    <span className="text-sm font-medium text-foreground truncate block">{project.ownerName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border">
                  <Target className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs text-muted-foreground block">Setor</span>
                    <span className="text-sm font-medium text-foreground truncate block">{project.sector}</span>
                  </div>
                </div>
                {project.startDate && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border">
                    <CalendarIcon className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs text-muted-foreground block">Início</span>
                      <span className="text-sm font-medium text-foreground">{format(new Date(project.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                )}
                {project.endDate && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border">
                    <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-xs text-muted-foreground block">Prazo</span>
                      <span className="text-sm font-medium text-foreground">{format(new Date(project.endDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="pt-3">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-muted-foreground font-medium">Progresso Geral</span>
                  <span className="font-semibold text-foreground">{project.progress}%</span>
                </div>
                <Progress value={project.progress} className="h-2.5" />
              </div>
            </CardContent>
          </Card>

          {/* Project Phases Timeline */}
          <Card className="border-border bg-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Fases do Projeto</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {phases.length === 0 ? (
                <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma fase cadastrada</p>
              ) : (
                <div className="space-y-3">
                  {phases.map((phase, index) => (
                    <div key={phase.id} className="relative pl-8 pb-3 border-l-2 border-border last:border-l-0">
                      <div className={`absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                        phase.status === 'Concluída' ? 'bg-emerald-500 border-emerald-500' :
                        phase.status === 'Em Andamento' ? 'bg-primary border-primary' :
                        phase.status === 'Atrasada' ? 'bg-red-500 border-red-500' :
                        'bg-card border-border'
                      }`}></div>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-medium text-sm text-foreground">{phase.name}</h4>
                            <Badge variant="outline" className={`text-xs ${getPhaseStatusColor(phase.status)}`}>
                              {phase.status}
                            </Badge>
                          </div>
                          {phase.description && (
                            <p className="text-xs text-muted-foreground mb-1.5 break-words">{phase.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs flex-wrap">
                            {phase.startDate && (
                              <span className="text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                <CalendarIcon className="w-3 h-3" />
                                <span className="font-medium">Início:</span> {format(new Date(phase.startDate), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                            {phase.endDate && (
                              <span className="text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                <CalendarIcon className="w-3 h-3" />
                                <span className="font-medium">Fim:</span> {format(new Date(phase.endDate), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                            {phase.completedAt && (
                              <span className="text-emerald-700 flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3" />
                                <span className="font-medium">Concluída em</span> {format(new Date(phase.completedAt), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Daily Tasks Section */}
          <DailyTasksPanel projectId={projectId} />

          {/* Attachments Section */}
          <Card className="border-border bg-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" />
                Anexos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ProjectAttachments projectId={projectId} />
            </CardContent>
          </Card>

          {/* Comments Section */}
          <Card className="border-border bg-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Comentários
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ProjectComments projectId={projectId} />
            </CardContent>
          </Card>

          {/* Activity History Section */}
          <ActivityHistoryPanel projectId={projectId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Activity History Panel
function ActivityHistoryPanel({ projectId }: { projectId: number }) {
  const { data: activities = [], isLoading } = trpc.projects.getActivityHistory.useQuery({ projectId, limit: 30 });

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'created': return <Plus className="w-3.5 h-3.5 text-emerald-600" />;
      case 'updated': return <FileEdit className="w-3.5 h-3.5 text-primary" />;
      case 'deleted': return <Trash2 className="w-3.5 h-3.5 text-red-600" />;
      case 'status_changed': return <PlayCircle className="w-3.5 h-3.5 text-amber-600" />;
      case 'progress_changed': return <BarChart3 className="w-3.5 h-3.5 text-purple-600" />;
      case 'priority_changed': return <Target className="w-3.5 h-3.5 text-orange-600" />;
      case 'assigned': return <UserCheck className="w-3.5 h-3.5 text-cyan-600" />;
      case 'completed': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
      case 'comment_added': return <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />;
      default: return <History className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'created': return 'border-emerald-200 bg-emerald-50/50';
      case 'updated': return 'border-blue-200 bg-blue-50/50';
      case 'deleted': return 'border-red-200 bg-red-50/50';
      case 'status_changed': return 'border-amber-200 bg-amber-50/50';
      case 'progress_changed': return 'border-purple-200 bg-purple-50/50';
      case 'priority_changed': return 'border-orange-200 bg-orange-50/50';
      case 'assigned': return 'border-cyan-200 bg-cyan-50/50';
      case 'completed': return 'border-emerald-200 bg-emerald-50/50';
      case 'comment_added': return 'border-indigo-200 bg-indigo-50/50';
      default: return 'border-border bg-secondary/30';
    }
  };

  return (
    <Card className="border-border bg-secondary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <CardTitle className="text-base font-semibold text-foreground">Histórico de Atividades</CardTitle>
          {activities.length > 0 && (
            <Badge variant="secondary" className="text-xs">{activities.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : activities.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">Nenhuma atividade registrada ainda</p>
        ) : (
          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {activities.map((activity: any) => (
              <div
                key={activity.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${getActionColor(activity.actionType)} transition-all hover:shadow-sm`}
              >
                <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-full bg-card shadow-sm border border-border">
                  {getActionIcon(activity.actionType)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground break-words leading-relaxed">{activity.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {activity.userName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(activity.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {activity.entityType !== 'project' && (
                      <Badge variant="outline" className="text-xs py-0 px-1.5 border-border">
                        {activity.entityType === 'phase' ? 'Etapa' : activity.entityType === 'daily_task' ? 'Tarefa' : 'Comentário'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
