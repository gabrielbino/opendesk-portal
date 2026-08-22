import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Circle, Users, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnlineOperatorsProps {
  className?: string;
  compact?: boolean;
  onSelectOperator?: (operatorId: number, operatorName: string) => void;
}

export function OnlineOperators({ className, compact = false, onSelectOperator }: OnlineOperatorsProps) {
  const { user } = useAuth();
  
  // Get online operators
  const { data: onlineOperators, isLoading } = trpc.onlineStatus.getOnlineOperators.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Update own online status
  const updateStatusMutation = trpc.onlineStatus.updateStatus.useMutation();

  // Keep user online while component is mounted
  useEffect(() => {
    if (!user) return;

    // Set online when component mounts
    updateStatusMutation.mutate({
      isOnline: true,
      currentPage: window.location.pathname,
    });

    // Heartbeat every 60 seconds
    const heartbeat = setInterval(() => {
      updateStatusMutation.mutate({
        isOnline: true,
        currentPage: window.location.pathname,
      });
    }, 60000);

    // Set offline when component unmounts
    return () => {
      clearInterval(heartbeat);
      updateStatusMutation.mutate({ isOnline: false });
    };
  }, [user]);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Get status color
  const getStatusColor = (statusMessage?: string) => {
    switch (statusMessage?.toLowerCase()) {
      case 'disponível':
        return 'bg-green-500';
      case 'ocupado':
        return 'bg-yellow-500';
      case 'ausente':
        return 'bg-red-500';
      default:
        return 'bg-green-500';
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex -space-x-2">
          {onlineOperators?.slice(0, 3).map((op) => (
            <Tooltip key={op.userId}>
              <TooltipTrigger asChild>
                <div 
                  className={cn(
                    "relative cursor-pointer",
                    onSelectOperator && "hover:z-10 hover:scale-110 transition-transform"
                  )}
                  onClick={() => onSelectOperator?.(op.userId, op.userName)}
                >
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {getInitials(op.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                    getStatusColor(op.statusMessage)
                  )} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{op.userName}</p>
                <p className="text-xs text-muted-foreground">{op.statusMessage || 'Disponível'}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {onlineOperators && onlineOperators.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{onlineOperators.length - 3}
          </span>
        )}
        {(!onlineOperators || onlineOperators.length === 0) && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Circle className="h-2 w-2 text-muted-foreground" />
            Nenhum operador online
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Headphones className="h-4 w-4" />
          Operadores Online
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-pulse flex gap-2">
              <div className="h-8 w-8 bg-muted rounded-full" />
              <div className="h-8 w-8 bg-muted rounded-full" />
            </div>
          </div>
        ) : onlineOperators && onlineOperators.length > 0 ? (
          <div className="space-y-3">
            {onlineOperators.map((op) => (
              <div 
                key={op.userId}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg",
                  onSelectOperator && "cursor-pointer hover:bg-muted transition-colors"
                )}
                onClick={() => onSelectOperator?.(op.userId, op.userName)}
              >
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/20 text-primary">
                      {getInitials(op.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
                    getStatusColor(op.statusMessage)
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{op.userName}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-600 border-red-300">
                      Admin
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {op.statusMessage || 'Disponível'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Nenhum operador online</p>
            <p className="text-xs">Deixe uma mensagem que responderemos em breve</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OnlineOperators;
