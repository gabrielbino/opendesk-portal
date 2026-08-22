import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  MessageSquare,
  CheckCircle,
  XCircle,
  Headphones,
  Coffee,
  Moon,
} from "lucide-react";
import { toast } from "sonner";

interface OperatorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onChatAccepted?: (conversationId: number, queueId: number, userName: string) => void;
}

export function OperatorPanel({ isOpen, onClose, onChatAccepted }: OperatorPanelProps) {
  const [isAvailable, setIsAvailable] = useState(false);

  // Get operator stats
  const { data: stats, refetch: refetchStats } = trpc.operatorAvailability.getStats.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );

  // Get my availability
  const { data: myAvailability, refetch: refetchMyAvailability } = 
    trpc.operatorAvailability.getMyAvailability.useQuery();

  // Get all operators
  const { data: operators, refetch: refetchOperators } = 
    trpc.operatorAvailability.getAllOperators.useQuery(
      undefined,
      { refetchInterval: 10000 }
    );

  // Get waiting queue
  const { data: waitingQueue, refetch: refetchQueue } = 
    trpc.chatQueue.getWaitingQueue.useQuery(
      undefined,
      { refetchInterval: 3000 }
    );

  // Get my active chats
  const { data: myActiveChats, refetch: refetchMyChats } = 
    trpc.chatQueue.getMyActiveChats.useQuery(
      undefined,
      { refetchInterval: 5000 }
    );

  // Update availability mutation
  const updateAvailabilityMutation = trpc.operatorAvailability.updateAvailability.useMutation({
    onSuccess: () => {
      refetchMyAvailability();
      refetchOperators();
      refetchStats();
    },
    onError: (error) => {
      toast.error("Erro ao atualizar disponibilidade: " + error.message);
    },
  });

  // Accept chat mutation
  const acceptChatMutation = trpc.chatQueue.acceptChat.useMutation({
    onSuccess: (result) => {
      toast.success("Atendimento aceito!");
      refetchQueue();
      refetchMyChats();
      refetchStats();
      if (onChatAccepted && result.conversation && result.queue) {
        onChatAccepted(result.conversation.id, result.queue.id, result.queue.userName);
      }
    },
    onError: (error) => {
      toast.error("Erro ao aceitar atendimento: " + error.message);
    },
  });

  // Complete chat mutation
  const completeChatMutation = trpc.chatQueue.completeChat.useMutation({
    onSuccess: () => {
      toast.success("Atendimento finalizado!");
      refetchMyChats();
      refetchStats();
    },
    onError: (error) => {
      toast.error("Erro ao finalizar atendimento: " + error.message);
    },
  });

  // Sync local state with server
  useEffect(() => {
    if (myAvailability) {
      setIsAvailable(myAvailability.isAvailableForChat);
    }
  }, [myAvailability]);

  const handleToggleAvailability = (checked: boolean) => {
    setIsAvailable(checked);
    updateAvailabilityMutation.mutate({
      isAvailableForChat: checked,
      status: checked ? 'available' : 'offline',
    });
  };

  const handleAcceptChat = (queueId: number) => {
    acceptChatMutation.mutate({ queueId });
  };

  const handleCompleteChat = (queueId: number) => {
    completeChatMutation.mutate({ queueId });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <UserCheck className="h-4 w-4 text-green-500" />;
      case 'busy':
        return <Headphones className="h-4 w-4 text-amber-600" />;
      case 'away':
        return <Coffee className="h-4 w-4 text-orange-500" />;
      case 'offline':
        return <Moon className="h-4 w-4 text-muted-foreground" />;
      default:
        return <UserX className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      available: "default",
      busy: "secondary",
      away: "outline",
      offline: "destructive",
    };
    const labels: Record<string, string> = {
      available: "Disponível",
      busy: "Ocupado",
      away: "Ausente",
      offline: "Offline",
    };
    return (
      <Badge variant={variants[status] || "outline"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      normal: "outline",
      high: "secondary",
      urgent: "destructive",
    };
    const labels: Record<string, string> = {
      normal: "Normal",
      high: "Alta",
      urgent: "Urgente",
    };
    return (
      <Badge variant={variants[priority] || "outline"}>
        {labels[priority] || priority}
      </Badge>
    );
  };

  const formatWaitTime = (enteredAt: number) => {
    const minutes = Math.floor((Date.now() - enteredAt) / 60000);
    if (minutes < 1) return "Agora";
    if (minutes === 1) return "1 min";
    return `${minutes} min`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Headphones className="h-6 w-6" />
            Painel de Atendimento
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-5 w-5" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-3 text-center">
                <UserCheck className="h-6 w-6 mx-auto text-green-600 mb-1" />
                <div className="text-2xl font-bold text-green-600">{stats?.available || 0}</div>
                <div className="text-xs text-muted-foreground">Disponíveis</div>
              </CardContent>
            </Card>
            <Card className="bg-yellow-50 dark:bg-yellow-900/20">
              <CardContent className="p-3 text-center">
                <Headphones className="h-6 w-6 mx-auto text-yellow-600 mb-1" />
                <div className="text-2xl font-bold text-yellow-600">{stats?.busy || 0}</div>
                <div className="text-xs text-muted-foreground">Ocupados</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 dark:bg-orange-900/20">
              <CardContent className="p-3 text-center">
                <Coffee className="h-6 w-6 mx-auto text-orange-600 mb-1" />
                <div className="text-2xl font-bold text-orange-600">{stats?.away || 0}</div>
                <div className="text-xs text-muted-foreground">Ausentes</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-50 dark:bg-card/20">
              <CardContent className="p-3 text-center">
                <Moon className="h-6 w-6 mx-auto text-gray-600 mb-1" />
                <div className="text-2xl font-bold text-gray-600">{stats?.offline || 0}</div>
                <div className="text-xs text-muted-foreground">Offline</div>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-3 text-center">
                <Users className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                <div className="text-2xl font-bold text-blue-600">{stats?.totalInQueue || 0}</div>
                <div className="text-xs text-muted-foreground">Na Fila</div>
              </CardContent>
            </Card>
          </div>

          {/* My Availability Toggle */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isAvailable ? (
                    <UserCheck className="h-8 w-8 text-green-500" />
                  ) : (
                    <UserX className="h-8 w-8 text-muted-foreground" />
                  )}
                  <div>
                    <Label className="text-base font-medium">
                      Minha Disponibilidade
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {isAvailable 
                        ? "Você está disponível para receber atendimentos" 
                        : "Você não está recebendo novos atendimentos"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isAvailable}
                  onCheckedChange={handleToggleAvailability}
                  disabled={updateAvailabilityMutation.isPending}
                />
              </div>
              {myAvailability && (
                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Atendimentos ativos: {myAvailability.currentActiveChats}/{myAvailability.maxConcurrentChats}</span>
                  {getStatusBadge(myAvailability.status)}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Waiting Queue */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Fila de Espera ({waitingQueue?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  {waitingQueue && waitingQueue.length > 0 ? (
                    <div className="space-y-3">
                      {waitingQueue.map((entry: any, index: number) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{entry.userName}</span>
                              {getPriorityBadge(entry.priority)}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {entry.initialMessage?.substring(0, 50) || "Sem mensagem inicial"}
                              {entry.initialMessage?.length > 50 ? "..." : ""}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Aguardando há {formatWaitTime(entry.enteredAt)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleAcceptChat(entry.id)}
                            disabled={!isAvailable || acceptChatMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aceitar
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Users className="h-12 w-12 mb-2 opacity-50" />
                      <p>Nenhum usuário na fila</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* My Active Chats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Meus Atendimentos ({myActiveChats?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  {myActiveChats && myActiveChats.length > 0 ? (
                    <div className="space-y-3">
                      {myActiveChats.map((chat: any) => (
                        <div
                          key={chat.id}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{chat.userName}</div>
                            <div className="text-sm text-muted-foreground">
                              {chat.initialMessage?.substring(0, 40) || "Chat ativo"}
                              {chat.initialMessage?.length > 40 ? "..." : ""}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              Iniciado há {formatWaitTime(chat.acceptedAt)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCompleteChat(chat.id)}
                            disabled={completeChatMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Finalizar
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MessageSquare className="h-12 w-12 mb-2 opacity-50" />
                      <p>Nenhum atendimento ativo</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <Separator className="my-6" />

          {/* All Operators */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Todos os Operadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[150px]">
                {operators && operators.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {operators.map((op: any) => (
                      <div
                        key={op.id}
                        className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg"
                      >
                        {getStatusIcon(op.status)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{op.operatorName}</div>
                          <div className="text-xs text-muted-foreground">
                            {op.currentActiveChats}/{op.maxConcurrentChats} chats
                          </div>
                        </div>
                        {getStatusBadge(op.status)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Users className="h-8 w-8 mb-2 opacity-50" />
                    <p>Nenhum operador cadastrado</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

export default OperatorPanel;
