import { Toaster } from "@/components/ui/sonner";
import { ConnectivityStatus } from "@/components/ConnectivityStatus";
import AlertasOverlay from "@/components/AlertasOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PortalDashboard from "./pages/PortalDashboard";
import Perfil from "./pages/Perfil";
import ModulePlaceholder from "./pages/ModulePlaceholder";
import UserManagement from "./pages/UserManagement";
import Projects from "./pages/Projects";
import ProjectsDashboard from "./pages/ProjectsDashboard";
import Announcements from "./pages/Announcements";
import BackupManagement from "./pages/BackupManagement";
import PermissionGroupsManagement from "./pages/PermissionGroupsManagement";
import TicketDashboard from "./pages/TicketDashboard";
import Suppliers from "./pages/Suppliers";
import Products from "./pages/Products";
import PurchasingTasks from "./pages/PurchasingTasks";
import LoadingDemo from "./pages/LoadingDemo";
import LoadingSpinner from "./components/LoadingSpinner";
import { PageTransition } from "./components/PageTransition";
import DailyTasks from "./pages/DailyTasks";
import ItInventory from "./pages/ItInventory";
import Commercial from "./pages/Commercial";
import ComercialAssociativismo from "./pages/ComercialAssociativismo";
import ComercialHub from "./pages/ComercialHub";
import EnvioParcial from "./pages/EnvioParcial";
import Pescador from "./pages/Pescador";
import SuperestocadosDashboard from "./pages/SuperestocadosDashboard";
import SuperestocadosPainelTV from "./pages/SuperestocadosPainelTV";
import MonitorTV from "./pages/MonitorTV";
import MonitorPlaylists from "./pages/MonitorPlaylists";
import Compradores from "./pages/Compradores";
import RupturasDashboard from "./pages/RupturasDashboard";
import RupturasPainelTV from "./pages/RupturasPainelTV";
import GestaoNegocios from "./pages/GestaoNegocios";
import EstoqueHub from "./pages/EstoqueHub";
import ValidadesCurtasDashboard from "./pages/ValidadesCurtasDashboard";
import Indicadores from "./pages/Indicadores";
import IndicadoresPedidosLayout from "./pages/IndicadoresPedidosLayout";
import IndicadoresCortesBi from "./pages/IndicadoresCortesBi";
import IndicadoresVendasBi from "./pages/IndicadoresVendasBi";
import IndicadoresIqviaBi from "./pages/IndicadoresIqviaBi";
import MonitorIntegracoes from "./pages/MonitorIntegracoes";
import VisoesPowerBi from "./pages/VisoesPowerBi";
import Contratos from "./pages/Contratos";
import Repasses from "./pages/Repasses";
import AdminPanel from "./pages/AdminPanel";
import AdminSaude from "./pages/AdminSaude";
import AdminParametros from "./pages/AdminParametros";
import AdminErrorLogs from "./pages/AdminErrorLogs";
import AdminAssinaturasLicencas from "./pages/AdminAssinaturasLicencas";
import { PermissionGuard } from "./components/PermissionGuard";
import AppLayout from "./components/layout/AppLayout";
import { MODULES } from "@shared/permissions";

// Protected Route Component
// `bare` pula a casca global (AppTopbar) — usado nas telas cheias de Modo TV/kiosk.
function ProtectedRoute({ component: Component, bare = false }: { component: React.ComponentType; bare?: boolean }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen size="lg" text="Verificando autenticação..." />;
  }

  if (!isAuthenticated) {
    // Redirect to login page
    return <Redirect to="/login" />;
  }

  const page = (
    <PageTransition>
      <Component />
    </PageTransition>
  );

  return bare ? page : <AppLayout>{page}</AppLayout>;
}

// ─── Componentes wrapper estáveis para evitar remount por arrow function inline ───
// Cada wrapper é um componente nomeado com referência estável (não recria a cada render)

function SuportePage() {
  return <PermissionGuard module={MODULES.SUPORTE}><Dashboard /></PermissionGuard>;
}

function SuporteDashboardPage() {
  return <PermissionGuard module={MODULES.SUPORTE}><TicketDashboard /></PermissionGuard>;
}

function SuporteDetailPage() {
  return <PermissionGuard module={MODULES.SUPORTE}><Dashboard /></PermissionGuard>;
}

