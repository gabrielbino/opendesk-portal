import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Download,
  History,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  Send,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";

type RegionKey = "SC" | "RS";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type SessionItem = {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type Props = {
  region: RegionKey;
};

export default function SuperestocadosAIChat({ region }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // tRPC hooks
  const chatMutation = trpc.superestocadosAI.chat.useMutation();
  const insightsQuery = trpc.superestocadosAI.getProactiveInsights.useQuery(
    { region },
    { enabled: isOpen && messages.length === 0 && !sessionId }
  );
  const sessionsQuery = trpc.superestocadosAI.listSessions.useQuery(
    { region },
    { enabled: isOpen && showHistory }
  );
  const exportMutation = trpc.superestocadosAI.exportSession.useMutation();
  const utils = trpc.useUtils();

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load proactive insights when chat opens for the first time
  useEffect(() => {
    if (isOpen && messages.length === 0 && !sessionId && insightsQuery.data) {
      setMessages([{
        role: "assistant",
        content: insightsQuery.data.insights,
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen, insightsQuery.data, messages.length, sessionId]);

  // Reset when region changes
  useEffect(() => {
    setMessages([]);
    setSessionId(null);
    setShowHistory(false);
  }, [region]);

  function handleOpen() {
    setIsOpen(true);
    setIsMinimized(false);
  }

  function handleClose() {
    setIsOpen(false);
    setIsMinimized(false);
  }

  function handleNewChat() {
    setMessages([]);
    setSessionId(null);
    setShowHistory(false);
    setIsLoadingInsights(true);
    // Insights will reload via the query
    insightsQuery.refetch().then(() => setIsLoadingInsights(false));
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const result = await chatMutation.mutateAsync({
        region,
        message: trimmed,
        sessionId: sessionId ?? undefined,
      });

      setSessionId(result.sessionId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response, timestamp: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Ocorreu um erro ao processar sua mensagem. Tente novamente.",
          timestamp: Date.now(),
        },
      ]);
    }
  }

  async function handleLoadSession(id: number) {
    try {
      const sessionData = await utils.superestocadosAI.getSession.fetch({ sessionId: id });
      setSessionId(sessionData.id);
      setMessages(sessionData.messages);
      setShowHistory(false);
    } catch {
      // Fallback: just set the session ID and let user continue
      setSessionId(id);
      setShowHistory(false);
    }
  }

  async function handleExport() {
    if (!sessionId) return;
    try {
      const result = await exportMutation.mutateAsync({ sessionId });
      // Decode base64 to binary bytes preserving UTF-8
      const binaryStr = atob(result.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      // Add UTF-8 BOM so text editors recognize encoding correctly
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, bytes], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // FAB button (when closed)
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-xl transition-all hover:bg-slate-700 hover:scale-105 active:scale-95"
        title="Assistente de Superestocados"
      >
        <MessageSquareText className="h-5 w-5" />
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-slate-800 px-4 text-white shadow-xl transition-all hover:bg-slate-700"
      >
        <MessageSquareText className="h-4 w-4" />
        <span className="text-sm font-medium">Assistente</span>
      </button>
    );
  }

  // Chat panel (open)
  return (
    <div className="fixed inset-4 z-40 flex flex-col rounded-xl border border-border bg-card shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] sm:h-[600px] sm:max-h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Assistente</h3>
            <p className="text-[10px] text-muted-foreground">Região {region}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {sessionId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleExport}
              disabled={exportMutation.isPending}
              title="Exportar conversa"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowHistory(!showHistory)}
            title="Histórico de conversas"
          >
            <History className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="Nova conversa"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized(true)}
            title="Minimizar"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleClose}
            title="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Retention notice */}
      <div className="border-b bg-muted/50 px-4 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          Histórico de conversas salvo por 2 dias.
        </p>
      </div>

      {/* Content area */}
      {showHistory ? (
        <HistoryPanel
          sessions={sessionsQuery.data ?? []}
          isLoading={sessionsQuery.isLoading}
          onSelect={handleLoadSession}
          onClose={() => setShowHistory(false)}
        />
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-hidden min-h-0" style={{ height: "clamp(240px, 50vh, 400px)" }}>
            <ScrollArea className="h-full">
              <div className="flex flex-col space-y-3 p-4">
                {messages.length === 0 && (insightsQuery.isLoading || isLoadingInsights) && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Analisando dados da região...</span>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1.5 [&_li]:mb-0.5 [&_ul]:mb-1.5 [&_ol]:mb-1.5">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {chatMutation.isPending && (
                  <div className="flex items-start gap-2">
                    <div className="rounded-lg bg-muted px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2 border-t p-3"
          >
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre os produtos..."
              className="flex-1 max-h-24 resize-none min-h-9 text-sm"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || chatMutation.isPending}
              className="shrink-0 h-9 w-9"
            >
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

/* ─── History Panel ─── */

function HistoryPanel({
  sessions,
  isLoading,
  onSelect,
  onClose,
}: {
  sessions: SessionItem[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col" style={{ height: "400px" }}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium text-foreground">Conversas recentes</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClose}>
          Voltar
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Nenhuma conversa nos últimos 2 dias.
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s.id)}
                className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
              >
                <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(s.updatedAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
