import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, gt, sql } from "drizzle-orm";

import { ACTIONS, MODULES } from "@shared/permissions";
import { protectedProcedure, router } from "../_core/trpc";
import { requirePermission } from "../permissionMiddleware";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { superestocadosChatHistory, superestoque, historicoVendas } from "../../drizzle/schema";
import { getRegionDashboard } from "../db/superestocados";
import { getSuperestocadosParams } from "../db/parametros";

const regionSchema = z.enum(["SC", "RS"]);

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

/* ─── Helpers ─── */

function buildSystemPrompt(params: Awaited<ReturnType<typeof getSuperestocadosParams>>): string {
  return `Você é um analista especialista em gestão de estoque farmacêutico, integrado ao painel de Superestocados da OpenDesk. Seu papel é ajudar o operador a tomar decisões sobre produtos com excesso de estoque, oferecendo análises que vão além do que a tabela exibe diretamente.

REGRAS DE COMPORTAMENTO:
1. Responda APENAS sobre dados e contexto do painel de Superestocados da região ativa.
2. Se o usuário perguntar algo fora do escopo (outros módulos, assuntos pessoais, etc.), responda educadamente que você só pode ajudar com questões relacionadas ao painel de Superestocados.
3. Seja objetivo e direto. Use linguagem profissional mas acessível.
4. Quando sugerir ações, seja específico: mencione o produto pelo nome/código, o valor em risco, e a ação recomendada.
5. Priorize insights acionáveis: o operador precisa saber O QUE fazer, não apenas o diagnóstico.
6. Use formatação markdown para organizar respostas (listas, negrito, tabelas quando aplicável).
7. Valores monetários em R$ com 2 casas decimais. Quantidades sem casas decimais.
8. Ao final de cada resposta com insights ou análises relevantes, pergunte ao usuário se ele deseja gerar um arquivo com o resumo das informações apresentadas.
9. NUNCA use emojis. Mantenha comunicação estritamente profissional.
10. Responda sempre em português brasileiro.

ANÁLISES AVANÇADAS QUE VOCÊ DEVE OFERECER (além do que a tabela mostra):
- Ranking de urgência cruzando excesso financeiro + dias sem venda + proximidade de vencimento de lote
- Identificação de fornecedores com múltiplos produtos em excesso (oportunidade de negociação em lote)
- Projeção de perda financeira se nenhuma ação for tomada nos próximos 30/60/90 dias
- Classificação de produtos em categorias: "recuperável" (tem venda, excesso moderado), "crítico" (sem venda recente, excesso alto), "crônico" (sem venda prolongada, valor alto)
- Detecção de padrões de venda por período para direcionar campanhas
- Análise de efetividade de campanhas ativas (produto em campanha está vendendo mais?)
- Correlação entre preço política e velocidade de saída
- Identificação de produtos com tendência de aceleração ou desaceleração de vendas (M-0 vs M-1 vs M-2)

REGRA DE CONTEXTO CROSS-REGIÃO:
- Você tem acesso a um resumo da região secundária EXCLUSIVAMENTE para identificar oportunidades de transferência.
- NUNCA misture dados das duas regiões em uma mesma análise, a menos que o usuário peça explicitamente uma comparação.
- Quando mencionar dados da outra região, SEMPRE prefixe com [REGIÃO]: para deixar claro ao operador de qual região é a informação.
- Insights de transferência devem seguir o formato:
  "Oportunidade de transferência: [Produto X] tem [N] unidades em excesso em [região ativa] e venda média de [M] un/mês em [outra região], onde o estoque está [abaixo do ideal / zerado / baixo]."
- Se não houver dados suficientes da outra região para um produto específico, informe isso ao invés de especular.

PARÂMETROS ATUAIS DO PAINEL:
- Dias de estoque para entrada: ${params.DIAS_ESTOQUE_ENTRADA} dias
- Dias de estoque para saída (medicamento): ${params.DIAS_ESTOQUE_SAIDA_MEDICAMENTO} dias
- Dias de estoque para saída (não-medicamento): ${params.DIAS_ESTOQUE_SAIDA_NAO_MEDICAMENTO} dias
- Dias mínimos de cadastro: ${params.DIAS_CADASTRO_MINIMO} dias
- Slots por região/tipo: ${params.SLOTS_POR_REGIAO_TIPO}
- Venda média mínima: ${params.VENDA_MEDIA_MINIMA}
- Meses para estoque ideal: ${params.MESES_ESTOQUE_IDEAL}
- Dias sem venda para alerta: ${params.DIAS_SEM_VENDA_ALERTA}`;
}

