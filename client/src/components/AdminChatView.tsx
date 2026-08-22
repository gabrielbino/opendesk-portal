import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Send, 
  X, 
  MessageCircle, 
  Loader2, 
  CheckCheck,
  Minimize2,
  User,
  Clock,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface AdminChatViewProps {
  conversationId: number;
  queueId?: number;
  userName?: string;
  onClose: () => void;
  onComplete?: () => void;
  className?: string;
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

export function AdminChatView({ 
  conversationId,
  queueId,
  userName,
  onClose,
  onComplete,
  className
}: AdminChatViewProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ userId: number; userName: string }[]>([]);
  const [lastMessageTimestamp, setLastMessageTimestamp] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get messages
  const { data: initialMessages, isLoading: loadingMessages } = trpc.chat.getMessages.useQuery(
    { conversationId, limit: 50 },
    { enabled: !!conversationId }
  );

  // Poll for new messages
  const { data: newMessages } = trpc.chat.getNewMessages.useQuery(
    { conversationId, afterTimestamp: lastMessageTimestamp },
    { 
      enabled: !!conversationId && lastMessageTimestamp > 0,
      refetchInterval: 2000,
    }
  );

  // Poll for typing users
  const { data: typingData } = trpc.chat.getTypingUsers.useQuery(
    { conversationId },
    { 
      enabled: !!conversationId,
      refetchInterval: 2000,
    }
  );

  // Mutations
  const sendMessageMutation = trpc.chat.sendMessage.useMutation();
  const updateTypingMutation = trpc.chat.updateTyping.useMutation();
  const markAsReadMutation = trpc.chat.markAsRead.useMutation();
  const completeChatMutation = trpc.chatQueue.completeChat.useMutation();

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
    if (conversationId) {
      markAsReadMutation.mutate({ conversationId });
    }
  }, [conversationId]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (!conversationId) return;

    if (!isTyping) {
      setIsTyping(true);
      updateTypingMutation.mutate({ conversationId, isTyping: true });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      updateTypingMutation.mutate({ conversationId, isTyping: false });
    }, 3000);
  }, [conversationId, isTyping, updateTypingMutation]);

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !user || !conversationId) return;

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

  // Complete chat
  const handleCompleteChat = () => {
    if (!queueId) return;
    
    completeChatMutation.mutate({ queueId }, {
      onSuccess: () => {
        toast.success("Atendimento finalizado com sucesso!");
        onComplete?.();
        onClose();
      },
      onError: (error) => {
        toast.error("Erro ao finalizar atendimento: " + error.message);
      },
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return format(date, "HH:mm", { locale: ptBR });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 w-full max-w-[420px] bg-background border rounded-lg shadow-xl flex flex-col",
      "max-h-[600px]",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-green-600 text-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="h-8 w-8 border-2 border-white/30">
              <AvatarFallback className="bg-white/20 text-foreground text-xs">
                {userName ? getInitials(userName) : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-green-600" />
          </div>
          <div>
            <span className="font-semibold text-sm">{userName || "Usuário"}</span>
            <p className="text-xs text-muted-foreground">Atendimento em andamento</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {queueId && (
            <Button 
              variant="ghost" 
              size="sm"
              className="h-8 text-foreground hover:bg-accent text-xs"
              onClick={handleCompleteChat}
              disabled={completeChatMutation.isPending}
            >
              {completeChatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Finalizar
                </>
              )}
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-foreground hover:bg-accent"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-3 min-h-[350px] max-h-[450px]">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
            <p>Nenhuma mensagem ainda</p>
            <p className="text-sm">Envie uma mensagem para começar o atendimento</p>
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
                      isOwn ? "bg-green-600 text-white" : "bg-blue-100 text-blue-700"
                    )}>
                      {getInitials(msg.senderName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "max-w-[70%] rounded-lg px-3 py-2",
                    isOwn 
                      ? "bg-green-600 text-white" 
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
                  <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>.</span>
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
            placeholder="Digite sua resposta..."
            disabled={sendMessageMutation.isPending}
          />
          <Button 
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
            size="icon"
            className="bg-green-600 hover:bg-green-700"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AdminChatView;