function DesenvolvimentoPage() {
  return <PermissionGuard module={MODULES.DESENVOLVIMENTO}><Projects /></PermissionGuard>;
}

function DesenvolvimentoDashboardPage() {
  return <PermissionGuard module={MODULES.DESENVOLVIMENTO}><ProjectsDashboard /></PermissionGuard>;
}

function TarefasDiariasPage() {
  return <PermissionGuard module={MODULES.DESENVOLVIMENTO}><DailyTasks /></PermissionGuard>;
}

function AlmoxarifadoPage() {
  return <PermissionGuard module={MODULES.ALMOXARIFADO}><ItInventory /></PermissionGuard>;
}

function ComercialPage() {
  return <PermissionGuard module={MODULES.COMERCIAL}><Commercial /></PermissionGuard>;
}

function ComercialAssociativismoPage() {
  return <PermissionGuard module={MODULES.COMERCIAL_ASSOCIATIVISMO}><ComercialAssociativismo /></PermissionGuard>;
}

function EnvioParcialPage() {
  return <PermissionGuard module={MODULES.ENVIO_PARCIAL}><EnvioParcial /></PermissionGuard>;
}

function SuperestocadosPage() {
  return <PermissionGuard module={MODULES.SUPERESTOCADOS}><SuperestocadosDashboard /></PermissionGuard>;
}

function SuperestocadosPainelTVPage() {
  return <PermissionGuard module={MODULES.SUPERESTOCADOS}><SuperestocadosPainelTV /></PermissionGuard>;
}

function PescadorPage() {
  return <PermissionGuard module={MODULES.PESCADOR}><Pescador /></PermissionGuard>;
}

function RupturasPage() {
  return <PermissionGuard module={MODULES.RUPTURAS}><RupturasDashboard /></PermissionGuard>;
}

function ValidadesCurtasPage() {
  return <PermissionGuard module={MODULES.VALIDADES_CURTAS}><ValidadesCurtasDashboard /></PermissionGuard>;
}

function MonitorTVPage() {
  return <PermissionGuard module={MODULES.MONITOR_TV}><MonitorTV /></PermissionGuard>;
}

function MonitorPlaylistsPage() {
  return <PermissionGuard module={MODULES.MONITOR_TV}><MonitorPlaylists /></PermissionGuard>;
}

function CompradoresPage() {
  return <PermissionGuard module={MODULES.COMPRADORES}><Compradores /></PermissionGuard>;
}

function RupturasPainelTVPage() {
  return <PermissionGuard module={MODULES.RUPTURAS}><RupturasPainelTV /></PermissionGuard>;
}

function ContratosPage() {
  // Contratos é um hub que se auto-filtra pelos submódulos (Repasses + futuros).
  // O acesso é encapsulado pelos filhos — sem gate próprio (igual /comercial).
  return <Contratos />;
}

function RepassesPage() {
  return <PermissionGuard module={MODULES.REPASSES}><Repasses /></PermissionGuard>;
}

function IndicadoresHubPage() {
  // Indicadores é um hub que se auto-filtra pelos submódulos (Pedidos por Rede + futuros).
  // O acesso é encapsulado pelos filhos — sem gate próprio (igual /comercial, /contratos).
  return <Indicadores />;
}

function IndicadoresPedidosLayoutPage() {
  return <PermissionGuard module={MODULES.INDICADORES_PEDIDOS_LAYOUT}><IndicadoresPedidosLayout /></PermissionGuard>;
}

function MonitorIntegracoesPage() {
  return <PermissionGuard module={MODULES.INDICADORES_MONITOR_ARQUIVOS}><MonitorIntegracoes /></PermissionGuard>;
}

function IndicadoresCortesBiPage() {
  return <PermissionGuard module={MODULES.INDICADORES_CORTES_BI}><IndicadoresCortesBi /></PermissionGuard>;
}

function IndicadoresVendasBiPage() {
  return <PermissionGuard module={MODULES.INDICADORES_VENDAS_BI}><IndicadoresVendasBi /></PermissionGuard>;
}

function IndicadoresIqviaBiPage() {
  return <PermissionGuard module={MODULES.INDICADORES_IQVIA_BI}><IndicadoresIqviaBi /></PermissionGuard>;
}

