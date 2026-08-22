import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2 } from "lucide-react";

import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Painel ADMIN do "Backup de pedidos" (Monitor de Integrações).
 *
 * Ajusta os DADOS do backup (não o quando rodar): quantos dias manter na pasta (o resto é
 * arquivado), a unidade (dias úteis/corridos), as extensões arquivadas e a retenção dos zips
 * (apagar pastas-mês antigas). O **agendamento** (quando roda) é na VM (systemd) — ver
 * docs/monitor-arquivos-backup.md. Mostra também, só leitura, o resultado do último backup.
 *
 * Só é montado para administradores (gate em MonitorIntegracoes.tsx + `adminProcedure` no servidor).
 */
export interface BackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDataHora(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BackupModal({ open, onOpenChange }: BackupModalProps) {
  const utils = trpc.useUtils();
  const cfgQuery = trpc.monitorArquivos.getBackupConfig.useQuery(undefined, { enabled: open });
  const cfg = cfgQuery.data;

  const setM = trpc.monitorArquivos.setBackupConfig.useMutation();

  const [extText, setExtText] = useState("");
  const [manterDias, setManterDias] = useState(5);
  const [manterUnidade, setManterUnidade] = useState<"uteis" | "corridos">("uteis");
  const [retencaoMeses, setRetencaoMeses] = useState(12);
  // Caminhos extras (ex.: pastas de listas) — cada um com a própria extensão; retenção compartilhada.
  const [extras, setExtras] = useState<{ caminho: string; extText: string }[]>([]);

  useEffect(() => {
    if (!cfg) return;
    setExtText((cfg.extensoesZip ?? ["._rm"]).join(", "));
    setManterDias(cfg.manterDias ?? 5);
    setManterUnidade(cfg.manterUnidade === "corridos" ? "corridos" : "uteis");
    setRetencaoMeses(cfg.retencaoZipMeses ?? 12);
    setExtras((cfg.caminhosExtras ?? []).map((e) => ({ caminho: e.caminho, extText: (e.extensoes ?? []).join(", ") })));
  }, [cfg]);

  const splitExts = (s: string) =>
    s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  async function salvar() {
    const extensoesZip = splitExts(extText);
    if (extensoesZip.length === 0) {
      toast.error("Informe ao menos uma extensão para o backup.");
      return;
    }
    const caminhosExtras = extras
      .map((e) => ({ caminho: e.caminho.trim(), extensoes: splitExts(e.extText) }))
      .filter((e) => e.caminho !== "" && e.extensoes.length > 0);
    if (extras.some((e) => e.caminho.trim() !== "" && splitExts(e.extText).length === 0)) {
      toast.error("Cada caminho extra precisa de ao menos uma extensão.");
      return;
    }
    try {
      await setM.mutateAsync({ extensoesZip, manterDias, manterUnidade, retencaoZipMeses: retencaoMeses, caminhosExtras });
      await utils.monitorArquivos.getBackupConfig.invalidate();
      toast.success("Configuração do backup salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Backup de pedidos</DialogTitle>
          <DialogDescription>
            Mantém na pasta só os últimos <strong>N dias</strong>; o que for mais antigo é compactado em{" "}
            <code className="rounded bg-muted px-1 text-[11px]">backup/&lt;ano&gt;/&lt;mês&gt;/</code> e{" "}
            <strong>removido</strong>. O <strong>quando</strong> roda é configurado na VM (ver a
            documentação). Aqui você ajusta os dados do backup.
          </DialogDescription>
        </DialogHeader>

        {cfgQuery.isLoading ? (
          <div className="space-y-3">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Retenção na pasta */}
            <div className="space-y-1.5">
              <Label className="text-xs">Manter na pasta os últimos</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={manterDias}
                  onChange={(e) => setManterDias(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 tabular-nums"
                />
                <Select value={manterUnidade} onValueChange={(v) => setManterUnidade(v as "uteis" | "corridos")}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uteis">dias úteis</SelectItem>
                    <SelectItem value="corridos">dias corridos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tudo com data mais antiga que isso é arquivado e sai da pasta. Dia útil = seg–sex.
              </p>
            </div>

            {/* Extensões */}
            <div className="space-y-1.5">
              <Label className="text-xs">Extensões arquivadas (saem da pasta)</Label>
              <Input
                value={extText}
                onChange={(e) => setExtText(e.target.value)}
                placeholder="._RM, .ped"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Padrão <code className="rounded bg-muted px-1">._RM</code> (pedidos lidos). Separadas por vírgula.
              </p>
            </div>

            {/* Retenção dos zips */}
            <div className="space-y-1.5">
              <Label className="text-xs">Apagar backups (pastas-mês) com mais de</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={retencaoMeses}
                  onChange={(e) => setRetencaoMeses(Math.max(1, Number(e.target.value) || 1))}
                  className="w-20 tabular-nums"
                />
                <span className="text-sm text-muted-foreground">meses</span>
              </div>
            </div>

            {/* Caminhos extras (ex.: listas que não são apagadas e acumulam) */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Caminhos extras (ex.: listas)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setExtras((a) => [...a, { caminho: "", extText: "" }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pastas fora dos pedidos que também devem ser arquivadas (mesma retenção), cada uma com a
                sua própria extensão. Os originais saem da pasta após o zip.
              </p>
              {extras.length === 0 ? (
                <p className="rounded-md border border-dashed py-3 text-center text-[11px] text-muted-foreground">
                  Nenhum caminho extra.
                </p>
              ) : (
                <div className="space-y-2">
                  {extras.map((e, i) => (
                    <div key={i} className="space-y-1.5 rounded-md border bg-background/60 p-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Caminho</Label>
                        <Input
                          value={e.caminho}
                          onChange={(ev) => setExtras((a) => a.map((x, j) => (j === i ? { ...x, caminho: ev.target.value } : x)))}
                          placeholder="/mnt/erp/stoandre/lista"
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Extensões (separadas por vírgula)</Label>
                          <Input
                            value={e.extText}
                            onChange={(ev) => setExtras((a) => a.map((x, j) => (j === i ? { ...x, extText: ev.target.value } : x)))}
                            placeholder=".txt"
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-600"
                          onClick={() => setExtras((a) => a.filter((_, j) => j !== i))}
                          aria-label="Remover caminho extra"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={salvar} disabled={setM.isPending}>
                <Save className="mr-1 h-4 w-4" /> Salvar
              </Button>
            </div>

            {/* Último backup (só leitura) */}
            <div className="rounded-lg border p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Último backup
              </p>
              {cfg?.ultimaExecucaoEm ? (
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-1.5">
                    {cfg.ultimoOk ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    {cfg.ultimoOk ? "ok" : "com falhas"} · corte {cfg.ultimoCorte ?? "—"} ·{" "}
                    {fmtDataHora(cfg.ultimaExecucaoEm)}
                  </p>
                  {cfg.ultimoResumo && (
                    <p className="text-xs text-muted-foreground">
                      {cfg.ultimoResumo.pastas} pasta(s) · {cfg.ultimoResumo.arquivos} arquivo(s) ·{" "}
                      {cfg.ultimoResumo.zips} zip(s) · {cfg.ultimoResumo.podados} podado(s)
                    </p>
                  )}
                  {cfg.ultimoErros && cfg.ultimoErros.length > 0 && (
                    <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-md bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
                      {cfg.ultimoErros.slice(0, 20).map((e, i) => (
                        <li key={i} className="break-all">
                          • <span className="font-mono">{e.caminho}</span>: {e.erro}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum backup executado ainda.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
