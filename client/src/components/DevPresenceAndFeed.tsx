import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users, Activity, ChevronRight, ChevronLeft,
  FolderPlus, Edit3, Trash2, ArrowRightLeft,
  CheckCircle2, MessageSquare, Layers, ListTodo,
  Clock, Circle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============ ACTION ICONS & LABELS ============
const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  project_created: { icon: FolderPlus, label: "criou o projeto", color: "text-green-600" },
  project_updated: { icon: Edit3, label: "atualizou o projeto", color: "text-blue-600" },
  project_deleted: { icon: Trash2, label: "excluiu o projeto", color: "text-red-600" },
  project_status_changed: { icon: ArrowRightLeft, label: "alterou o status do projeto", color: "text-amber-600" },
  task_created: { icon: ListTodo, label: "criou a tarefa", color: "text-green-600" },
  task_updated: { icon: Edit3, label: "atualizou a tarefa", color: "text-blue-600" },
  task_deleted: { icon: Trash2, label: "excluiu a tarefa", color: "text-red-600" },
  task_status_changed: { icon: CheckCircle2, label: "alterou o status da tarefa", color: "text-amber-600" },
  phase_created: { icon: Layers, label: "criou a fase", color: "text-green-600" },
  phase_updated: { icon: Edit3, label: "atualizou a fase", color: "text-blue-600" },
  phase_deleted: { icon: Trash2, label: "excluiu a fase", color: "text-red-600" },
  comment_added: { icon: MessageSquare, label: "comentou em", color: "text-purple-600" },
};

// ============ PRESENCE BAR ============
function PresenceBar({ currentPage }: { currentPage: string }) {
  const { user } = useAuth();

  // Heartbeat every 10 seconds - silent errors (background operation)
  const heartbeatMutation = trpc.devActivity.heartbeat.useMutation({
    onError: () => {
      // Silently ignore heartbeat errors (auth expired, network issues, etc.)
    },
  });

  useEffect(() => {
    if (!user) return;
    // Initial heartbeat
    heartbeatMutation.mutate({ currentPage });
    const interval = setInterval(() => {
      heartbeatMutation.mutate({ currentPage });
    }, 10000);
    return () => clearInterval(interval);
  }, [user, currentPage]);

  // Poll presence every 10 seconds - don't retry on failure
  const { data: presenceData = [] } = trpc.devActivity.getPresence.useQuery(undefined, {
    refetchInterval: 10000,
    enabled: !!user,
    retry: false,
  });

  // Get unique users by userId
  const onlineUsers = useMemo(() => {
    const seen = new Set<number>();
    return presenceData.filter((u: any) => {
      if (seen.has(u.userId)) return false;
      seen.add(u.userId);
      return true;
    });
  }, [presenceData]);

  if (onlineUsers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="w-4 h-4" />
        <span className="hidden sm:inline">Online agora:</span>
      </div>
      <div className="flex items-center -space-x-2">
        {onlineUsers.slice(0, 8).map((u: any) => {
          const initials = (u.userName || "?")
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          return (
            <Tooltip key={u.userId}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold border-2 border-white shadow-sm cursor-default">
                    {initials}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{u.userName}</p>
                <p className="text-xs text-muted-foreground">
                  {u.currentPage || "Módulo de Desenvolvimento"}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {onlineUsers.length > 8 && (
          <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold border-2 border-white">
            +{onlineUsers.length - 8}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ TIME AGO ============
function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "agora";
  if (minutes < 60) return `${minutes}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return new Date(timestamp).toLocaleDateString("pt-BR");
}

// ============ ACTIVITY FEED PANEL ============
function ActivityFeedPanel() {
  const { user } = useAuth();

  // Poll activities every 15 seconds - don't retry on failure
  const { data: activities = [], isLoading } = trpc.devActivity.getRecent.useQuery(
    { limit: 50 },
    {
      refetchInterval: 15000,
      enabled: !!user,
      retry: false,
    }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Activity className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma atividade recente</p>
        <p className="text-xs mt-1">As ações no módulo aparecerão aqui</p>
      </div>
    );
  }

  // Group activities by date
  const groupedByDate = activities.reduce((acc: Record<string, any[]>, activity: any) => {
    const date = new Date(activity.createdAt).toLocaleDateString("pt-BR");
    if (!acc[date]) acc[date] = [];
    acc[date].push(activity);
    return acc;
  }, {});

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {Object.entries(groupedByDate).map(([date, dateActivities]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {date === new Date().toLocaleDateString("pt-BR") ? "Hoje" : date}
              </span>
            </div>
            <div className="space-y-1">
              {(dateActivities as any[]).map((activity: any) => {
                const config = ACTION_CONFIG[activity.action] || {
                  icon: Circle,
                  label: activity.action,
                  color: "text-gray-600",
                };
                const Icon = config.icon;

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className={`mt-0.5 p-1 rounded ${config.color} bg-muted/80`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight">
                        <span className="font-semibold text-foreground">
                          {activity.userName}
                        </span>{" "}
                        <span className="text-muted-foreground">{config.label}</span>{" "}
                        <span className="font-medium text-foreground truncate">
                          {activity.entityName}
                        </span>
                      </p>
                      {activity.projectName && activity.entityType !== "project" && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          em {activity.projectName}
                        </p>
                      )}
                      {activity.oldValue && activity.newValue && (
                        <p className="text-xs mt-0.5">
                          <span className="text-red-500 line-through">{activity.oldValue}</span>
                          {" → "}
                          <span className="text-green-600 font-medium">{activity.newValue}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {timeAgo(activity.createdAt)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ============ MAIN COMPONENT ============
export default function DevPresenceAndFeed({ currentPage = "desenvolvimento" }: { currentPage?: string }) {
  const [feedOpen, setFeedOpen] = useState(false);

  return (
    <>
      {/* Presence Bar - always visible */}
      <div className="flex items-center gap-3">
        <PresenceBar currentPage={currentPage} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFeedOpen(!feedOpen)}
          className="flex items-center gap-1.5 text-sm"
        >
          <Activity className="w-4 h-4" />
          <span className="hidden sm:inline">Atividades</span>
          {feedOpen ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Feed Panel - slide in from right */}
      <AnimatePresence>
        {feedOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="fixed right-0 top-0 h-full bg-card border-l border-border shadow-xl z-50 overflow-hidden"
          >
            <div className="flex flex-col h-full w-[340px]">
              {/* Feed Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-foreground">Atividade em Tempo Real</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFeedOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Feed Content */}
              <div className="flex-1 overflow-hidden">
                <ActivityFeedPanel />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay when feed is open on mobile */}
      <AnimatePresence>
        {feedOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40 lg:hidden"
            onClick={() => setFeedOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
