import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

interface ProjectCommentsProps {
  projectId: number;
}

export default function ProjectComments({ projectId }: ProjectCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [mentions, setMentions] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: comments = [] } = trpc.projectComments.listByProject.useQuery({ projectId });
  const { data: users = [] } = trpc.users.list.useQuery();

  const createMutation = trpc.projectComments.create.useMutation({
    onSuccess: () => {
      utils.projectComments.listByProject.invalidate({ projectId });
      setNewComment("");
      setMentions([]);
      toast.success("Comentário adicionado");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao adicionar comentário");
    },
  });

  const deleteMutation = trpc.projectComments.delete.useMutation({
    onSuccess: () => {
      utils.projectComments.listByProject.invalidate({ projectId });
      toast.success("Comentário removido");
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao remover comentário");
    },
  });

  // Filter users based on mention search
  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  // Handle textarea change and detect @ mentions
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's no space after @
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        setSelectedMentionIndex(0);

        // Calculate position for mention dropdown
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const rect = textarea.getBoundingClientRect();
          setMentionPosition({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
          });
        }
        return;
      }
    }

    setShowMentions(false);
  };

  // Handle mention selection
  const selectMention = (userId: number, userName: string) => {
    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = newComment.slice(0, cursorPosition);
    const textAfterCursor = newComment.slice(cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    const newText =
      newComment.slice(0, lastAtIndex) + `@${userName} ` + textAfterCursor;
    setNewComment(newText);
    setShowMentions(false);

    // Add to mentions array if not already there
    if (!mentions.includes(userId)) {
      setMentions([...mentions, userId]);
    }

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newCursorPos = lastAtIndex + userName.length + 2;
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  // Handle keyboard navigation in mention dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedMentionIndex((prev) =>
        prev < filteredUsers.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedMentionIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter" && filteredUsers.length > 0) {
      e.preventDefault();
      const selectedUser = filteredUsers[selectedMentionIndex];
      selectMention(selectedUser.id, selectedUser.name);
    } else if (e.key === "Escape") {
      setShowMentions(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    createMutation.mutate({
      projectId,
      content: newComment,
      mentions: mentions.length > 0 ? mentions : undefined,
    });
  };

  const handleDelete = (commentId: number) => {
    if (confirm("Deseja realmente excluir este comentário?")) {
      deleteMutation.mutate({ id: commentId });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Render comment content with highlighted mentions
  const renderCommentContent = (content: string, commentMentions: string | null) => {
    if (!commentMentions) return content;

    try {
      const mentionedUserIds = JSON.parse(commentMentions) as number[];
      let renderedContent = content;

      mentionedUserIds.forEach((userId) => {
        const mentionedUser = users.find((u) => u.id === userId);
        if (mentionedUser) {
          const regex = new RegExp(`@${mentionedUser.name}`, "g");
          renderedContent = renderedContent.replace(
            regex,
            `<span class="bg-blue-100 text-blue-700 px-1 rounded font-medium">@${mentionedUser.name}</span>`
          );
        }
      });

      return <span dangerouslySetInnerHTML={{ __html: renderedContent }} />;
    } catch {
      return content;
    }
  };

  return (
    <div className="space-y-4 relative">
      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            placeholder="Adicione um comentário... (use @ para mencionar alguém)"
            value={newComment}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            className="min-h-[80px]"
          />

          {/* Mention Dropdown */}
          {showMentions && filteredUsers.length > 0 && (
            <div className="absolute z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {filteredUsers.map((u, index) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => selectMention(u.id, u.name)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 flex items-center gap-2 ${
                    index === selectedMentionIndex ? "bg-gray-100" : ""
                  }`}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-blue-500 text-white text-xs">
                      {getInitials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!newComment.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Enviando..." : "Comentar"}
          </Button>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-4 mt-6">
        {comments.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">Nenhum comentário ainda</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 p-4 bg-gray-50 rounded-lg">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-blue-500 text-white text-sm">
                  {getInitials(comment.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{comment.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(comment.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {user && user.id === comment.authorId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(comment.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {renderCommentContent(comment.content, comment.mentions)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
