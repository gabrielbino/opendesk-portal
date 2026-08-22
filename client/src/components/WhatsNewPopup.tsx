import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sparkles, FolderPlus, Edit3, Trash2, ArrowRightLeft,
  CheckCircle2, MessageSquare, Layers, ListTodo,
  Clock, Circle, Bell, Filter
} from "lucide-react";
import { motion } from "framer-motion";

// ============ ACTION ICONS & LABELS ============
const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string; bgColor: string }> = {
  project_created: { icon: FolderPlus, label: "Novo projeto criado", color: "text-green-600", bgColor: "bg-green-50" },
  project_updated: { icon: Edit3, label: "Projeto atualizado", color: "text-blue-600", bgColor: "bg-blue-50" },
  project_deleted: { icon: Trash2, label: "Projeto excluído", color: "text-red-600", bgColor: "bg-red-50" },
  project_status_changed: { icon: ArrowRightLeft, label: "Status do projeto alterado", color: "text-amber-600", bgColor: "bg-amber-50" },
  task_created: { icon: ListTodo, label: "Nova tarefa criada", color: "text-green-600", bgColor: "bg-green-50" },
  task_updated: { icon: Edit3, label: "Tarefa atualizada", color: "text-blue-600", bgColor: "bg-blue-50" },
  task_deleted: { icon: Trash2, label: "Tarefa excluída", color: "text-red-600", bgColor: "bg-red-50" },
  task_status_changed: { icon: CheckCircle2, label: "Status da tarefa alterado", color: "text-amber-600", bgColor: "bg-amber-50" },
  phase_created: { icon: Layers, label: "Nova fase criada", color: "text-green-600", bgColor: "bg-green-50" },
  phase_updated: { icon: Edit3, label: "Fase atualizada", color: "text-blue-600", bgColor: "bg-blue-50" },
  phase_deleted: { icon: Trash2, label: "Fase excluída", color: "text-red-600", bgColor: "bg-red-50" },
  comment_added: { icon: MessageSquare, label: "Novo comentário", color: "text-purple-600", bgColor: "bg-purple-50" },
};

// ============ ENTITY TYPE LABELS ============
const ENTITY_LABELS: Record<string, string> = {
  project: "Projeto",
  task: "Tarefa",
  phase: "Fase",
  comment: "Comentário",
};

// ============ FILTER OPTIONS ============
const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "project", label: "Projetos" },
  { value: "task", label: "Tarefas" },
  { value: "phase", label: "Fases" },
  { value: "comment", label: "Comentários" },
];

// ============ TIME FORMATTING ============
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Hoje às ${time}`;
  if (isYesterday) return `Ontem às ${time}`;
  return `${date.toLocaleDateString("pt-BR")} às ${time}`;
}

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "agora";
  if (minutes < 60) return `${minutes}min`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ============ MAIN COMPONENT ============
export default function WhatsNewPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [entityFilter, setEntityFilter] = useState("all");

  // Fetch recent activities
  const { data: activities = [], isLoading } = trpc.devActivity.getRecent.useQuery(
    { limit: 100 },
    {
      enabled: !!user && open,
      refetchInterval: open ? 15000 : false,
      retry: false,
    }
  );

  // Count new activities (last 24h)
  const newCount = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return activities.filter((a: any) => a.createdAt > oneDayAgo).length;
  }, [activities]);

  // Filter activities
  const filteredActivities = useMemo(() => {
    if (entityFilter === "all") return activities;
    return activities.filter((a: any) => a.entityType === entityFilter);
  }, [activities, entityFilter]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    filteredActivities.forEach((activity: any) => {
      const date = new Date(activity.createdAt);
      let key: string;
      if (date.toDateString() === now.toDateString()) {
        key = "Hoje";
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = "Ontem";
      } else {
        key = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
    });

    return groups;
  }, [filteredActivities]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative flex items-center gap-1.5 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 hover:from-amber-100 hover:to-orange-100 text-amber-800"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Novidades</span>
          {newCount > 0 && (
            <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white">
              {newCount > 99 ? "99+" : newCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg max-h-[80vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100">
              <Sparkles className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Novidades</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Últimas alterações e atualizações dos projetos
              </p>
            </div>
            {newCount > 0 && (
              <Badge className="ml-auto bg-amber-100 text-amber-800 border border-amber-200">
                {newCount} nas últimas 24h
              </Badge>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1 flex-shrink-0" />
            {FILTER_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={entityFilter === opt.value ? "default" : "ghost"}
                size="sm"
                onClick={() => setEntityFilter(opt.value)}
                className={`text-xs h-7 px-2.5 flex-shrink-0 ${
                  entityFilter === opt.value
                    ? "bg-[#003366] hover:bg-[#004080] text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[55vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma novidade</p>
              <p className="text-xs mt-1">As alterações nos projetos aparecerão aqui</p>
            </div>
          ) : (
            <div className="p-4 space-y-5">
              {Object.entries(groupedByDate).map(([dateLabel, dateActivities]) => (
                <div key={dateLabel}>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {dateLabel}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {dateActivities.length}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {(dateActivities as any[]).map((activity: any, idx: number) => {
                      const config = ACTION_CONFIG[activity.action] || {
                        icon: Circle,
                        label: activity.action,
                        color: "text-gray-600",
                        bgColor: "bg-gray-50",
                      };
                      const Icon = config.icon;

                      return (
                        <motion.div
                          key={activity.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          className={`flex items-start gap-3 p-3 rounded-xl border border-border/50 ${config.bgColor} hover:shadow-sm transition-all`}
                        >
                          <div className={`mt-0.5 p-1.5 rounded-lg ${config.color} bg-white shadow-sm`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground leading-tight">
                                  {config.label}
                                </p>
                                <p className="text-sm text-foreground/80 mt-0.5 truncate">
                                  {activity.entityName}
                                </p>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                                {timeAgo(activity.createdAt)}
                              </span>
                            </div>

                            {/* Project context */}
                            {activity.projectName && activity.entityType !== "project" && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <FolderPlus className="w-3 h-3" />
                                {activity.projectName}
                              </p>
                            )}

                            {/* Changes */}
                            {activity.oldValue && activity.newValue && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 line-through">
                                  {activity.oldValue}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                                  {activity.newValue}
                                </span>
                              </div>
                            )}

                            {/* Details */}
                            {activity.details && !activity.oldValue && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {activity.details}
                              </p>
                            )}

                            {/* User & time */}
                            <div className="flex items-center gap-2 mt-2">
                              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                                {(activity.userName || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {activity.userName}
                              </span>
                              <span className="text-[10px] text-muted-foreground/60">
                                {formatTime(activity.createdAt)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
