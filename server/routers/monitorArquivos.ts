import { z } from "zod";

import { ACTIONS, MODULES } from "@shared/permissions";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import * as cp from "../monitorArquivosControlPlane";

/**
 * Router do submódulo "Monitor de Integrações" (Indicadores).
 *
 * Leitura (painel + logs) exige READ; a configuração (caminhos, destinos, vínculos) exige as
 * ações de escrita. No cliente, a modal de configuração só aparece para quem tem TODAS as
 * ações de escrita (create+update+delete) — ver client/src/pages/MonitorIntegracoes.tsx.
 *
 * O CÉREBRO (máquina de estados/SLA/alertas) roda no control plane, disparado pelo snapshot do
 * coletor (endpoints-ponte). Aqui o portal só lê o estado e gerencia a configuração.
 */

const M = MODULES.INDICADORES_MONITOR_ARQUIVOS;

/** Uma lista a acompanhar (id presente = linha existente a atualizar). */
const listaInput = z
  .object({
    id: z.number().int().positive().optional(),
    rotulo: z.string().min(1).max(120),
    caminho: z.string().min(1).max(512),
    modoIdentificacao: z.enum(["extensao", "nome"]).optional(),
    nomeArquivo: z.string().max(300).nullable().optional(),
    extensoes: z.array(z.string().min(1).max(32)).default([]),
    quantidadeEsperada: z.number().int().min(1).max(999).optional(),
    horaAlvo: z.number().int().min(0).max(23),
    minutoAlvo: z.number().int().min(0).max(59),
    realertaMin: z.number().int().min(1).max(10080),
    ativo: z.boolean().optional(),
  })
  .superRefine((l, ctx) => {
    if (l.modoIdentificacao === "nome") {
      if (!l.nomeArquivo?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe o nome exato do arquivo.", path: ["nomeArquivo"] });
      }
    } else if (l.extensoes.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe ao menos uma extensão.", path: ["extensoes"] });
    }
  });

const configInput = z
  .object({
    nome: z.string().min(1).max(160),
    // No modo 'geracao' o caminho fica nas listas; a validação condicional está no superRefine.
    caminho: z.string().max(512),
    tipoMonitoramento: z.enum(["pedidos", "geracao"]).optional(),
    extensoesPendente: z.array(z.string().min(1).max(32)).min(1),
    extensaoLida: z.string().min(1).max(32),
    intervaloVarreduraSeg: z.number().int().min(5).max(3600),
    slaLeituraMin: z.number().int().min(1).max(10080),
    gapSemPedidoMin: z.number().int().min(1).max(10080),
    realertaMin: z.number().int().min(1).max(10080),
    diasSemana: z.array(z.number().int().min(0).max(6)),
    horaInicio: z.number().int().min(0).max(24),
    horaFim: z.number().int().min(0).max(24),
    waContaId: z.string().max(64).optional(),
    ativo: z.boolean().optional(),
    /** Modo 'geracao': listas a acompanhar (replace-set). */
    listas: z.array(listaInput).optional(),
  })
  .superRefine((v, ctx) => {
    // Uma integração precisa de pelo menos pedidos (pasta) OU uma lista.
    const temPedidos = v.caminho.trim() !== "";
    const temListas = (v.listas?.length ?? 0) > 0;
    if (!temPedidos && !temListas) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configure a pasta de pedidos ou adicione ao menos uma lista.",
        path: ["caminho"],
      });
    }
  });

const destinoInput = z.object({
  waContaId: z.string().max(64).optional(),
  tipo: z.enum(["grupo", "contato"]),
  identificador: z.string().min(1).max(255),
  nome: z.string().min(1).max(160),
  ativo: z.boolean().optional(),
  universal: z.boolean().optional(),
});

