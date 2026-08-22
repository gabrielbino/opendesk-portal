import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Send, 
  X, 
  MessageCircle, 
  Loader2, 
  Check, 
  CheckCheck,
  Minimize2,
  Maximize2,
  Users,
  Clock,
  UserCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import RatingModal from "@/components/RatingModal";

interface ChatBoxWithQueueProps {
  ticketId?: number;
  onClose?: () => void;
  className?: string;
  minimized?: boolean;
  onToggleMinimize?: () => void;
}

interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderRole: 'user' | 'operator' | 'admin' | 'system';
  content: string;
  messageType: 'text' | 'file' | 'image' | 'system';
  attachmentUrl?: string;
  attachmentName?: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: number;
}

type ChatState = 'idle' | 'waiting' | 'connected';

export function ChatBoxWithQueue({ 
  ticketId,
  onClose, 
  className,
  minimized = false,
  onToggleMinimize
}: ChatBoxWithQueueProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ userId: number; userName: string }[]>([]);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [waitStartTime, setWaitStartTime] = useState<number | null>(null);
  const [waitTime, setWaitTime] = useState(0);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingOperatorId, setRatingOperatorId] = useState<number | null>(null);
  const [ratingOperatorName, setRatingOperatorName] = useState<string>('');
  const [ratingConversationId, setRatingConversationId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get available operators count
  const { data: availableOperators } = trpc.operatorAvailability.getAvailable.useQuery(
    undefined,
    { refetchInterval: 10000, enabled: chatState === 'idle' }
  );

  // Get operator stats
  const { data: stats } = trpc.operatorAvailability.getStats.useQuery(
    undefined,
    { refetchInterval: 5000, enabled: chatState !== 'connected' }
  );

  // Get my queue status (poll during waiting AND connected to detect completion)
  const { data: myQueueStatus, refetch: refetchQueueStatus } = trpc.chatQueue.getMyStatus.useQuery(
    undefined,
    { 
      refetchInterval: 3000,
      enabled: chatState === 'waiting' || chatState === 'connected',
    }
  );

  // Get my position in queue
  const { data: myPosition } = trpc.chatQueue.getMyPosition.useQuery(
    undefined,
    { 
      refetchInterval: 3000,
      enabled: chatState === 'waiting',
    }
  );

  // Get messages
  const { data: initialMessages, isLoading: loadingMessages } = trpc.chat.getMessages.useQuery(
    { conversationId: conversationId!, limit: 50 },
    { enabled: !!conversationId && chatState === 'connected' }
  );

  // Poll for new messages
  const { data: newMessages } = trpc.chat.getNewMessages.useQuery(
    { conversationId: conversationId!, afterTimestamp: lastMessageTimestamp },
    { 
      enabled: !!conversationId && lastMessageTimestamp > 0 && chatState === 'connected',
      refetchInterval: 3000,
    }
  );

  // Poll for typing users
  const { data: typingData } = trpc.chat.getTypingUsers.useQuery(
    { conversationId: conversationId! },
    { 
      enabled: !!conversationId && chatState === 'connected',
      refetchInterval: 2000,
    }
  );

  // Mutations
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const updateTypingMutation = trpc.chat.updateTyping.useMutation();
  const markAsReadMutation = trpc.chat.markAsRead.useMutation();
  const enterQueueMutation = trpc.chatQueue.enterQueue.useMutation();
  const leaveQueueMutation = trpc.chatQueue.leaveQueue.useMutation();

  // Check if chat was accepted or completed
  useEffect(() => {
    if (myQueueStatus?.status === 'in_progress' && myQueueStatus.conversationId) {
      setConversationId(myQueueStatus.conversationId);
      setChatState('connected');
      toast.success("Um operador aceitou seu atendimento!");
    } else if (myQueueStatus?.status === 'completed') {
      // Chat was finalized by operator - show rating modal
      toast.info("Atendimento finalizado pelo operador.");
      
      // Get operator info from queue status
      if (myQueueStatus.assignedOperatorId && myQueueStatus.conversationId) {
        setRatingOperatorId(myQueueStatus.assignedOperatorId);
        setRatingOperatorName(myQueueStatus.assignedOperatorName || 'Operador');
        setRatingConversationId(myQueueStatus.conversationId);
        setShowRatingModal(true);
      } else {
        // No operator info, just close
        setChatState('idle');
        setConversationId(undefined);
        setMessages([]);
        setWaitStartTime(null);
        setWaitTime(0);
        setTimeout(() => onClose?.(), 1000);
      }
    }
  }, [myQueueStatus?.status, myQueueStatus?.conversationId, myQueueStatus?.assignedOperatorId, myQueueStatus?.assignedOperatorName, onClose]);

  // Update wait time every second
  useEffect(() => {
    if (!waitStartTime || chatState !== 'waiting') return;

    const interval = setInterval(() => {
      setWaitTime(Math.floor((Date.now() - waitStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [waitStartTime, chatState]);

  // Load initial messages
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      const lastMsg = initialMessages[initialMessages.length - 1];
      setLastMessageTimestamp(lastMsg.createdAt);
    }
  }, [initialMessages]);

  // Append new messages from polling
  useEffect(() => {
    if (newMessages && newMessages.length > 0) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const uniqueNew = newMessages.filter((m: Message) => !existingIds.has(m.id));
        if (uniqueNew.length > 0) {
          const lastMsg = uniqueNew[uniqueNew.length - 1];
          setLastMessageTimestamp(lastMsg.createdAt);
          return [...prev, ...uniqueNew];
        }
        return prev;
      });
    }
  }, [newMessages]);

  // Update typing users
  useEffect(() => {
    if (typingData) {
      setTypingUsers(typingData.filter((t: any) => t.userId !== user?.id));
    }
  }, [typingData, user?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (conversationId && !minimized && chatState === 'connected') {
      markAsReadMutation.mutate({ conversationId });
    }
  }, [conversationId, minimized, chatState]);

  // Check if already in queue on mount
  useEffect(() => {
    const checkExistingQueue = async () => {
      const status = await refetchQueueStatus();
      if (status.data) {
        if (status.data.status === 'in_progress' && status.data.conversationId) {
          setConversationId(status.data.conversationId);
          setChatState('connected');
        } else if (['waiting', 'assigned'].includes(status.data.status)) {
          setChatState('waiting');
          setWaitStartTime(status.data.enteredAt);
        }
      }
    };
    checkExistingQueue();
  }, []);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!conversationId || conversationId <= 0 || chatState !== 'connected') return;

    if (!isTyping) {
      setIsTyping(true);
      updateTypingMutation.mutate({ conversationId, isTyping: true });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (conversationId && conversationId > 0) {
        updateTypingMutation.mutate({ conversationId, isTyping: false });
      }
    }, 3000);
  }, [conversationId, isTyping, updateTypingMutation, chatState]);

  // Join queue
  const handleJoinQueue = () => {
    enterQueueMutation.mutate({
      initialMessage: initialMessage.trim() || undefined,
      ticketId,
      priority: 'normal',
    }, {
      onSuccess: (result) => {
        setChatState('waiting');
        setWaitStartTime(result.enteredAt);
        toast.success("Você entrou na fila de atendimento!");
      },
      onError: (error) => {
        toast.error("Erro ao entrar na fila: " + error.message);
      },
    });
  };

  // Leave queue
  const handleLeaveQueue = () => {
    leaveQueueMutation.mutate(undefined, {
      onSuccess: () => {
        setChatState('idle');
        setWaitStartTime(null);
        setWaitTime(0);
        toast.info("Você saiu da fila de atendimento");
      },
      onError: (error) => {
        toast.error("Erro ao sair da fila: " + error.message);
      },
    });
  };

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !user || !conversationId || chatState !== 'connected') return;

    const newMessage = await sendMessageMutation.mutateAsync({
      conversationId,
      content: message.trim(),
    });

    setMessages(prev => [...prev, newMessage]);
    setLastMessageTimestamp(newMessage.createdAt);
    setMessage("");
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    updateTypingMutation.mutate({ conversationId, isTyping: false });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatState === 'idle') {
        handleJoinQueue();
      } else if (chatState === 'connected') {
        handleSendMessage();
      }
    }
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return format(date, "HH:mm", { locale: ptBR });
  };

  const formatWaitTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const availableCount = availableOperators?.length || 0;
  const hasAvailableOperators = availableCount > 0;

  if (minimized) {
    return (
      <div 
        className={cn(
          "fixed bottom-4 right-4 z-50 cursor-pointer",
          className
        )}
        onClick={onToggleMinimize}
      >
        <div className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:scale-105 transition-transform">
          <MessageCircle className="h-6 w-6" />
          {chatState === 'waiting' && (
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
              !
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 w-96 bg-background border rounded-lg shadow-xl flex flex-col",
      "max-h-[600px]",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <span className="font-semibold">
            {chatState === 'idle' ? 'Iniciar Atendimento' :
             chatState === 'waiting' ? 'Aguardando...' : 'Chat de Suporte'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={onToggleMinimize}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content based on state */}
      {chatState === 'idle' && (
        <div className="p-4 space-y-4">
          {/* Operator Status */}
          <div className="text-center">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
              hasAvailableOperators ? 'bg-green-100 dark:bg-green-900/30' : 'bg-yellow-100 dark:bg-yellow-900/30'
            }`}>
              {hasAvailableOperators ? (
                <UserCheck className="h-8 w-8 text-green-600" />
              ) : (
                <Clock className="h-8 w-8 text-yellow-600" />
              )}
            </div>
            <h3 className="mt-3 font-semibold">
              {hasAvailableOperators ? "Operadores Disponíveis" : "Aguarde um momento"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {hasAvailableOperators 
                ? `${availableCount} operador${availableCount > 1 ? 'es' : ''} pronto${availableCount > 1 ? 's' : ''} para atender`
                : "Entre na fila e será atendido em breve"}
            </p>
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex justify-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{stats.totalInQueue} na fila</span>
              </div>
              <div className="flex items-center gap-1">
                <UserCheck className="h-4 w-4 text-green-500" />
                <span>{stats.available} disponíveis</span>
              </div>
            </div>
          )}

          {/* Initial Message Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Descreva sua dúvida (opcional)</label>
            <Input
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="Ex: Preciso de ajuda com..."
              onKeyPress={handleKeyPress}
            />
          </div>

          {/* Join Queue Button */}
          <Button 
            onClick={handleJoinQueue}
            disabled={enterQueueMutation.isPending}
            className="w-full"
          >
            {enterQueueMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Entrando na fila...
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 mr-2" />
                Iniciar Atendimento
              </>
            )}
          </Button>
        </div>
      )}

      {chatState === 'waiting' && (
        <div className="p-4 space-y-4">
          {/* Waiting Animation */}
          <div className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center animate-pulse">
              <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="mt-3 font-semibold">Aguardando Atendimento</h3>
            <p className="text-sm text-muted-foreground">
              Um operador irá atendê-lo em breve
            </p>
          </div>

          {/* Position and Wait Time */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-primary">
                  {myPosition?.position || "..."}º
                </div>
                <div className="text-xs text-muted-foreground">
                  de {myPosition?.total || "..."} na fila
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-primary">
                  {formatWaitTime(waitTime)}
                </div>
                <div className="text-xs text-muted-foreground">
                  tempo de espera
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          {myPosition && myPosition.total > 0 && (
            <div className="space-y-2">
              <Progress 
                value={((myPosition.total - myPosition.position + 1) / myPosition.total) * 100} 
                className="h-2"
              />
              <p className="text-xs text-center text-muted-foreground">
                {myPosition.position === 1 
                  ? "Você é o próximo!" 
                  : `${myPosition.position - 1} pessoa${myPosition.position - 1 > 1 ? 's' : ''} na sua frente`}
              </p>
            </div>
          )}

          {/* Leave Queue Button */}
          <Button 
            variant="outline"
            onClick={handleLeaveQueue}
            disabled={leaveQueueMutation.isPending}
            className="w-full"
          >
            {leaveQueueMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saindo...
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-2" />
                Sair da Fila
              </>
            )}
          </Button>
        </div>
      )}

      {chatState === 'connected' && (
        <>
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-3 min-h-[300px] max-h-[400px]">
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                <p>Nenhuma mensagem ainda</p>
                <p className="text-sm">Envie uma mensagem para começar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isOwn = msg.senderId === user?.id;
                  const isSystem = msg.senderRole === 'system';

                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <Badge variant="secondary" className="text-xs">
                          {msg.content}
                        </Badge>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2",
                        isOwn ? "flex-row-reverse" : "flex-row"
                      )}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className={cn(
                          "text-xs",
                          isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                        )}>
                          {getInitials(msg.senderName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "max-w-[70%] rounded-lg px-3 py-2",
                        isOwn 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted"
                      )}>
                        {!isOwn && (
                          <p className="text-xs font-medium mb-1 opacity-70">
                            {msg.senderName}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                        <div className={cn(
                          "flex items-center gap-1 mt-1",
                          isOwn ? "justify-end" : "justify-start"
                        )}>
                          <span className="text-xs opacity-70">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                          {isOwn && (
                            <CheckCheck className="h-3 w-3 opacity-70" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex gap-1">
                      <span className="animate-bounce">.</span>
                      <span className="animate-bounce delay-100">.</span>
                      <span className="animate-bounce delay-200">.</span>
                    </div>
                    <span>
                      {typingUsers.map(t => t.userName).join(", ")} está digitando
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem..."
                disabled={sendMessageMutation.isPending}
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!message.trim() || sendMessageMutation.isPending}
                size="icon"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
         </>
      )}

      {/* Rating Modal */}
      {showRatingModal && ratingConversationId && ratingOperatorId && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            setChatState('idle');
            setConversationId(undefined);
            setMessages([]);
            setWaitStartTime(null);
            setWaitTime(0);
            setRatingOperatorId(null);
            setRatingOperatorName('');
            setRatingConversationId(null);
            setTimeout(() => onClose?.(), 500);
          }}
          conversationId={ratingConversationId}
          operatorId={ratingOperatorId}
          operatorName={ratingOperatorName}
          onRatingSubmitted={() => {
            setChatState('idle');
            setConversationId(undefined);
            setMessages([]);
            setWaitStartTime(null);
            setWaitTime(0);
            setRatingOperatorId(null);
            setRatingOperatorName('');
            setRatingConversationId(null);
          }}
        />
      )}
    </div>
  );
}
export default ChatBoxWithQueue;