type ProductSummary = {
  codigo: number;
  nome: string;
  fornecedor: string;
  estoqueAtual: number;
  estoqueInicial: number;
  diasEstoque: number;
  vendaMedia: number;
  diasSemVenda: number;
  valorCusto: number | null;
  statusCampanha: string;
  qtdVendaMesAtual: number;
  qtdVendaMesAnterior: number;
  qtdVenda2MesesAnterior: number;
  qtdProjetadoMesAtual: number;
  loteVencimento: string | null;
  loteEstoque: number;
};

function buildRegionContext(
  region: string,
  products: ProductSummary[],
  isSecondary: boolean = false
): string {
  if (!products.length) {
    return isSecondary
      ? `\nCONTEXTO SECUNDÁRIO (REGIÃO ${region === "SC" ? "RS" : "SC"} - APENAS PARA COMPARAÇÃO):\nSem dados disponíveis para a outra região.`
      : `\nCONTEXTO PRINCIPAL (REGIÃO ATIVA: ${region}):\nNenhum produto encontrado na região.`;
  }

  const totalValor = products.reduce((sum, p) => sum + (p.valorCusto ?? 0), 0);
  const totalEstoque = products.reduce((sum, p) => sum + p.estoqueAtual, 0);
  const semVenda = products.filter((p) => p.diasSemVenda >= 3);
  const emCampanha = products.filter((p) => p.statusCampanha === "em_campanha");

  const header = isSecondary
    ? `\nCONTEXTO SECUNDÁRIO (REGIÃO ${region} - APENAS PARA COMPARAÇÃO DE TRANSFERÊNCIA):`
    : `\nCONTEXTO PRINCIPAL (REGIÃO ATIVA: ${region}):`;

  const summary = `
Resumo: ${products.length} produtos | Valor total em custo: R$ ${totalValor.toFixed(2)} | Estoque total: ${totalEstoque} un
Produtos sem venda recente (>= 3 dias): ${semVenda.length}
Produtos em campanha: ${emCampanha.length}`;

  // For secondary context, only send compact data
  if (isSecondary) {
    const compactList = products.slice(0, 50).map((p) =>
      `- [${p.codigo}] ${p.nome} | Est: ${p.estoqueAtual} | Vda.Méd: ${p.vendaMedia.toFixed(1)} | Dias s/ venda: ${p.diasSemVenda}`
    ).join("\n");
    return `${header}${summary}\n\nProdutos (resumo):\n${compactList}`;
  }

  // For primary context, send full data
  const productList = products.slice(0, 80).map((p) => {
    const excesso = p.estoqueAtual - p.estoqueInicial;
    const excessoValor = excesso > 0 && p.valorCusto ? ((excesso / p.estoqueAtual) * p.valorCusto).toFixed(2) : "0.00";
    return `- [${p.codigo}] ${p.nome} | Forn: ${p.fornecedor} | Est: ${p.estoqueAtual}/${p.estoqueInicial} (excesso: ${excesso > 0 ? excesso : 0}) | Dias est: ${p.diasEstoque} | Vda.Méd: ${p.vendaMedia.toFixed(1)} | Dias s/ venda: ${p.diasSemVenda} | Valor custo: R$ ${(p.valorCusto ?? 0).toFixed(2)} | Excesso R$: ${excessoValor} | Camp: ${p.statusCampanha} | Vda M-0: ${p.qtdVendaMesAtual} | Vda M-1: ${p.qtdVendaMesAnterior} | Vda M-2: ${p.qtdVenda2MesesAnterior} | Proj: ${p.qtdProjetadoMesAtual} | Lote venc: ${p.loteVencimento ?? "N/A"} (${p.loteEstoque} un)`;
  }).join("\n");

  return `${header}${summary}\n\nProdutos detalhados:\n${productList}`;
}

