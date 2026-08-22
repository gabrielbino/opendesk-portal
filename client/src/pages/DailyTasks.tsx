import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Plus, Search, GripVertical, CheckCircle2, Clock, Play,
  Trophy, Flame, Star, Target, Award, TrendingUp, MessageSquare,
  Send, Trash2, BarChart3, Calendar, Zap, ArrowLeft,
  Sparkles, Crown, Gem, Rocket, Medal, FileText, Copy, RefreshCw, Filter
} from "lucide-react";
import { useLocation } from "wouter";
import DevPresenceAndFeed from "@/components/DevPresenceAndFeed";

// ============ TYPES ============
type Task = {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  status: "Pendente" | "Em Andamento" | "Concluída";
  priority: "Baixa" | "Média" | "Alta" | "Crítica";
  difficulty?: string;
  points?: number;
  tags?: string[];
  assignedToId: number | null;
  assignedToName: string | null;
  dueDate: number | null;
  completedAt: number | null;
  order?: number;
  createdById: number;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
};

// ============ BADGE ICON MAP ============
const BADGE_ICONS: Record<string, any> = {
  target: Target, star: Star, trophy: Trophy, crown: Crown,
  flame: Flame, zap: Zap, rocket: Rocket, award: Award,
  gem: Gem, sparkles: Sparkles,
};

// ============ PRIORITY COLORS ============
const priorityColors: Record<string, string> = {
  "Baixa": "bg-green-100 text-green-700 border-green-300",
  "Média": "bg-amber-100 text-amber-700 border-yellow-300",
  "Alta": "bg-orange-100 text-orange-600 border-orange-300",
  "Crítica": "bg-red-100 text-red-600 border-red-300",
};

const difficultyColors: Record<string, string> = {
  "Facil": "bg-emerald-100 text-emerald-700",
  "Normal": "bg-blue-100 text-blue-700",
  "Dificil": "bg-purple-100 text-purple-700",
  "Muito Dificil": "bg-red-100 text-red-600",
};

