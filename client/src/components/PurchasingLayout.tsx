import { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { Kanban, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PurchasingLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
}

export default function PurchasingLayout({ children, title, description }: PurchasingLayoutProps) {
  const [location, setLocation] = useLocation();

  const navItems = [
    { name: 'Tarefas Diárias', path: '/compras/tarefas', icon: Kanban },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header bar */}
      <header className="sticky top-0 z-40 h-14 border-b border-border bg-card/95 backdrop-blur-md flex items-center px-4 sm:px-6 gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => setLocation('/dashboard')}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Voltar ao Portal</span>
        </Button>
        <div className="h-4 w-px bg-border" />
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">{title}</p>
          {description && <p className="text-xs text-muted-foreground leading-none mt-0.5">{description}</p>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border bg-card hidden sm:flex flex-col p-3 gap-1">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
