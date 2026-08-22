import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, Clock, TrendingUp, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const STATUS_COLORS: Record<string, string> = {
  'Novos': '#3b82f6',
  'Em Andamento': '#f59e0b',
  'Pendente Cliente': '#8b5cf6',
  'Em Análise': '#10b981',
  'Pendente ERP': '#f97316',
};

const PRIORITY_COLORS: Record<string, string> = {
  'Baixa': '#10b981',
  'Média': '#f59e0b',
  'Alta': '#ef4444',
  'Crítica': '#7c3aed',
};

export default function TicketDashboard() {
  const [, setLocation] = useLocation();
  const { data: metrics, isLoading, error } = trpc.tickets.dashboardMetrics.useQuery();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              Erro ao carregar dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-600">{error?.message || 'Ocorreu um erro ao carregar as métricas'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Dashboard de Chamados</h1>
          <p className="text-muted-foreground mt-1 text-sm">Acompanhamento em tempo real do status e performance dos chamados</p>
        </div>
        <button
          onClick={() => setLocation('/suporte')}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition text-sm w-fit"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Voltar aos Chamados</span>
          <span className="sm:hidden">Voltar</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Chamados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{metrics.totalTickets}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.recentTickets} nos últimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tempo Médio de Resposta</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6 text-blue-500" />
              {metrics.responseTime.average}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Min: {metrics.responseTime.min}h | Max: {metrics.responseTime.max}h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Chamados Novos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-500">
              {metrics.statusCounts.find(s => s.status === 'Novos')?.count || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Aguardando atendimento
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Análise (30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {metrics.monthlyTickets}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Últimos 30 dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="status" className="text-xs sm:text-sm">Status</TabsTrigger>
          <TabsTrigger value="category" className="text-xs sm:text-sm">Assuntos</TabsTrigger>
          <TabsTrigger value="trend" className="text-xs sm:text-sm">Tendência</TabsTrigger>
          <TabsTrigger value="resolution" className="text-xs sm:text-sm">Resolução</TabsTrigger>
        </TabsList>

        {/* Status Distribution */}
        <TabsContent value="status" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Status</CardTitle>
                <CardDescription>Quantidade de chamados por status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.statusCounts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                      {metrics.statusCounts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Proporção por Status</CardTitle>
                <CardDescription>Percentual de chamados por status</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.statusCounts}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ status, count }) => `${status}: ${count}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {metrics.statusCounts.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Priority Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribuição por Prioridade</CardTitle>
              <CardDescription>Quantidade de chamados por nível de prioridade</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.priorityCounts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="priority" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                    {metrics.priorityCounts.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.priority] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Category/Subject Distribution */}
        <TabsContent value="category" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuição por Assunto</CardTitle>
                <CardDescription>Quantidade de chamados por tipo de assunto</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics.categoryCounts}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                      {metrics.categoryCounts.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Proporção por Assunto</CardTitle>
                <CardDescription>Percentual de chamados por tipo de assunto</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.categoryCounts}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ category, count }) => `${category}: ${count}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {metrics.categoryCounts.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Department Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Chamados por Departamento</CardTitle>
              <CardDescription>Volume de chamados por departamento</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics.departmentCounts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="departmentName" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 8, 8, 0]}>
                    {metrics.departmentCounts.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trend Analysis */}
        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tendência de Chamados (30 dias)</CardTitle>
              <CardDescription>Evolução diária de chamados abertos e fechados</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={metrics.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    interval={Math.floor(metrics.dailyTrend.length / 7)}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="opened" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    name="Novos"
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="closed" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    name="Em Análise"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resolution Time by Category */}
        <TabsContent value="resolution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tempo Médio de Resolução por Assunto</CardTitle>
              <CardDescription>Horas médias para resolver chamados por categoria</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={metrics.avgResolutionByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" angle={-45} textAnchor="end" height={80} />
                  <YAxis label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => `${value}h`} />
                  <Bar dataKey="avgHours" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                    {metrics.avgResolutionByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Resolution Stats Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detalhes de Resolução</CardTitle>
              <CardDescription>Estatísticas detalhadas por categoria</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4 font-semibold">Assunto</th>
                      <th className="text-right py-2 px-4 font-semibold">Tempo Médio</th>
                      <th className="text-right py-2 px-4 font-semibold">Chamados em Análise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.avgResolutionByCategory.map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-4">{item.category}</td>
                        <td className="text-right py-2 px-4 font-medium">{item.avgHours} horas</td>
                        <td className="text-right py-2 px-4">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
