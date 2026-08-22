import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MentionUser {
  id: number;
  name: string;
  email?: string;
  role?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange: (mentionIds: number[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  rows?: number;
}

export default function MentionInput({
  value,
  onChange,
  onMentionsChange,
  placeholder = "Digite seu comentário... Use @ para mencionar alguém",
  className,
  disabled = false,
  rows = 3,
}: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Fetch all approved users for mention suggestions
  const { data: allUsers } = trpc.users.list.useQuery(undefined, {
    staleTime: 60000, // Cache for 1 minute
  });

  const filteredUsers = (allUsers || []).filter((user: MentionUser) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      user.name?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term)
    );
  }).slice(0, 8); // Limit to 8 suggestions

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredUsers.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredUsers.length - 1
        );
      } else if (e.key === "Enter" && showSuggestions) {
        e.preventDefault();
        if (filteredUsers[selectedIndex]) {
          insertMention(filteredUsers[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [showSuggestions, filteredUsers, selectedIndex]
  );

  const insertMention = (user: MentionUser) => {
    const beforeMention = value.substring(0, mentionStartPos);
    const afterMention = value.substring(cursorPosition);
    const mentionText = `@${user.name}`;
    const newValue = beforeMention + mentionText + " " + afterMention;

    onChange(newValue);

    // Track mentioned user IDs
    const newMentionIds = [...mentionIds, user.id];
    setMentionIds(newMentionIds);
    onMentionsChange(newMentionIds);

    setShowSuggestions(false);
    setSearchTerm("");
    setMentionStartPos(-1);

    // Focus textarea and set cursor after mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = beforeMention.length + mentionText.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const pos = e.target.selectionStart || 0;
    setCursorPosition(pos);
    onChange(newValue);

    // Check if we're in a mention context
    const textBeforeCursor = newValue.substring(0, pos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex >= 0) {
      // Check that @ is at start or preceded by whitespace
      const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || lastAtIndex === 0) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        // Only show suggestions if no space in the search term (still typing name)
        if (!textAfterAt.includes(" ") || textAfterAt.length <= 30) {
          setMentionStartPos(lastAtIndex);
          setSearchTerm(textAfterAt);
          setShowSuggestions(true);
          setSelectedIndex(0);
          return;
        }
      }
    }

    setShowSuggestions(false);
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset mention IDs when value is cleared
  useEffect(() => {
    if (!value) {
      setMentionIds([]);
      onMentionsChange([]);
    }
  }, [value]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("resize-none", className)}
        disabled={disabled}
        rows={rows}
      />

      {showSuggestions && filteredUsers.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 bottom-full mb-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
        >
          {filteredUsers.map((user: MentionUser, index: number) => (
            <button
              key={user.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer",
                index === selectedIndex && "bg-accent text-accent-foreground"
              )}
              onClick={() => insertMention(user)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="flex flex-col items-start min-w-0">
                <span className="font-medium truncate">{user.name}</span>
                {user.email && (
                  <span className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </span>
                )}
              </div>
              {user.role === "admin" && (
                <span className="ml-auto text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded shrink-0">
                  Admin
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Utility function to render text with highlighted @mentions
 */
export function renderMentionText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const mentionRegex = /@([A-Za-zÀ-ÿ\s]+?)(?=\s@|\s[^@]|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // Add the highlighted mention
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center gap-0.5 bg-primary/10 text-primary font-medium rounded px-1 py-0.5 text-sm"
      >
        @{match[1].trim()}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