function VisoesPowerBiPage() {
  // Sub-hub que se auto-filtra pelos submódulos (Cortes/Vendas BI). Sem gate próprio.
  return <VisoesPowerBi />;
}

function RhPlaceholder() {
  return <ModulePlaceholder title="RH" />;
}

function MarketingPlaceholder() {
  return <ModulePlaceholder title="Marketing" />;
}

function TecnologiaPlaceholder() {
  return <ModulePlaceholder title="Tecnologia" />;
}

// ─── Router ───

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen size="lg" text="Verificando autenticação..." />;
  }

  return (
    <Switch>
      {/* Root redirects to Portal if logged in, else show Login page */}
      <Route path="/">
        {isAuthenticated ? <Redirect to="/dashboard" /> : <Login />}
      </Route>
      
      <Route path="/login" component={Login} />
      
      {/* Main Portal Hub */}
      <Route path="/dashboard">
        <ProtectedRoute component={PortalDashboard} />
      </Route>

      {/* Perfil do usuário (auto-serviço) */}
      <Route path="/perfil">
        <ProtectedRoute component={Perfil} />
      </Route>
      
      {/* Help Desk Module */}
      <Route path="/suporte">
        <ProtectedRoute component={SuportePage} />
      </Route>

      {/* Ticket Dashboard - Analytics */}
      <Route path="/suporte/dashboard">
        <ProtectedRoute component={SuporteDashboardPage} />
      </Route>

      {/* Ticket Detail View */}
      <Route path="/suporte/:id">
        <ProtectedRoute component={SuporteDetailPage} />
      </Route>

      {/* Admin Panel - Hub */}
      <Route path="/admin">
        <ProtectedRoute component={AdminPanel} />
      </Route>
      {/* Admin - Submódulos independentes */}
      <Route path="/admin/saude">
        <ProtectedRoute component={AdminSaude} />
      </Route>
      <Route path="/admin/usuarios">
        <ProtectedRoute component={UserManagement} />
      </Route>
      <Route path="/admin/comunicados">
        <ProtectedRoute component={Announcements} />
      </Route>
      <Route path="/admin/backups">
        <ProtectedRoute component={BackupManagement} />
      </Route>
      <Route path="/admin/parametros">
        <ProtectedRoute component={AdminParametros} />
      </Route>
      <Route path="/admin/logs">
        <ProtectedRoute component={AdminErrorLogs} />
      </Route>
      <Route path="/admin/assinaturas">
        <ProtectedRoute component={AdminAssinaturasLicencas} />
      </Route>

      {/* Projects Management */}
      <Route path="/desenvolvimento">
        <ProtectedRoute component={DesenvolvimentoPage} />
      </Route>

      {/* Projects Dashboard */}
      <Route path="/desenvolvimento/dashboard">
        <ProtectedRoute component={DesenvolvimentoDashboardPage} />
      </Route>

      {/* Daily Tasks */}
      <Route path="/desenvolvimento/tarefas-diarias">
        <ProtectedRoute component={TarefasDiariasPage} />
      </Route>

      {/* IT Inventory Management */}
      <Route path="/tecnologia/almoxarifado">
        <ProtectedRoute component={AlmoxarifadoPage} />
      </Route>

      {/* Gestão de Negócios - Página intermediária */}
      <Route path="/negocios">
        <ProtectedRoute component={GestaoNegocios} />
      </Route>

      {/* Controle de Estoque — sub-hub (Superestocados + Rupturas + Validades Curtas) */}
      <Route path="/negocios/estoque">
        <ProtectedRoute component={EstoqueHub} />
      </Route>

      {/* Compradores (compartilhado — estoque) */}
      <Route path="/compradores">
        <ProtectedRoute component={CompradoresPage} />
      </Route>

      {/* Comercial — hub com submódulos (Análise + Envio de Parcial) */}
      <Route path="/comercial">
        <ProtectedRoute component={ComercialHub} />
      </Route>
      <Route path="/comercial/analise">
        <ProtectedRoute component={ComercialPage} />
      </Route>
      <Route path="/comercial/associativismo">
        <ProtectedRoute component={ComercialAssociativismoPage} />
      </Route>
      <Route path="/comercial/envio-parcial">
        <ProtectedRoute component={EnvioParcialPage} />
      </Route>

      {/* Superestocados (submódulo de Gestão de Negócios) */}
      <Route path="/superestocados/painel">
        <ProtectedRoute component={SuperestocadosPainelTVPage} bare />
      </Route>

      {/* Monitor TV — editor de playlists + player que rotaciona os painéis modo TV */}
      <Route path="/monitor/playlists">
        <ProtectedRoute component={MonitorPlaylistsPage} />
      </Route>
      <Route path="/monitor">
        <ProtectedRoute component={MonitorTVPage} bare />
      </Route>
      <Route path="/superestocados">
        <ProtectedRoute component={SuperestocadosPage} />
      </Route>

      {/* Rupturas (submódulo de Gestão de Negócios) - itens em ruptura por marca */}
      <Route path="/rupturas/painel">
        <ProtectedRoute component={RupturasPainelTVPage} bare />
      </Route>
      <Route path="/rupturas">
        <ProtectedRoute component={RupturasPage} />
      </Route>

      {/* Pescador (submódulo de Gestão de Negócios) - painel comercial Clamed SC */}
      <Route path="/pescador">
        <ProtectedRoute component={PescadorPage} />
      </Route>

      {/* Validades Curtas (submódulo de Gestão de Negócios) - itens com vencimento próximo */}
      <Route path="/validades-curtas">
        <ProtectedRoute component={ValidadesCurtasPage} />
      </Route>

      {/* Indicadores - hub com painéis informativos (Pedidos por Rede + futuros) */}
      <Route path="/indicadores">
        <ProtectedRoute component={IndicadoresHubPage} />
      </Route>
      <Route path="/indicadores/pedidos-layout">
        <ProtectedRoute component={IndicadoresPedidosLayoutPage} />
      </Route>
      <Route path="/indicadores/monitor-pedidos">
        <ProtectedRoute component={MonitorIntegracoesPage} />
      </Route>
      {/* Visões Power BI (sub-hub de Indicadores) + relatórios */}
      <Route path="/indicadores/visoes-bi">
        <ProtectedRoute component={VisoesPowerBiPage} />
      </Route>
      <Route path="/indicadores/cortes-bi">
        <ProtectedRoute component={IndicadoresCortesBiPage} />
      </Route>
      <Route path="/indicadores/vendas-bi">
        <ProtectedRoute component={IndicadoresVendasBiPage} />
      </Route>
      <Route path="/indicadores/iqvia-bi">
        <ProtectedRoute component={IndicadoresIqviaBiPage} />
      </Route>

      {/* Contratos (submódulo de Gestão de Negócios) - página intermediária */}
      <Route path="/contratos">
        <ProtectedRoute component={ContratosPage} />
      </Route>

      {/* Repasses (submódulo de Contratos) - dashboard de contratos de repasse */}
      <Route path="/contratos/repasses">
        <ProtectedRoute component={RepassesPage} />
      </Route>

      {/* Rotas legadas redirecionam para submódulos */}
      <Route path="/admin/noticias">
        <Redirect to="/admin/comunicados" />
      </Route>
      
      {/* Admin - Permission Groups Management */}
      <Route path="/grupos-permissoes">
        <ProtectedRoute component={PermissionGroupsManagement} />
      </Route>

      {/* Loading Demo (for development) */}
      <Route path="/loading-demo" component={LoadingDemo} />

      {/* Other Modules Placeholders */}
      <Route path="/modulo/rh">
        <ProtectedRoute component={RhPlaceholder} />
      </Route>
      {/* Purchasing Module - Redirect to Tarefas */}
      <Route path="/compras">
        <Redirect to="/compras/tarefas" />
      </Route>
      <Route path="/compras/fornecedores">
        <ProtectedRoute component={Suppliers} />
      </Route>
      <Route path="/compras/produtos">
        <ProtectedRoute component={Products} />
      </Route>
      <Route path="/compras/tarefas">
        <ProtectedRoute component={PurchasingTasks} />
      </Route>
      <Route path="/modulo/marketing">
        <ProtectedRoute component={MarketingPlaceholder} />
      </Route>
      <Route path="/modulo/tecnologia">
        <ProtectedRoute component={TecnologiaPlaceholder} />
      </Route>
      
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <ConnectivityStatus />
          <AlertasOverlay />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