function buildProactiveInsights(
  region: string,
  products: ProductSummary[]
): string {
  if (!products.length) return "Nenhum produto encontrado na região para análise.";

  // Find top risk product
  const sorted = [...products].sort((a, b) => {
    const scoreA = (a.diasSemVenda * 10) + (a.diasEstoque * 2) + ((a.valorCusto ?? 0) / 100);
    const scoreB = (b.diasSemVenda * 10) + (b.diasEstoque * 2) + ((b.valorCusto ?? 0) / 100);
    return scoreB - scoreA;
  });

  const topRisk = sorted[0];
  const topRiskExcesso = topRisk.estoqueAtual - topRisk.estoqueInicial;
  const topRiskValor = topRiskExcesso > 0 && topRisk.valorCusto
    ? ((topRiskExcesso / topRisk.estoqueAtual) * topRisk.valorCusto).toFixed(2)
    : "0.00";

  // Find trend concern (M-0 < M-1 significantly)
  const trendConcerns = products.filter((p) =>
    p.qtdVendaMesAnterior > 0 && p.qtdVendaMesAtual < p.qtdVendaMesAnterior * 0.7
  ).sort((a, b) => {
    const dropA = 1 - (a.qtdVendaMesAtual / (a.qtdVendaMesAnterior || 1));
    const dropB = 1 - (b.qtdVendaMesAtual / (b.qtdVendaMesAnterior || 1));
    return dropB - dropA;
  });

  // Find products with expiring lots
  const today = new Date().toISOString().slice(0, 10);
  const expiringProducts = products
    .filter((p) => p.loteVencimento && p.loteVencimento <= today.slice(0, 7) + "-31" && p.loteEstoque > 0)
    .sort((a, b) => (a.loteVencimento ?? "").localeCompare(b.loteVencimento ?? ""));

  let insights = `Análise rápida da região ${region}:\n\n`;

  insights += `1. **Maior risco financeiro:** [${topRisk.codigo}] ${topRisk.nome} com R$ ${topRiskValor} em excesso e ${topRisk.diasSemVenda} dias sem venda.\n`;

  if (trendConcerns.length > 0) {
    const tc = trendConcerns[0];
    const drop = Math.round((1 - tc.qtdVendaMesAtual / (tc.qtdVendaMesAnterior || 1)) * 100);
    insights += `2. **Tendência preocupante:** [${tc.codigo}] ${tc.nome} teve queda de ${drop}% nas vendas (M-0 vs M-1).\n`;
  } else {
    insights += `2. **Tendências:** Nenhum produto com queda significativa de vendas identificado no momento.\n`;
  }

  if (expiringProducts.length > 0) {
    const ep = expiringProducts[0];
    insights += `3. **Atenção ao vencimento:** [${ep.codigo}] ${ep.nome} com lote vencendo em ${ep.loteVencimento} e ${ep.loteEstoque} unidades em estoque.\n`;
  } else {
    insights += `3. **Vencimentos:** Nenhum lote com vencimento iminente identificado.\n`;
  }

  insights += `\n**Posso fazer análises que o painel não mostra diretamente:**\n`;
  insights += `- Calcular um ranking de urgência cruzando excesso + dias sem venda + vencimento\n`;
  insights += `- Identificar fornecedores com múltiplos produtos em excesso (oportunidade de negociação)\n`;
  insights += `- Projetar perda financeira se nenhuma ação for tomada nos próximos 30/60/90 dias\n`;
  insights += `- Classificar seus produtos em "recuperável", "crítico" e "crônico"\n`;
  insights += `- Detectar padrões de venda por período para direcionar campanhas\n`;
  insights += `- Verificar oportunidades de transferência entre regiões\n`;
  insights += `\nPergunte qualquer coisa ou peça uma dessas análises!`;

  return insights;
}