// ============ KANBAN COLUMN ============
function KanbanColumn({
  title, icon: Icon, color, tasks, onDragOver, onDrop, onDragStart, onTaskClick, onComplete,
}: {
  title: string; icon: any; color: string; tasks: Task[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
  onTaskClick: (task: Task) => void;
  onComplete: (task: Task) => void;
}) {
  return (
    <div className="flex-1 min-w-[280px] sm:min-w-[280px] max-w-[400px] snap-start" onDragOver={onDragOver} onDrop={(e) => onDrop(e, title)}>
      <div className="flex items-center gap-2 mb-3 px-2">
        <Icon className={`w-5 h-5 ${color}`} />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">{tasks.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[200px] p-2 rounded-lg bg-card border border-dashed border-border">
        {tasks.map((task) => (
          <div
            key={task.id} draggable onDragStart={(e) => onDragStart(e, task)}
            onClick={() => onTaskClick(task)}
            className="bg-muted/50 border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:bg-accent transition-all group touch-manipulation"
          >
            <div className="flex items-start gap-2">
              <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                  {task.difficulty && task.difficulty !== "Normal" && (
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${difficultyColors[task.difficulty] || ""}`}>{task.difficulty}</Badge>
                  )}
                  {task.points && task.points > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-500 border-amber-300">+{task.points}pts</Badge>
                  )}
                  {(task.tags as string[] || []).map((tag: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">{task.assignedToName || task.createdByName}</span>
                  {task.status !== "Concluída" && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 sm:opacity-0 touch:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onComplete(task); }}>
                      <CheckCircle2 className="w-4 h-4 text-green-700" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-muted-foreground/40 text-sm">Arraste tarefas aqui</div>
        )}
      </div>
    </div>
  );
}

// ============ GAMIFICATION PANEL ============
function GamificationPanel() {
  const { data: stats } = trpc.gamification.myStats.useQuery();
  const { data: leaderboard } = trpc.gamification.leaderboard.useQuery();
  const { data: badgeDefs } = trpc.gamification.badges.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();

  if (!stats) return (
    <div className="text-center py-12 text-muted-foreground">
      <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
      <p>Complete tarefas para começar a ganhar pontos!</p>
    </div>
  );

  const progressToNext = stats.nextLevelPoints > 0 ? ((stats.totalPoints / stats.nextLevelPoints) * 100) : 100;
  const getUserName = (userId: number) => allUsers?.find((u: any) => u.id === userId)?.name || `Usuário #${userId}`;

  return (
    <div className="space-y-4">
      <Card className="bg-muted/50 border-border backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-foreground"><Trophy className="w-5 h-5 text-amber-500" /> Suas Estatísticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-foreground font-bold text-xl shadow-lg">{stats.level}</div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Nível {stats.level}</p>
              <Progress value={progressToNext} className="h-2 mt-1" />
              <p className="text-xs text-muted-foreground mt-1">{stats.totalPoints} / {stats.nextLevelPoints} pontos</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { value: stats.totalPoints, label: "Pontos", color: "text-amber-500" },
              { value: stats.tasksCompleted, label: "Concluídas", color: "text-green-700" },
              { value: stats.currentStreak, label: "Streak", color: "text-orange-600" },
              { value: stats.longestStreak, label: "Melhor Streak", color: "text-purple-700" },
            ].map((s, i) => (
              <div key={i} className="text-center p-2 rounded-lg bg-card">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-border backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-foreground"><Medal className="w-5 h-5 text-purple-700" /> Conquistas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {badgeDefs?.map((badge: any) => {
              const earned = stats.badges.includes(badge.id);
              const IconComp = BADGE_ICONS[badge.icon] || Award;
              return (
                <div key={badge.id} className={`flex flex-col items-center p-2 rounded-lg text-center transition-all ${earned ? "bg-amber-100 border border-amber-300" : "bg-card opacity-40"}`} title={badge.description}>
                  <IconComp className={`w-6 h-6 ${earned ? "text-amber-500" : "text-muted-foreground/50"}`} />
                  <p className="text-[9px] mt-1 font-medium leading-tight text-foreground">{badge.name}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-border backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-foreground"><TrendingUp className="w-5 h-5 text-blue-700" /> Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {leaderboard?.slice(0, 10).map((entry: any, i: number) => (
              <div key={entry.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-card">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500 text-foreground" : i === 1 ? "bg-gray-400 text-foreground" : i === 2 ? "bg-orange-700 text-foreground" : "bg-muted/50 text-muted-foreground"}`}>{i + 1}</span>
                <span className="text-sm flex-1 text-foreground">{getUserName(entry.userId)}</span>
                <span className="text-sm font-medium text-amber-500">{entry.totalPoints} pts</span>
                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Nv.{entry.level}</Badge>
              </div>
            ))}
            {(!leaderboard || leaderboard.length === 0) && <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado de ranking ainda</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ ANALYTICS PANEL ============
function AnalyticsPanel({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "Concluída").length;
  const inProgress = tasks.filter(t => t.status === "Em Andamento").length;
  const pending = tasks.filter(t => t.status === "Pendente").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const byPriority = {
    "Crítica": tasks.filter(t => t.priority === "Crítica").length,
    "Alta": tasks.filter(t => t.priority === "Alta").length,
    "Média": tasks.filter(t => t.priority === "Média").length,
    "Baixa": tasks.filter(t => t.priority === "Baixa").length,
  };

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < todayStart.getTime() && t.status !== "Concluída");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: total, label: "Total", color: "text-foreground" },
          { value: completed, label: "Concluídas", color: "text-green-700" },
          { value: inProgress, label: "Em Andamento", color: "text-blue-700" },
          { value: pending, label: "Pendentes", color: "text-amber-700" },
        ].map((s, i) => (
          <Card key={i} className="bg-muted/50 border-border backdrop-blur">
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-muted/50 border-border backdrop-blur">
        <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Taxa de Conclusão</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={completionRate} className="flex-1 h-3" />
            <span className="text-lg font-bold text-foreground">{completionRate}%</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/50 border-border backdrop-blur">
        <CardHeader className="pb-2"><CardTitle className="text-base text-foreground">Distribuição por Prioridade</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(byPriority).map(([priority, count]) => (
            <div key={priority} className="flex items-center gap-3">
              <Badge variant="outline" className={`w-16 justify-center text-[10px] ${priorityColors[priority]}`}>{priority}</Badge>
              <div className="flex-1 bg-muted/50 rounded-full h-2">
                <div className={`h-2 rounded-full ${priority === "Crítica" ? "bg-red-500" : priority === "Alta" ? "bg-orange-500" : priority === "Média" ? "bg-yellow-500" : "bg-green-500"}`}
                  style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
              </div>
              <span className="text-sm font-medium w-8 text-right text-foreground">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {overdueTasks.length > 0 && (
        <Card className="bg-red-50 border-red-300 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-600 flex items-center gap-2"><Clock className="w-4 h-4" /> Tarefas Atrasadas ({overdueTasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">{overdueTasks.slice(0, 5).map(t => <p key={t.id} className="text-sm text-red-700">{t.title}</p>)}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ TASK DETAIL MODAL ============
function TaskDetailModal({ task, open, onClose, onUpdate, isAdmin }: {
  task: Task | null; open: boolean; onClose: () => void; onUpdate: () => void; isAdmin: boolean;
}) {
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const { data: comments, refetch: refetchComments } = trpc.taskComments.list.useQuery({ taskId: task?.id || 0 }, { enabled: !!task });

  const addComment = trpc.taskComments.create.useMutation({
    onSuccess: () => { setComment(""); refetchComments(); toast.success("Comentário adicionado"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteComment = trpc.taskComments.delete.useMutation({
    onSuccess: () => { refetchComments(); toast.success("Comentário removido"); },
    onError: (e) => toast.error(e.message),
  });

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-card border-border">
        <DialogHeader><DialogTitle className="text-lg text-foreground">{task.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-blue-700 mb-1">Status</p><Badge variant="outline" className="border-border text-foreground">{task.status}</Badge></div>
            <div><p className="text-xs text-blue-700 mb-1">Prioridade</p><Badge variant="outline" className={priorityColors[task.priority]}>{task.priority}</Badge></div>
            {task.difficulty && <div><p className="text-xs text-blue-700 mb-1">Dificuldade</p><Badge variant="outline" className={difficultyColors[task.difficulty] || "border-border text-foreground"}>{task.difficulty}</Badge></div>}
            {task.points !== undefined && task.points > 0 && <div><p className="text-xs text-blue-700 mb-1">Pontos</p><Badge variant="outline" className="bg-amber-100 text-amber-500 border-amber-300">+{task.points}pts</Badge></div>}
            <div><p className="text-xs text-blue-700 mb-1">Responsável</p><p className="text-sm text-foreground">{task.assignedToName || "Não atribuído"}</p></div>
            <div><p className="text-xs text-blue-700 mb-1">Criado por</p><p className="text-sm text-foreground">{task.createdByName}</p></div>
          </div>
          {(task.tags as string[] || []).length > 0 && (
            <div><p className="text-xs text-blue-700 mb-1">Tags</p><div className="flex flex-wrap gap-1">{(task.tags as string[] || []).map((tag: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>)}</div></div>
          )}
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground"><MessageSquare className="w-4 h-4" /> Comentários</h4>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments?.map((c: any) => (
                <div key={c.id} className="bg-card rounded-lg p-3 group">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{c.authorName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-blue-700">{new Date(c.createdAt).toLocaleString("pt-BR")}</span>
                      {(isAdmin || c.authorId === user?.id) && (
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100" onClick={() => deleteComment.mutate({ id: c.id })}>
                          <Trash2 className="w-3 h-3 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm mt-1 text-foreground">{c.content}</p>
                </div>
              ))}
              {(!comments || comments.length === 0) && <p className="text-xs text-blue-700 text-center py-4">Nenhum comentário ainda</p>}
            </div>
            <div className="flex gap-2 mt-3">
              <Input placeholder="Escreva um comentário..." value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && comment.trim()) addComment.mutate({ taskId: task.id, content: comment.trim() }); }}
                className="text-sm bg-muted/50 border-border text-foreground placeholder:text-blue-700" />
              <Button size="sm" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ taskId: task.id, content: comment.trim() })}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ MAIN COMPONENT ============
export default function DailyTasks() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState("kanban");
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("Média");
  const [newDifficulty, setNewDifficulty] = useState("Normal");
  const [newProjectId, setNewProjectId] = useState<number>(0);
  const [newAssignedToId, setNewAssignedToId] = useState<string>("");

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templatePriority, setTemplatePriority] = useState("Média");
  const [templateDifficulty, setTemplateDifficulty] = useState("Normal");
  const [templatePoints, setTemplatePoints] = useState("10");

  const { data: tasks, refetch: refetchTasks } = trpc.dailyTasks.getToday.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: allUsers } = trpc.users.list.useQuery();
  const { data: templates } = trpc.taskTemplates.list.useQuery();
  const utils = trpc.useUtils();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => { refetchTasks(); }, 30000);
    return () => clearInterval(interval);
  }, [refetchTasks]);

  const createTask = trpc.dailyTasks.create.useMutation({
    onSuccess: () => { toast.success("Tarefa criada!"); setShowCreateDialog(false); resetForm(); refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });
  const updateTask = trpc.dailyTasks.update.useMutation({
    onSuccess: () => { refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });
  const completeTask = trpc.dailyTasks.complete.useMutation({
    onSuccess: () => { toast.success("Tarefa concluída! +pontos"); refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });
  const awardPoints = trpc.gamification.awardPoints.useMutation({
    onSuccess: (data) => {
      if (data.newBadges.length > 0) toast.success("Nova conquista desbloqueada!", { duration: 5000 });
      utils.gamification.myStats.invalidate();
      utils.gamification.leaderboard.invalidate();
    },
  });
  const deleteTask = trpc.dailyTasks.delete.useMutation({
    onSuccess: () => { toast.success("Tarefa excluída!"); refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });
  const createTemplate = trpc.taskTemplates.create.useMutation({
    onSuccess: () => { toast.success("Template criado!"); setShowTemplateDialog(false); resetTemplateForm(); utils.taskTemplates.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const createFromTemplate = trpc.taskTemplates.createFromTemplate.useMutation({
    onSuccess: () => { toast.success("Tarefa criada a partir do template!"); refetchTasks(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => { setNewTitle(""); setNewDescription(""); setNewPriority("Média"); setNewDifficulty("Normal"); setNewAssignedToId(""); };
  const resetTemplateForm = () => { setTemplateName(""); setTemplateDescription(""); setTemplatePriority("Média"); setTemplateDifficulty("Normal"); setTemplatePoints("10"); };

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return (tasks as Task[]).filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterProject !== "all" && t.projectId !== Number(filterProject)) return false;
      return true;
    });
  }, [tasks, search, filterPriority, filterProject]);

  const pendingTasks = useMemo(() => filteredTasks.filter(t => t.status === "Pendente").sort((a, b) => (a.order || 0) - (b.order || 0)), [filteredTasks]);
  const inProgressTasks = useMemo(() => filteredTasks.filter(t => t.status === "Em Andamento").sort((a, b) => (a.order || 0) - (b.order || 0)), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter(t => t.status === "Concluída").sort((a, b) => (a.order || 0) - (b.order || 0)), [filteredTasks]);

  const handleDragStart = useCallback((e: React.DragEvent, task: Task) => { setDraggedTask(task); e.dataTransfer.effectAllowed = "move"; }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const handleDrop = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (!draggedTask) return;
    const statusMap: Record<string, "Pendente" | "Em Andamento" | "Concluída"> = { "Pendente": "Pendente", "Em Andamento": "Em Andamento", "Concluída": "Concluída" };
    const newStatus = statusMap[status];
    if (!newStatus || draggedTask.status === newStatus) { setDraggedTask(null); return; }
    if (newStatus === "Concluída" && draggedTask.status !== "Concluída") {
      completeTask.mutate({ id: draggedTask.id });
      awardPoints.mutate({ taskId: draggedTask.id, difficulty: draggedTask.difficulty || "Normal" });
    } else {
      updateTask.mutate({ id: draggedTask.id, status: newStatus });
    }
    setDraggedTask(null);
  }, [draggedTask, completeTask, awardPoints, updateTask]);

  const handleComplete = useCallback((task: Task) => {
    completeTask.mutate({ id: task.id });
    awardPoints.mutate({ taskId: task.id, difficulty: task.difficulty || "Normal" });
  }, [completeTask, awardPoints]);

  const handleCreate = () => {
    if (!newTitle.trim() || !newProjectId) { toast.error("Preencha título e selecione um projeto"); return; }
    const assignedUser = allUsers?.find((u: any) => u.id === Number(newAssignedToId));
    createTask.mutate({
      projectId: newProjectId, title: newTitle.trim(), description: newDescription.trim() || undefined,
      priority: newPriority as any, assignedToId: assignedUser?.id, assignedToName: assignedUser?.name, dueDate: Date.now(),
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      {/* Header */}
      <div className="border-b border-border bg-card backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="text-foreground hover:bg-muted/50" onClick={() => navigate("/desenvolvimento")}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <h1 className="text-lg font-bold text-foreground">Tarefas Diárias</h1>
              <Badge variant="secondary" className="bg-muted/50 text-foreground">{filteredTasks.length} tarefas</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <DevPresenceAndFeed currentPage="desenvolvimento/tarefas" />
              <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-muted/50" onClick={() => refetchTasks()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-muted/50" onClick={() => setShowTemplateDialog(true)}>
                <FileText className="w-4 h-4 mr-1" /> Template
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-foreground" onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-1" /> Nova Tarefa
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-700" />
              <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm bg-muted/50 border-border text-foreground placeholder:text-blue-700" />
            </div>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-32 h-8 text-sm bg-muted/50 border-border text-foreground"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="Crítica">Crítica</SelectItem>
                <SelectItem value="Alta">Alta</SelectItem>
                <SelectItem value="Média">Média</SelectItem>
                <SelectItem value="Baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-40 h-8 text-sm bg-muted/50 border-border text-foreground"><SelectValue placeholder="Projeto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {projects?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-muted/50 border border-border">
            <TabsTrigger value="kanban" className="gap-1 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-foreground"><GripVertical className="w-4 h-4" /> Kanban</TabsTrigger>
            <TabsTrigger value="list" className="gap-1 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-foreground"><Filter className="w-4 h-4" /> Lista</TabsTrigger>
            <TabsTrigger value="gamification" className="gap-1 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-foreground"><Trophy className="w-4 h-4" /> Gamificação</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-foreground"><BarChart3 className="w-4 h-4" /> Analytics</TabsTrigger>
            <TabsTrigger value="templates" className="gap-1 text-foreground data-[state=active]:bg-white/20 data-[state=active]:text-foreground"><FileText className="w-4 h-4" /> Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 sm:mx-0 px-4 sm:px-0 snap-x snap-mandatory sm:snap-none">
              <KanbanColumn title="Pendente" icon={Clock} color="text-amber-700" tasks={pendingTasks} onDragOver={handleDragOver} onDrop={handleDrop} onDragStart={handleDragStart} onTaskClick={setSelectedTask} onComplete={handleComplete} />
              <KanbanColumn title="Em Andamento" icon={Play} color="text-blue-700" tasks={inProgressTasks} onDragOver={handleDragOver} onDrop={handleDrop} onDragStart={handleDragStart} onTaskClick={setSelectedTask} onComplete={handleComplete} />
              <KanbanColumn title="Concluída" icon={CheckCircle2} color="text-green-700" tasks={completedTasks} onDragOver={handleDragOver} onDrop={handleDrop} onDragStart={handleDragStart} onTaskClick={setSelectedTask} onComplete={handleComplete} />
            </div>
          </TabsContent>

          <TabsContent value="list">
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <Card key={task.id} className="bg-muted/50 border-border backdrop-blur hover:bg-accent transition-shadow cursor-pointer" onClick={() => setSelectedTask(task)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                      onClick={(e) => { e.stopPropagation(); if (task.status !== "Concluída") handleComplete(task); }}>
                      <CheckCircle2 className={`w-5 h-5 ${task.status === "Concluída" ? "text-green-700" : "text-muted-foreground/30"}`} />
                    </Button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-foreground ${task.status === "Concluída" ? "line-through opacity-60" : ""}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={`text-[10px] ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                        <span className="text-[10px] text-muted-foreground">{task.assignedToName || task.createdByName}</span>
                      </div>
                    </div>
                    {task.points && task.points > 0 && <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-500 border-amber-300 shrink-0">+{task.points}pts</Badge>}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); deleteTask.mutate({ id: task.id }); }}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
              {filteredTasks.length === 0 && (
                <div className="text-center py-12 text-muted-foreground"><Target className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhuma tarefa encontrada</p></div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="gamification"><GamificationPanel /></TabsContent>
          <TabsContent value="analytics"><AnalyticsPanel tasks={filteredTasks} /></TabsContent>

          <TabsContent value="templates">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Templates de Tarefas</h3>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-foreground" onClick={() => setShowTemplateDialog(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Novo Template
                </Button>
              </div>
              {templates?.map((t: any) => (
                <Card key={t.id} className="bg-muted/50 border-border backdrop-blur">
                  <CardContent className="p-4 flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-700" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description || "Sem descrição"}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{t.defaultPriority}</Badge>
                        <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">{t.defaultDifficulty}</Badge>
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-500 border-amber-300">+{t.defaultPoints}pts</Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="border-border text-foreground hover:bg-muted/50"
                      onClick={() => {
                        if (!projects?.length) { toast.error("Nenhum projeto disponível"); return; }
                        createFromTemplate.mutate({ templateId: t.id, projectId: projects[0].id });
                      }}>
                      <Copy className="w-4 h-4 mr-1" /> Usar
                    </Button>
                  </CardContent>
                </Card>
              ))}
              {(!templates || templates.length === 0) && (
                <div className="text-center py-12 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Nenhum template criado ainda</p></div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Nova Tarefa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Projeto *</label>
              <Select value={newProjectId ? String(newProjectId) : ""} onValueChange={(v) => setNewProjectId(Number(v))}>
                <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
                <SelectContent>{projects?.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Título *</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nome da tarefa" className="bg-muted border-border text-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Detalhes..." rows={3} className="bg-muted border-border text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Crítica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Dificuldade</label>
                <Select value={newDifficulty} onValueChange={setNewDifficulty}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Facil">Fácil</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Dificil">Difícil</SelectItem>
                    <SelectItem value="Muito Dificil">Muito Difícil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Responsável</label>
              <Select value={newAssignedToId} onValueChange={setNewAssignedToId}>
                <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{allUsers?.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border text-muted-foreground" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleCreate} disabled={createTask.isPending}>{createTask.isPending ? "Criando..." : "Criar Tarefa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Novo Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome *</label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Nome do template" className="bg-muted border-border text-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <Textarea value={templateDescription} onChange={(e) => setTemplateDescription(e.target.value)} placeholder="Detalhes..." rows={2} className="bg-muted border-border text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Prioridade</label>
                <Select value={templatePriority} onValueChange={setTemplatePriority}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Crítica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Dificuldade</label>
                <Select value={templateDifficulty} onValueChange={setTemplateDifficulty}>
                  <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Facil">Fácil</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Dificil">Difícil</SelectItem>
                    <SelectItem value="Muito Dificil">Muito Difícil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pontos</label>
              <Input type="number" value={templatePoints} onChange={(e) => setTemplatePoints(e.target.value)} className="bg-muted border-border text-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-border text-muted-foreground" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (!templateName.trim()) { toast.error("Nome é obrigatório"); return; }
                createTemplate.mutate({ name: templateName.trim(), description: templateDescription.trim() || undefined, defaultPriority: templatePriority as any, defaultDifficulty: templateDifficulty as any, defaultPoints: Number(templatePoints) || 10 });
              }}
              disabled={createTemplate.isPending}>{createTemplate.isPending ? "Criando..." : "Criar Template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Modal */}
      <TaskDetailModal task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} onUpdate={refetchTasks} isAdmin={isAdmin} />
    </div>
  );
}
