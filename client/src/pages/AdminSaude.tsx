import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity, Database, Server, Users, Shield, CheckCircle, XCircle,
  RefreshCw, MemoryStick, TrendingUp
} from "lucide-react";
import SubmodulePage from "@/components/templates/SubmodulePage";
import KpiCard from "@/components/templates/KpiCard";

export default function AdminSaude() {
  const { data: health, isLoading, refetch } = trpc.admin.getSystemHealth.useQuery(undefined, {
    refetchInterval: 30000,
  });

  return (
    <SubmodulePage
      title="Saúde do Sistema"
      subtitle="Monitoramento de performance e integridade"
      icon={<Activity size={20} />}
      iconGradient="from-emerald-500 to-emerald-600"
      backPath="/admin"
      backLabel="Administração"
      headerActions={
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      }
    >
      {isLoading || !health ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <KpiCard key={i} title="" value="" loading />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs Principais com Drill-Down */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Banco de Dados"
              value={health.database.sizeMb}
              unit="MB"
              icon={<Database size={20} />}
              iconColor="text-blue-500"
              tooltip="Tamanho total do banco incluindo dados e indices. Monitorar para evitar limites de armazenamento."
              sublabel={`${health.database.totalTables} tabelas | ${Number(health.database.totalRows || 0).toLocaleString('pt-BR')} linhas`}
              drillDown={
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Top 5 maiores tabelas:</p>
                  {health.topTables.slice(0, 5).map((t: any, i: number) => (
                    <div key={t.name} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground truncate max-w-[140px]">
                        {i + 1}. {t.name}
                      </span>
                      <span className="text-foreground font-medium">{t.sizeMb} MB</span>
                    </div>
                  ))}
                </div>
              }
            />

            <KpiCard
              title="Usuarios Online"
              value={health.users.onlineNow}
              icon={<Users size={20} />}
              iconColor="text-green-500"
              tooltip="Usuários com atividade nos últimos 2 minutos. Atualizado automaticamente a cada 30 segundos."
              sublabel={`${health.users.last24h} nas ultimas 24h`}
              drillDown={
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold">{health.users.total}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold">{health.users.last7d}</p>
                    <p className="text-[10px] text-muted-foreground">7 dias</p>
                  </div>
                </div>
              }
            />

            <KpiCard
              title="Uptime"
              value={health.server.uptimeFormatted}
              icon={<Server size={20} />}
              iconColor="text-purple-500"
              tooltip="Tempo desde a ultima reinicializacao do servidor. Reinicializacoes frequentes podem indicar instabilidade."
              sublabel={`Node ${health.server.nodeVersion}`}
            />

            <KpiCard
              title="Memoria"
              value={health.server.memoryUsageMb}
              unit="MB"
              icon={<MemoryStick size={20} />}
              iconColor="text-amber-500"
              tooltip="Memoria heap utilizada pelo processo Node.js. Valores acima de 80% do total alocado merecem atencao."
              sublabel={`de ${health.server.memoryTotalMb} MB alocados`}
              sublabelColor={
                health.server.memoryUsageMb / health.server.memoryTotalMb > 0.8
                  ? "text-red-600"
                  : "text-muted-foreground"
              }
            />
          </div>

          {/* Validacao de Nomenclatura */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Validacao de Nomenclatura
                  </CardTitle>
                  <CardDescription>Conformidade das tabelas com o padrao snake_case + prefixo de modulo</CardDescription>
                </div>
                <Badge variant={health.naming.violations.length === 0 ? "default" : "destructive"}>
                  {health.naming.conforme}/{health.naming.total} conformes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {health.naming.violations.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm">Todas as tabelas estao em conformidade com o padrao!</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {health.naming.violations.map((v: any) => (
                    <div key={v.name} className="flex items-center gap-2 text-red-600 text-sm">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span className="font-mono">{v.name}</span>
                      <span className="text-muted-foreground">— {v.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modulos e Tabelas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Resumo por Modulo */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Modulos do Sistema</CardTitle>
                <CardDescription>Distribuicao de tabelas por modulo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {health.modules.map((m: any) => (
                    <div key={m.prefix} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{m.prefix}</Badge>
                        <span className="text-sm capitalize">{m.module.replace(/_/g, " ")}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{m.count} tabela(s)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Tabelas por Tamanho */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Maiores Tabelas</CardTitle>
                    <CardDescription>Por tamanho em disco</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => refetch()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {health.topTables.slice(0, 10).map((t: any, i: number) => (
                    <div key={t.name} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}.</span>
                        <span className="text-sm font-mono truncate max-w-[200px]">{t.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground">{t.rowsCount.toLocaleString("pt-BR")} linhas</span>
                        <Badge variant="secondary">{t.sizeMb} MB</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Atividade de Usuarios */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Atividade de Usuarios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{health.users.total}</p>
                  <p className="text-xs text-muted-foreground">Total cadastrados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-500/5">
                  <p className="text-2xl font-bold text-green-600">{health.users.onlineNow}</p>
                  <p className="text-xs text-muted-foreground">Online agora</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/5">
                  <p className="text-2xl font-bold text-blue-600">{health.users.last24h}</p>
                  <p className="text-xs text-muted-foreground">Ultimas 24h</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-500/5">
                  <p className="text-2xl font-bold text-purple-600">{health.users.last7d}</p>
                  <p className="text-xs text-muted-foreground">Ultimos 7 dias</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </SubmodulePage>
  );
}
