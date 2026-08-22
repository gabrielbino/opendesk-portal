import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Database, Download, RefreshCw, CheckCircle, XCircle, Clock, HardDrive, Github, GitCommit, RotateCcw, ExternalLink } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import SubmodulePage from "@/components/templates/SubmodulePage";
import KpiCard from "@/components/templates/KpiCard";

export default function BackupManagement() {
  const [restoreBackupId, setRestoreBackupId] = useState<number | null>(null);
  const [restoreGitHubSha, setRestoreGitHubSha] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // S3 Backups
  const { data: backups = [], isLoading, refetch } = (trpc as any).backups.list.useQuery();
  
  // GitHub Backups
  const { data: githubCommits = [], isLoading: isLoadingGitHub, refetch: refetchGitHub } = 
    (trpc as any).backups.listGitHubBackups.useQuery(undefined, {
      retry: 1,
      onError: (error: any) => {
        console.error('Error loading GitHub backups:', error);
      },
    });

  const createBackupMutation = (trpc as any).backups.create.useMutation({
    onSuccess: () => {
      toast.success("Backup criado com sucesso!");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar backup: ${error.message}`);
    },
  });

  const githubBackupMutation = (trpc as any).backups.pushToGitHub.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Backup enviado ao GitHub com sucesso! ${data.recordCount ? `(${data.recordCount} registros)` : ''}`);
      refetchGitHub();
    },
    onError: (error: any) => {
      toast.error(`Erro ao enviar backup ao GitHub: ${error.message}`);
    },
  });

  const restoreBackupMutation = (trpc as any).backups.restore.useMutation({
    onSuccess: () => {
      toast.success("Backup restaurado com sucesso! Recarregando pagina...");
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: any) => {
      toast.error(`Erro ao restaurar backup: ${error.message}`);
    },
  });

  const restoreFromGitHubMutation = (trpc as any).backups.restoreFromGitHub.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Restauracao do GitHub concluida! ${data.totalRecords ? `(${data.totalRecords} registros)` : ''} Recarregando...`);
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error: any) => {
      toast.error(`Erro ao restaurar do GitHub: ${error.message}`);
    },
  });

  const verifyBackupQuery = (trpc as any).backups.verify.useQuery(
    { id: verifyingId! },
    { 
      enabled: verifyingId !== null,
      onSuccess: (data: any) => {
        if (data.valid) {
          toast.success("Backup verificado: integridade confirmada!");
        } else {
          toast.error(`Backup corrompido: ${data.error}`);
        }
        setVerifyingId(null);
      },
      onError: (error: any) => {
        toast.error(`Erro ao verificar backup: ${error.message}`);
        setVerifyingId(null);
      },
    }
  );

  const handleCreateBackup = () => {
    createBackupMutation.mutate();
  };

  const handleGitHubBackup = () => {
    githubBackupMutation.mutate();
  };

  const handleVerifyBackup = (id: number) => {
    setVerifyingId(id);
  };

  const handleRestoreBackup = (id: number) => {
    setRestoreBackupId(id);
  };

  const handleRestoreFromGitHub = (sha: string) => {
    setRestoreGitHubSha(sha);
  };

  const confirmRestore = () => {
    if (restoreBackupId) {
      restoreBackupMutation.mutate({ id: restoreBackupId });
      setRestoreBackupId(null);
    }
  };

  const confirmGitHubRestore = () => {
    if (restoreGitHubSha) {
      restoreFromGitHubMutation.mutate({ sha: restoreGitHubSha });
      setRestoreGitHubSha(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const githubBackupsWithData = githubCommits.filter((c: any) => c.hasBackupData);

  return (
    <SubmodulePage
      title="Backups"
      subtitle="Backups automáticos diários com rotação de 7 dias + GitHub"
      icon={<HardDrive size={20} />}
      iconGradient="from-amber-500 to-amber-600"
      backPath="/admin"
      backLabel="Administração"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { refetch(); refetchGitHub(); }}
            disabled={isLoading || isLoadingGitHub}
          >
            <RefreshCw className={`h-4 w-4 ${(isLoading || isLoadingGitHub) ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGitHubBackup}
            disabled={githubBackupMutation.isPending}
          >
            <Github className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">{githubBackupMutation.isPending ? "Enviando..." : "GitHub"}</span>
          </Button>
          <Button
            size="sm"
            onClick={handleCreateBackup}
            disabled={createBackupMutation.isPending}
          >
            <Database className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">{createBackupMutation.isPending ? "Criando..." : "Backup S3"}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Backups S3"
            value={backups.length}
            icon={<Database size={20} />}
            iconColor="text-blue-500"
            tooltip="Quantidade de backups disponíveis no armazenamento S3. Rotação automática de 7 dias."
            sublabel="Disponíveis para restauração"
          />
          <KpiCard
            title="Último Backup S3"
            value={
              backups.length > 0
                ? format(backups[0].createdAt, "dd/MM HH:mm", { locale: ptBR })
                : "Nenhum"
            }
            icon={<Clock size={20} />}
            iconColor="text-emerald-500"
            tooltip="Data e hora do backup S3 mais recente. Backups automáticos ocorrem às 2h da manhã."
            sublabel={backups.length > 0 ? `Por ${backups[0].createdBy}` : "Crie o primeiro backup"}
          />
          <KpiCard
            title="Backups GitHub"
            value={githubBackupsWithData.length}
            icon={<Github size={20} />}
            iconColor="text-gray-700"
            tooltip="Commits no repositório GitHub que contêm dados de backup restauráveis."
            sublabel="Commits com dados de backup"
          />
          <KpiCard
            title="Espaco S3"
            value={formatFileSize(backups.reduce((sum: number, b: any) => sum + b.fileSize, 0))}
            icon={<HardDrive size={20} />}
            iconColor="text-amber-500"
            tooltip="Espaço total utilizado pelos backups no armazenamento S3."
            sublabel="Total em armazenamento"
          />
        </div>

        {/* Tabs: S3 Backups / GitHub Backups */}
        <Tabs defaultValue="s3" className="space-y-4">
          <TabsList>
            <TabsTrigger value="s3">
              <Database className="h-4 w-4 mr-2" />
              S3
            </TabsTrigger>
            <TabsTrigger value="github">
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </TabsTrigger>
          </TabsList>

          {/* S3 Backups Tab */}
          <TabsContent value="s3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Histórico de Backups (S3)</CardTitle>
                <CardDescription>
                  Backups criados automaticamente às 2h da manhã, mantidos por 7 dias
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando backups...</div>
                ) : backups.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Nenhum backup disponível</p>
                    <p className="text-sm mt-1">Crie o primeiro backup manualmente</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {backups.map((backup: any) => (
                      <div
                        key={backup.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <h4 className="font-medium text-sm text-foreground truncate">{backup.filename}</h4>
                            <Badge
                              variant={backup.status === "completed" ? "default" : "destructive"}
                              className={`text-xs ${backup.status === "completed" ? "bg-green-600" : ""}`}
                            >
                              {backup.status === "completed" ? (
                                <><CheckCircle className="h-3 w-3 mr-1" />OK</>
                              ) : (
                                <><XCircle className="h-3 w-3 mr-1" />Falhou</>
                              )}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>{format(backup.createdAt, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                            <span className="hidden sm:inline">|</span>
                            <span>{formatFileSize(backup.fileSize)}</span>
                            <span className="hidden sm:inline">|</span>
                            <span>{backup.recordCount.toLocaleString('pt-BR')} registros</span>
                            <span className="hidden sm:inline">|</span>
                            <span>Por {backup.createdBy}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleVerifyBackup(backup.id)}
                            disabled={verifyingId === backup.id}
                            className="text-xs h-8"
                          >
                            {verifyingId === backup.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                            <span className="ml-1 hidden sm:inline">Verificar</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(backup.s3Url, '_blank')}
                            className="text-xs h-8"
                          >
                            <Download className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">Download</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRestoreBackup(backup.id)}
                            disabled={restoreBackupMutation.isPending}
                            className="text-xs h-8 text-destructive hover:text-destructive"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">Restaurar</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* GitHub Backups Tab */}
          <TabsContent value="github">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      Backups no GitHub
                    </CardTitle>
                    <CardDescription>
                      Restaure dados a partir de commits no repositório{" "}
                      <a 
                        href="https://github.com/opendesktecnologia/CHAMADOS" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                      >
                        opendesktecnologia/CHAMADOS
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => refetchGitHub()}
                    variant="ghost"
                    size="sm"
                    disabled={isLoadingGitHub}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingGitHub ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingGitHub ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin opacity-30" />
                    <p>Carregando commits do GitHub...</p>
                  </div>
                ) : githubCommits.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Github className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Nenhum commit encontrado</p>
                    <p className="text-sm mt-1">Faça o primeiro backup para o GitHub</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {githubCommits.map((commit: any) => (
                      <div
                        key={commit.sha}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg transition-colors gap-3 ${
                          commit.hasBackupData 
                            ? 'hover:bg-muted/30 border-border' 
                            : 'bg-muted/20 border-border/50 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <GitCommit className="h-4 w-4 text-muted-foreground shrink-0" />
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                              {commit.sha.substring(0, 7)}
                            </code>
                            <span className="font-medium text-sm text-foreground truncate">{commit.message}</span>
                            {commit.hasBackupData ? (
                              <Badge className="bg-green-600 text-xs shrink-0">
                                <Database className="h-3 w-3 mr-1" />
                                Com dados
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs shrink-0">
                                Sem dados
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap ml-6">
                            <span>{format(new Date(commit.date), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}</span>
                            <span className="hidden sm:inline">|</span>
                            <span>{formatDistanceToNow(new Date(commit.date), { addSuffix: true, locale: ptBR })}</span>
                            <span className="hidden sm:inline">|</span>
                            <span>Por {commit.author}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`https://github.com/opendesktecnologia/CHAMADOS/commit/${commit.sha}`, '_blank')}
                            className="text-xs h-8"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span className="ml-1 hidden sm:inline">Ver</span>
                          </Button>
                          {commit.hasBackupData && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestoreFromGitHub(commit.sha)}
                              disabled={restoreFromGitHubMutation.isPending}
                              className="text-xs h-8 text-destructive hover:text-destructive"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span className="ml-1 hidden sm:inline">Restaurar</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* S3 Restore Confirmation Dialog */}
      <AlertDialog open={restoreBackupId !== null} onOpenChange={() => setRestoreBackupId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Restauração de Backup (S3)</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-red-600">ATENÇÃO:</strong> Esta ação irá substituir TODOS os dados atuais
              pelos dados do backup selecionado. Esta operação não pode ser desfeita.
              <br /><br />
              Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestore}
              className="bg-red-600 hover:bg-red-700"
            >
              Sim, Restaurar Backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* GitHub Restore Confirmation Dialog */}
      <AlertDialog open={restoreGitHubSha !== null} onOpenChange={() => setRestoreGitHubSha(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Confirmar Restauração do GitHub
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-red-600">ATENÇÃO:</strong> Esta ação irá baixar os dados do commit{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-sm">
                {restoreGitHubSha?.substring(0, 7)}
              </code>{" "}
              do repositório GitHub e substituir TODOS os dados atuais do banco de dados.
              <br /><br />
              Esta operação não pode ser desfeita. Recomendamos criar um backup S3 antes de prosseguir.
              <br /><br />
              Tem certeza que deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmGitHubRestore}
              className="bg-red-600 hover:bg-red-700"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Sim, Restaurar do GitHub
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SubmodulePage>
  );
}
