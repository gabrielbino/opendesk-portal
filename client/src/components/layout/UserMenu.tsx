import { useLocation } from "wouter";
import { ChevronDown, LogOut, Moon, UserCircle } from "lucide-react";

import { useAuth } from "@/_core/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Iniciais (até 2) para o fallback do avatar. */
function iniciais(nome?: string | null): string {
  if (!nome) return "U";
  const ini = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return ini || "U";
}

const emBreve = (
  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
    em breve
  </span>
);

/**
 * Menu do usuário (canto direito do topbar): avatar + nome como gatilho de um dropdown com perfil,
 * tema e sair. Reutilizável — usado pelo AppTopbar. "Meu perfil" e "Tema escuro" ficam desabilitados
 * até chegarem (Fase 2 = página /perfil; Fase 3 = tema dark). "Sair" já é funcional.
 */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const { switchable, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const nome = user?.name ?? "Usuário";
  const avatarUrl = (user as { avatarUrl?: string | null } | null)?.avatarUrl ?? undefined;

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };

  const avatar = (size: string) => (
    <Avatar className={size}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={nome} />}
      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-xs font-semibold text-white">
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Abrir menu do usuário"
        >
          {avatar("h-7 w-7")}
          <span className="hidden max-w-[140px] truncate text-foreground lg:block">{nome}</span>
          <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 py-2 font-normal">
          {avatar("h-9 w-9")}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{nome}</p>
            {user?.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => setLocation("/perfil")}>
          <UserCircle className="mr-2 h-4 w-4" />
          Meu perfil
        </DropdownMenuItem>

        <DropdownMenuItem disabled={!switchable} onClick={switchable ? toggleTheme : undefined}>
          <Moon className="mr-2 h-4 w-4" />
          Tema escuro
          {!switchable && emBreve}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