async function getProductSummaries(region: "SC" | "RS"): Promise<ProductSummary[]> {
  const dashboard = await getRegionDashboard(region);
  return dashboard.products.map((p) => ({
    codigo: p.codigo,
    nome: p.nomeProduto,
    fornecedor: p.fornecedor,
    estoqueAtual: p.estoqueAtual,
    estoqueInicial: p.estoqueInicial,
    diasEstoque: p.diasEstoque,
    vendaMedia: p.vendaMedia,
    diasSemVenda: p.diasSemVenda,
    valorCusto: p.valorCusto,
    statusCampanha: p.statusCampanha,
    qtdVendaMesAtual: p.qtdVendaMesAtual,
    qtdVendaMesAnterior: p.qtdVendaMesAnterior,
    qtdVenda2MesesAnterior: p.qtdVenda2MesesAnterior,
    qtdProjetadoMesAtual: p.qtdProjetadoMesAtual,
    loteVencimento: p.lote?.vencimentoLote ?? null,
    loteEstoque: p.lote?.estoqueLote ?? 0,
  }));
}

/* ─── Router ─── */

export const superestocadosAIRouter = router({
  /**
   * Send a message to the AI assistant and get a response.
   * Creates or continues a chat session.
   */
  chat: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({
      region: regionSchema,
      message: z.string().min(1).max(2000),
      sessionId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const userId = ctx.user!.id;
      const { region, message, sessionId } = input;

      // Load or create session
      let session: { id: number; messages: ChatMessage[] } | null = null;

      if (sessionId) {
        const [existing] = await db
          .select()
          .from(superestocadosChatHistory)
          .where(and(
            eq(superestocadosChatHistory.id, sessionId),
            eq(superestocadosChatHistory.userId, userId),
          ))
          .limit(1);

        if (existing) {
          const rawMsgs = existing.messages;
          const parsedMsgs: ChatMessage[] = typeof rawMsgs === "string" ? JSON.parse(rawMsgs) : (rawMsgs as ChatMessage[]) ?? [];
          session = { id: existing.id, messages: parsedMsgs };
        }
      }

      if (!session) {
        // Create new session
        const result = await db.insert(superestocadosChatHistory).values({
          userId,
          region,
          messages: JSON.stringify([]) as any,
          title: message.slice(0, 100),
        });
        session = { id: Number(result[0].insertId), messages: [] };
      }

      // Add user message
      const userMsg: ChatMessage = { role: "user", content: message, timestamp: Date.now() };
      session.messages.push(userMsg);

      // Build context
      const [params, primaryProducts, secondaryProducts] = await Promise.all([
        getSuperestocadosParams(),
        getProductSummaries(region),
        getProductSummaries(region === "SC" ? "RS" : "SC"),
      ]);

      const systemPrompt = buildSystemPrompt(params);
      const primaryContext = buildRegionContext(region, primaryProducts, false);
      const secondaryRegion = region === "SC" ? "RS" : "SC";
      const secondaryContext = buildRegionContext(secondaryRegion, secondaryProducts, true);

      const fullSystemContent = `${systemPrompt}\n${primaryContext}\n${secondaryContext}`;

      // Build messages for LLM (last 10 messages to keep context manageable)
      const recentMessages = session.messages.slice(-10);
      const llmMessages = [
        { role: "system" as const, content: fullSystemContent },
        ...recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Call LLM
      const response = await invokeLLM({ messages: llmMessages });
      const rawContent = response.choices?.[0]?.message?.content;
      let assistantContent: string;
      if (typeof rawContent === "string") {
        assistantContent = rawContent;
      } else if (Array.isArray(rawContent)) {
        // Extract text parts from array content
        assistantContent = rawContent
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join("\n") || "Desculpe, não consegui processar sua solicitação. Tente novamente.";
      } else {
        assistantContent = "Desculpe, não consegui processar sua solicitação. Tente novamente.";
      }

      // Add assistant message
      const assistantMsg: ChatMessage = { role: "assistant", content: assistantContent, timestamp: Date.now() };
      session.messages.push(assistantMsg);

      // Persist
      await db
        .update(superestocadosChatHistory)
        .set({ messages: JSON.stringify(session.messages) as any })
        .where(eq(superestocadosChatHistory.id, session.id));

      return {
        sessionId: session.id,
        response: assistantContent,
      };
    }),

  /**
   * Get proactive insights for the active region (used when chat opens).
   */
  getProactiveInsights: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ region: regionSchema }))
    .query(async ({ input }) => {
      const products = await getProductSummaries(input.region);
      const insights = buildProactiveInsights(input.region, products);
      return { insights };
    }),

  /**
   * List chat sessions for the current user (last 2 days).
   */
  listSessions: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ region: regionSchema }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const sessions = await db
        .select({
          id: superestocadosChatHistory.id,
          title: superestocadosChatHistory.title,
          createdAt: superestocadosChatHistory.createdAt,
          updatedAt: superestocadosChatHistory.updatedAt,
        })
        .from(superestocadosChatHistory)
        .where(and(
          eq(superestocadosChatHistory.userId, ctx.user!.id),
          eq(superestocadosChatHistory.region, input.region),
          gt(superestocadosChatHistory.createdAt, twoDaysAgo),
        ))
        .orderBy(desc(superestocadosChatHistory.updatedAt))
        .limit(20);

      return sessions.map((s) => ({
        id: s.id,
        title: s.title ?? "Conversa sem título",
        createdAt: s.createdAt.getTime(),
        updatedAt: s.updatedAt.getTime(),
      }));
    }),

  /**
   * Load a specific chat session messages.
   */
  getSession: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select()
        .from(superestocadosChatHistory)
        .where(and(
          eq(superestocadosChatHistory.id, input.sessionId),
          eq(superestocadosChatHistory.userId, ctx.user!.id),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      }

      const rawMsgs = session.messages;
      const parsedMsgs: ChatMessage[] = typeof rawMsgs === "string" ? JSON.parse(rawMsgs) : (rawMsgs as ChatMessage[]) ?? [];

      return {
        id: session.id,
        region: session.region,
        title: session.title ?? "Conversa sem título",
        messages: parsedMsgs,
        createdAt: session.createdAt.getTime(),
      };
    }),

  /**
   * Export a chat session as a text file (base64).
   */
  exportSession: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .input(z.object({ sessionId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select()
        .from(superestocadosChatHistory)
        .where(and(
          eq(superestocadosChatHistory.id, input.sessionId),
          eq(superestocadosChatHistory.userId, ctx.user!.id),
        ))
        .limit(1);

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sessão não encontrada." });
      }

      const rawMsgs = session.messages;
      const messages: ChatMessage[] = typeof rawMsgs === "string" ? JSON.parse(rawMsgs) : (rawMsgs as ChatMessage[]) ?? [];
      const dateStr = new Date(session.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

      let content = `RELATÓRIO DO ASSISTENTE DE SUPERESTOCADOS\n`;
      content += `==========================================\n\n`;
      content += `Região: ${session.region}\n`;
      content += `Data: ${dateStr}\n`;
      content += `Título: ${session.title ?? "Sem título"}\n\n`;
      content += `------------------------------------------\n\n`;

      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const sender = msg.role === "user" ? "OPERADOR" : "ASSISTENTE";
        content += `[${time}] ${sender}:\n${msg.content}\n\n`;
      }

      content += `------------------------------------------\n`;
      content += `Gerado automaticamente pelo sistema OpenDesk.\n`;

      const base64 = Buffer.from(content, "utf-8").toString("base64");
      const filename = `assistente_superestocados_${session.region}_${new Date().toISOString().split("T")[0]}.txt`;

      return { base64, filename };
    }),

  /**
   * Delete expired sessions (older than 2 days). Called periodically.
   */
  cleanupExpired: protectedProcedure
    .use(requirePermission(MODULES.SUPERESTOCADOS, ACTIONS.READ))
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { deleted: 0 };

      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const result = await db
        .delete(superestocadosChatHistory)
        .where(sql`${superestocadosChatHistory.createdAt} < ${twoDaysAgo}`);

      return { deleted: Number((result as any)[0]?.affectedRows ?? 0) };
    }),
});