export const monitorArquivosRouter = router({
  /* ─── Leitura (READ) ─────────────────────────────────────────────────────── */
  getPainel: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .query(() => cp.getPainel()),

  /**
   * Status do alerta EM TELA de pedidos travados para o usuário logado (polling do overlay global).
   * SEM permissão de módulo: qualquer usuário logado consulta, mas o servidor só retorna alerta se
   * ele for destinatário configurado — espelha indicadores.getAlertaCfvStatus.
   */
  getAlertaTravadosStatus: protectedProcedure.query(({ ctx }) => cp.getAlertaTravadosStatus(ctx.user.id)),

  listDestinos: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .query(() => cp.listDestinos()),

  getVinculos: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .input(z.object({ configId: z.number().int().positive() }))
    .query(({ input }) => cp.listVinculosByConfig(input.configId)),

  /** Pedidos em aberto (pendente/atrasado) de um caminho — para o detalhe do pedido. */
  getEventosAbertos: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .input(z.object({ configId: z.number().int().positive() }))
    .query(({ input }) => cp.listEventosAbertos(input.configId)),

  /** Listas (modo 'geracao') de uma integração + status calculado — detalhe e edição. */
  getListas: protectedProcedure
    .use(requirePermission(M, ACTIONS.READ))
    .input(z.object({ configId: z.number().int().positive() }))
    .query(({ input }) => cp.getListasComStatus(input.configId)),

  /* ─── Configuração de caminhos (CREATE/UPDATE/DELETE) ────────────────────── */
  createConfig: protectedProcedure
    .use(requirePermission(M, ACTIONS.CREATE))
    .input(configInput)
    .mutation(({ input }) => cp.createConfig(input)),

  updateConfig: protectedProcedure
    .use(requirePermission(M, ACTIONS.UPDATE))
    .input(z.object({ id: z.number().int().positive(), dados: configInput }))
    .mutation(({ input }) => cp.updateConfig(input.id, input.dados)),

  deleteConfig: protectedProcedure
    .use(requirePermission(M, ACTIONS.DELETE))
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => cp.deleteConfig(input.id)),

  /* ─── Destinos WhatsApp ──────────────────────────────────────────────────── */
  createDestino: protectedProcedure
    .use(requirePermission(M, ACTIONS.CREATE))
    .input(destinoInput)
    .mutation(({ input }) => cp.createDestino(input)),

  updateDestino: protectedProcedure
    .use(requirePermission(M, ACTIONS.UPDATE))
    .input(
      z.object({
        id: z.number().int().positive(),
        identificador: z.string().min(1).max(255).optional(),
        nome: z.string().min(1).max(160).optional(),
        ativo: z.boolean().optional(),
        universal: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => {
      const { id, ...patch } = input;
      return cp.updateDestino(id, patch);
    }),

  deleteDestino: protectedProcedure
    .use(requirePermission(M, ACTIONS.DELETE))
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input }) => cp.deleteDestino(input.id)),

  /** Substitui o conjunto de destinos vinculados a um caminho. */
  setVinculos: protectedProcedure
    .use(requirePermission(M, ACTIONS.UPDATE))
    .input(
      z.object({
        configId: z.number().int().positive(),
        destinoIds: z.array(z.number().int().positive()),
      }),
    )
    .mutation(({ input }) => cp.setVinculosConfig(input.configId, input.destinoIds)),

  /* ─── Backup de pedidos (SOMENTE ADMIN) — ajustes de dados (extensões, retenção). O QUANDO
     rodar é operado na VM (systemd) — ver docs/monitor-arquivos-backup.md. */
  getBackupConfig: adminProcedure.query(() => cp.getBackupConfig()),

  setBackupConfig: adminProcedure
    .input(
      z.object({
        extensoesZip: z.array(z.string().min(1).max(32)).min(1).optional(),
        manterDias: z.number().int().min(1).max(365).optional(),
        manterUnidade: z.enum(["uteis", "corridos"]).optional(),
        retencaoZipMeses: z.number().int().min(1).max(120).optional(),
        caminhosExtras: z
          .array(
            z.object({
              caminho: z.string().min(1).max(512),
              extensoes: z.array(z.string().min(1).max(32)).min(1),
            }),
          )
          .max(50)
          .optional(),
      }),
    )
    .mutation(({ input }) => cp.setBackupConfig(input)),

  /* ─── WhatsApp / WA Gateway (SOMENTE ADMIN) — status + QR pra parear. O envio roda na VM. */
  listWaContas: adminProcedure.query(() => cp.listWaContas()),

  reparearWaConta: adminProcedure
    .input(z.object({ id: z.string().min(1).max(64) }))
    .mutation(({ input }) => cp.solicitarLogoutWaConta(input.id)),

  /* ─── Resumo diário por imagem (SOMENTE ADMIN) — 1 imagem/dia com o cenário de integrações.
     O gatilho (horário) roda no heartbeat do coletor; aqui só se configura e se testa. */
  getResumoConfig: adminProcedure.query(() => cp.getResumoConfig()),

  setResumoConfig: adminProcedure
    .input(
      z.object({
        ativo: z.boolean().optional(),
        hora: z.number().int().min(0).max(23).optional(),
        minuto: z.number().int().min(0).max(59).optional(),
        diasSemana: z.array(z.number().int().min(0).max(6)).optional(),
        incluirPedidos: z.boolean().optional(),
        incluirListas: z.boolean().optional(),
        destinoIds: z.array(z.number().int().positive()).max(200).optional(),
      }),
    )
    .mutation(({ input }) => cp.setResumoConfig(input)),

  /** Envia o resumo agora (teste) — NÃO consome o dia (o envio automático do horário segue valendo). */
  enviarResumoAgora: adminProcedure.mutation(() => cp.enviarResumoAgora(new Date(), { marcarDia: false })),

  /* ─── Alerta EM TELA de pedidos travados (SOMENTE ADMIN) — quem vê o overlay + liga/desliga.
     Só pedidos (listas ficam de fora). O WhatsApp agregado por integração segue independente. */
  getAlertaTelaConfig: adminProcedure.query(() => cp.getAlertaTelaConfig()),

  setAlertaTelaConfig: adminProcedure
    .input(
      z.object({
        ativo: z.boolean().optional(),
        destinatarioIds: z.array(z.number().int().positive()).max(500).optional(),
      }),
    )
    .mutation(({ input }) => cp.setAlertaTelaConfig(input)),

  /** Usuários aprovados do portal (dropdown de destinatários do alerta em tela). */
  getUsuariosPortal: adminProcedure.query(() => cp.listUsuariosPortal()),
  /* ─── Histórico diário de processamento (heatmap 30 dias úteis) ─── */
  getHistoricoDias: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .use(requirePermission(M, ACTIONS.READ))
    .query(({ input }) => cp.getHistoricoDias(input.configId)),
});
