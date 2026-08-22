import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, json, boolean, index, date, decimal, double, uniqueIndex, tinyint } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Supports both internal authentication (email/password) and OAuth.
 */
export const users = mysqlTable("sys_usuarios", {
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) - optional for internal auth users */
  openId: varchar("openId", { length: 64 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Hashed password for internal authentication */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: mysqlEnum("loginMethod", ["internal", "oauth"]).default("internal").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Approval status for new registrations */
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  /** Department ID - references departments table */
  departmentId: int("departmentId"),
  /** Permission group ID (optional) */
  groupId: int("groupId"),
  /** Module permissions stored as JSON array */
  permissions: json("permissions").$defaultFn(() => []),
  /** Whether the user account is enabled (can login) */
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
  /** Foto de perfil — data URI pequeno (redimensionado no cliente). Opcional. */
  avatarUrl: text("avatarUrl"),
  /** WhatsApp corporativo (E.164, só dígitos) — opcional; espelhado na base de contatos. */
  whatsapp: varchar("whatsapp", { length: 20 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const superestoqueRegionEnum = mysqlEnum("superestoqueRegion", ["SC", "RS"]);
export const superestoqueTipoProdutoEnum = mysqlEnum("tipoProduto", ["medicamento", "nao_medicamento"]);
export const superestoqueCampanhaEnum = mysqlEnum("statusCampanha", ["nao_participa", "em_campanha"]);

export const superestoque = mysqlTable("superestocados_produtos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: int("codigo").notNull(),
  region: superestoqueRegionEnum.notNull(),
  tipoProduto: superestoqueTipoProdutoEnum.notNull().default("medicamento"),
  nomeProduto: varchar("nomeProduto", { length: 255 }).notNull(),
  fornecedor: varchar("fornecedor", { length: 255 }).notNull(),
  ultimaCompra: double("ultimaCompra"),
  dataUltimaCompra: varchar("dataUltimaCompra", { length: 32 }),
  diasEstoque: int("diasEstoque").notNull().default(0),
  estoqueInicial: int("estoqueInicial").notNull(),
  estoqueAtual: int("estoqueAtual").notNull(),
  /** Data de entrada na permanência atual no painel principal. */
  painelEntradaEm: timestamp("painelEntradaEm"),
  /** Dias de estoque fixados na entrada no painel (snapshot). */
  diasEstoqueEntrada: int("diasEstoqueEntrada"),
  /** Excesso (R$) fixado na entrada no painel (snapshot) — base da % de redução. */
  excessoEntradaReais: double("excessoEntradaReais"),
  /** Transferência recebida de outro CD nesta permanência (some ao estoque inicial). */
  transfRecebidaAcum: int("transfRecebidaAcum").notNull().default(0),
  /** Transferência enviada para outro CD nesta permanência (subtrai do estoque inicial). */
  transfEnviadaAcum: int("transfEnviadaAcum").notNull().default(0),
  /** Última data de transferência já aplicada (controle once-only, YYYY-MM-DD). */
  transfProcessadaAte: date("transfProcessadaAte", { mode: "string" }),
  valorCusto: double("valorCusto"),
  vendaMedia: double("vendaMedia").notNull().default(0),
  /** Data de cadastro do produto no ERP (YYYY-MM-DD). Produtos com < 60 dias não são superestocados. */
  dataCadastroProduto: varchar("dataCadastroProduto", { length: 32 }),
  /** Status de campanha: 'em_campanha' congela estoque ideal e impede saída até atingi-lo */
  statusCampanha: superestoqueCampanhaEnum.notNull().default("nao_participa"),
  /** Estoque ideal congelado no momento em que o produto foi marcado como 'em_campanha' */
  estoqueIdealCongelado: int("estoqueIdealCongelado"),
  /** Descrição da campanha atual */
  campanhaDescricao: text("campanhaDescricao"),
  /** Data de início da campanha (YYYY-MM-DD) */
  campanhaInicio: date("campanhaInicio", { mode: "string" }),
  /** Data de fim da campanha (YYYY-MM-DD) */
  campanhaFim: date("campanhaFim", { mode: "string" }),
  /** Observação livre do operador (bloco de notas) */
  campanhaObservacao: text("campanhaObservacao"),
  /** Para produtos com venda média zerada: data em que entrou no painel de zerados */
  vendaZeradaEntradaEm: timestamp("vendaZeradaEntradaEm"),
  /** Para produtos com venda média zerada: estoque no momento da entrada no painel */
  vendaZeradaEstoqueInicial: int("vendaZeradaEstoqueInicial"),
  /** Data da última transferência (YYYY-MM-DD) */
  dataUltimaTransferencia: varchar("dataUltimaTransferencia", { length: 32 }),
  /** Quantidade vendida no mês anterior */
  qtdVendaMesAnterior: int("qtdVendaMesAnterior").default(0),
  /** Quantidade vendida 2 meses atrás */
  qtdVenda2MesesAnterior: int("qtdVenda2MesesAnterior").default(0),
  /** Quantidade projetada para o mês atual */
  qtdProjetadoMesAtual: int("qtdProjetadoMesAtual").default(0),
  /** Preço política (preço mínimo de venda) */
  precoPolitica: double("precoPolitica"),
  /** Quantidade vendida no mês atual */
  qtdVendaMesAtual: int("qtdVendaMesAtual").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  codigoRegionUnique: uniqueIndex("superestoque_codigo_region_unique").on(table.codigo, table.region),
  regionIdx: index("superestoque_region_idx").on(table.region),
  tipoProdutoIdx: index("superestoque_tipo_produto_idx").on(table.tipoProduto),
  nomeProdutoIdx: index("superestoque_nome_produto_idx").on(table.nomeProduto),
}));

/**
 * Histórico de permanência no painel de superestocados — 1 linha por passagem.
 * Persiste mesmo após o produto sair do painel (o produto em si pode ser deletado).
 * Criada via server/scripts/superestocados/apply-permanencia.mjs.
 */
export const superestocadosPermanencia = mysqlTable("superestocados_permanencia", {
  id: int("id").autoincrement().primaryKey(),
  codigo: int("codigo").notNull(),
  region: varchar("region", { length: 8 }).notNull(),
  tipoProduto: varchar("tipoProduto", { length: 32 }).notNull(),
  entrouEm: timestamp("entrouEm").notNull(),
  saiuEm: timestamp("saiuEm"),
  diasPermanencia: int("diasPermanencia"),
  transfRecebida: int("transfRecebida").notNull().default(0),
  transfEnviada: int("transfEnviada").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  produtoIdx: index("superestocados_permanencia_produto_idx").on(table.codigo, table.region, table.tipoProduto),
}));

/**
 * Retrato semanal do painel de Superestocados (por região) — alimenta os KPIs de
 * "Valor imobilizado" + evolução das últimas 4 semanas no cabeçalho do modo TV.
 * Uma linha por (região, semana ISO). Capturado no sync (upsert da semana corrente);
 * semanas passadas ficam congeladas. Criada via
 * server/scripts/superestocados/apply-resumo-semanal.mjs.
 */
export const superestocadosResumoSemanal = mysqlTable("superestocados_resumo_semanal", {
  id: int("id").autoincrement().primaryKey(),
  region: mysqlEnum("region", ["SC", "RS"]).notNull(),
  /** Semana ISO no formato "YYYY-Www" (ex.: "2026-W28"), fuso America/Sao_Paulo. */
  anoSemana: varchar("anoSemana", { length: 8 }).notNull(),
  /** Σ valorCusto dos produtos do painel (estoqueAtual>0) = "Valor imobilizado". */
  valorEstoqueTotal: double("valorEstoqueTotal").notNull().default(0),
  qtdProdutos: int("qtdProdutos").notNull().default(0),
  /**
   * Valor imobilizado por TIPO (balde), p/ a faixa das 4 semanas reagir ao filtro do painel.
   * NULL = semana capturada antes deste recorte (sem dado por tipo). O total acima segue completo.
   */
  valorMedicamento: double("valorMedicamento"),
  valorMedicamentoZerado: double("valorMedicamentoZerado"),
  valorNaoMedicamento: double("valorNaoMedicamento"),
  valorNaoMedicamentoZerado: double("valorNaoMedicamentoZerado"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  regionSemanaUnique: uniqueIndex("superestocados_resumo_semanal_region_semana_unique").on(table.region, table.anoSemana),
  regionIdx: index("superestocados_resumo_semanal_region_idx").on(table.region),
}));

export type SuperestocadosResumoSemanalRow = typeof superestocadosResumoSemanal.$inferSelect;

export const historicoVendas = mysqlTable("superestocados_historico_vendas", {
  id: int("id").autoincrement().primaryKey(),
  superestoqueId: int("superestoqueId").notNull().references(() => superestoque.id, { onDelete: "cascade" }),
  dataVenda: date("dataVenda", { mode: "string" }).notNull(),
  quantidade: int("quantidade").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  produtoDataUnique: uniqueIndex("historico_vendas_superestoque_data_unique").on(table.superestoqueId, table.dataVenda),
  superestoqueIdx: index("historico_vendas_superestoque_idx").on(table.superestoqueId),
  dataVendaIdx: index("historico_vendas_data_idx").on(table.dataVenda),
}));

/* ─────────────────────────────── Rupturas ───────────────────────────────────
 * Painel de rupturas (Gestão de Negócios). Alimentado pelo sync da API OpenDesk
 * (dia_estoque_sc/rs). Tabelas criadas via server/scripts/rupturas/apply-schema.mjs.
 *   - rupturas_produtos     → itens EM RUPTURA (zerado OU < 7 dias), por região.
 *   - rupturas_marca_resumo → agregado por marca/região (denominador da % de ruptura).
 *   - rupturas_compradores  → vínculo editável fornecedor → comprador responsável.
 */
export const rupturasProdutos = mysqlTable("rupturas_produtos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: int("codigo").notNull(),
  region: mysqlEnum("region", ["SC", "RS"]).notNull(),
  fornecedor: varchar("fornecedor", { length: 255 }).notNull(),
  nomeProduto: varchar("nomeProduto", { length: 255 }).notNull(),
  tipoProduto: mysqlEnum("tipoProduto", ["medicamento", "nao_medicamento"]).notNull().default("medicamento"),
  /** Dias de estoque (pode ser fracionário). */
  diasEstoque: double("diasEstoque").notNull().default(0),
  estoqueAtual: int("estoqueAtual").notNull().default(0),
  vendaMedia: double("vendaMedia").notNull().default(0),
  valorCusto: double("valorCusto"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  codigoRegionUnique: uniqueIndex("rupturas_produtos_codigo_region_unique").on(table.codigo, table.region),
  regionIdx: index("rupturas_produtos_region_idx").on(table.region),
  fornecedorIdx: index("rupturas_produtos_fornecedor_idx").on(table.fornecedor),
}));

export const rupturasMarcaResumo = mysqlTable("rupturas_marca_resumo", {
  id: int("id").autoincrement().primaryKey(),
  region: mysqlEnum("region", ["SC", "RS"]).notNull(),
  fornecedor: varchar("fornecedor", { length: 255 }).notNull(),
  /** Total de produtos ATIVOS da marca na região (denominador da % de ruptura). */
  totalAtivos: int("totalAtivos").notNull().default(0),
  /** Itens em ruptura (zerado OU < 7 dias) — numerador da %. */
  qtdRuptura: int("qtdRuptura").notNull().default(0),
  /** Subconjunto da ruptura que está zerado (estoque = 0). */
  qtdZerados: int("qtdZerados").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  regionFornecedorUnique: uniqueIndex("rupturas_marca_resumo_region_fornecedor_unique").on(table.region, table.fornecedor),
  regionIdx: index("rupturas_marca_resumo_region_idx").on(table.region),
}));

export const rupturasCompradores = mysqlTable("rupturas_compradores", {
  id: int("id").autoincrement().primaryKey(),
  fornecedor: varchar("fornecedor", { length: 255 }).notNull().unique(),
  comprador: varchar("comprador", { length: 255 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RupturaProduto = typeof rupturasProdutos.$inferSelect;
export type RupturaMarcaResumo = typeof rupturasMarcaResumo.$inferSelect;
export type RupturaComprador = typeof rupturasCompradores.$inferSelect;

/* ─────────────────────────────── Monitor TV ─────────────────────────────────
 * Playlists do player /monitor (rotação de painéis modo TV). Tabelas criadas via
 * server/scripts/monitor/apply-schema.mjs.
 *   - monitor_playlists       → playlist nomeada (slug único, aberta pela URL).
 *   - monitor_playlist_itens  → itens ordenados (painel, modo de região, top, tempo).
 * panelKey é VARCHAR (não ENUM): painel novo do backlog não exige ALTER TABLE — a
 * validação vem de shared/monitorTv.ts.
 */
export const monitorPlaylists = mysqlTable("monitor_playlists", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const monitorPlaylistItens = mysqlTable("monitor_playlist_itens", {
  id: int("id").autoincrement().primaryKey(),
  playlistId: int("playlistId").notNull().references(() => monitorPlaylists.id, { onDelete: "cascade" }),
  /** Posição na rotação (0-based). UNIQUE por (playlistId, ordem). */
  ordem: int("ordem").notNull(),
  /** Chave do painel no registry (shared/monitorTv.ts). */
  panelKey: varchar("panelKey", { length: 64 }).notNull(),
  regionMode: mysqlEnum("regionMode", ["unificado", "estados", "estados_unificado"]).notNull().default("estados_unificado"),
  top: int("top").notNull().default(10),
  /** Segundos que o slide fica na tela. */
  dwellSeconds: int("dwellSeconds").notNull().default(30),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  playlistOrdemUnique: uniqueIndex("monitor_playlist_itens_playlist_ordem_unique").on(table.playlistId, table.ordem),
  playlistIdx: index("monitor_playlist_itens_playlist_idx").on(table.playlistId),
}));

export type MonitorPlaylistRow = typeof monitorPlaylists.$inferSelect;
export type MonitorPlaylistItemRow = typeof monitorPlaylistItens.$inferSelect;

/* ──────────────── Compradores (compartilhado — estoque) ────────────────
 * Registro ÚNICO comprador↔marca, usado pelos painéis de estoque (Rupturas,
 * Superestocados, Validades Curtas…). Chave da marca = nome do Fornecedor como vem da
 * base `dia_estoque` (razão social; fantasia no fallback). Cada marca em UM só comprador
 * (UNIQUE). Tabelas criadas via server/scripts/compradores/apply-schema.mjs.
 *   - gn_compradores       → comprador (entidade).
 *   - gn_comprador_marcas  → vínculo marca→comprador (UNIQUE por marca).
 *   - gn_marcas            → catálogo de marcas da base (para o dropdown de atribuição).
 */
export const gnCompradores = mysqlTable("gn_compradores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const gnCompradorMarcas = mysqlTable("gn_comprador_marcas", {
  id: int("id").autoincrement().primaryKey(),
  compradorId: int("compradorId").notNull().references(() => gnCompradores.id, { onDelete: "cascade" }),
  /** Nome da marca (Fornecedor) como vem da base. UNIQUE → 1 marca = 1 comprador. */
  marca: varchar("marca", { length: 255 }).notNull().unique(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  compradorIdx: index("gn_comprador_marcas_comprador_idx").on(table.compradorId),
}));

export const gnMarcas = mysqlTable("gn_marcas", {
  id: int("id").autoincrement().primaryKey(),
  /** Nome distinto de Fornecedor visto na base `dia_estoque` (SC+RS). */
  marca: varchar("marca", { length: 255 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * De/para de normalização de marca: uma variante de razão social (ex.: "LHS FOODS")
 * aponta para a razão social CANÔNICA/oficial (ex.: "LHS INDUSTRIA E COMERCIO..."),
 * definida pelo comercial. Aplicado na regra única de marca (fetchProdutosEstoque),
 * então vale para o catálogo de compradores E para todos os painéis de estoque.
 */
export const gnMarcaAliases = mysqlTable("gn_marca_aliases", {
  id: int("id").autoincrement().primaryKey(),
  /** Nome como vem da base (variante). UNIQUE → cada variante aponta p/ 1 canônica. */
  variante: varchar("variante", { length: 255 }).notNull().unique(),
  /** Razão social oficial escolhida pelo comercial. */
  canonica: varchar("canonica", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GnComprador = typeof gnCompradores.$inferSelect;
export type GnCompradorMarca = typeof gnCompradorMarcas.$inferSelect;
export type GnMarca = typeof gnMarcas.$inferSelect;
export type GnMarcaAlias = typeof gnMarcaAliases.$inferSelect;

export const loteSuperestoque = mysqlTable("superestocados_lotes", {
  id: int("id").autoincrement().primaryKey(),
  superestoqueId: int("superestoqueId").notNull().references(() => superestoque.id, { onDelete: "cascade" }),
  codLote: varchar("codLote", { length: 64 }).notNull(),
  vencimentoLote: date("vencimentoLote", { mode: "string" }),
  estoqueLote: int("estoqueLote").notNull().default(0),
  qtdVendida: int("qtdVendida").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  superestoqueIdx: index("lote_superestoque_superestoque_idx").on(table.superestoqueId),
  loteUnique: uniqueIndex("lote_superestoque_unique").on(table.superestoqueId, table.codLote),
  vencimentoIdx: index("lote_superestoque_vencimento_idx").on(table.vencimentoLote),
}));

export type Superestoque = typeof superestoque.$inferSelect;
export type InsertSuperestoque = typeof superestoque.$inferInsert;
export type HistoricoVenda = typeof historicoVendas.$inferSelect;
export type InsertHistoricoVenda = typeof historicoVendas.$inferInsert;
export type LoteSuperestoque = typeof loteSuperestoque.$inferSelect;
export type InsertLoteSuperestoque = typeof loteSuperestoque.$inferInsert;
export type SuperestoqueRegion = "SC" | "RS";
export type SuperestoqueTipoProduto = "medicamento" | "nao_medicamento";

/* ─────────────────────────────────────────────────────────────────────────────
 * Pescador — painel comercial Clamed SC
 * Estrutura derivada das 3 consultas SQL do protótipo:
 *   consulta_1 → pescadorTriagem (1 linha por produto × política)
 *   consulta_2 → pescadorPedidos + pescadorPedidosItens (cabeçalho × itens)
 *   consulta_3 → pescadorHistorico (preço praticado por item × lote)
 *
 * Hoje os dados são populados via seed (server/scripts/pescador-seed/seed.mjs)
 * a partir do data.js do protótipo. No futuro, virão da API real.
 * ────────────────────────────────────────────────────────────────────────── */

export const pescadorMeta = mysqlTable("pescador_meta", {
  id: int("id").autoincrement().primaryKey(),
  geradoEm: timestamp("geradoEm").notNull(),
  estabelecimento: varchar("estabelecimento", { length: 32 }).notNull(),
  cliente: varchar("cliente", { length: 64 }).notNull(),
  janela: varchar("janela", { length: 128 }),
  totalTriagem: int("totalTriagem").notNull().default(0),
  totalPedidos: int("totalPedidos").notNull().default(0),
  totalHistorico: int("totalHistorico").notNull().default(0),
  fonte: varchar("fonte", { length: 32 }).notNull().default("seed"),
  /** Premissas da MC usadas na última carga (parâmetros enviados à consulta pescador_3). */
  mcEmpresa: varchar("mcEmpresa", { length: 32 }),
  mcRegiaoTributaria: varchar("mcRegiaoTributaria", { length: 16 }),
  /** var* como FRAÇÃO (ex.: 0.04 = 4%). */
  mcVarFrete: double("mcVarFrete"),
  mcVarPerdasVencidos: double("mcVarPerdasVencidos"),
  mcVarContratos: double("mcVarContratos"),
  mcVarInvestEmp: double("mcVarInvestEmp"),
  mcVarAssociativismo: double("mcVarAssociativismo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pescadorTriagem = mysqlTable("pescador_triagem", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimento: varchar("estabelecimento", { length: 16 }).notNull(),
  ean: varchar("ean", { length: 32 }).notNull(),
  codInterno: varchar("codInterno", { length: 32 }).notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  fabricante: varchar("fabricante", { length: 128 }),
  /** Fornecedor (API "fornecedor"); coluna exibida/filtrada no painel. Fallback p/ fabricante. */
  fornecedor: varchar("fornecedor", { length: 128 }),
  politica: varchar("politica", { length: 96 }).notNull(),
  estoqueSc: int("estoqueSc").notNull().default(0),
  custoCom: double("custoCom"),
  custoGer: double("custoGer"),
  curvaAbc: varchar("curvaAbc", { length: 8 }),
  precoTabela: double("precoTabela"),
  precoPromocional: double("precoPromocional"),
  descontoPerc: double("descontoPerc"),
  precoUnitario: double("precoUnitario"),
  /** Margem % (API: "Margem"). Antes placeholder na UI. */
  margem: double("margem"),
  /** Preço praticado / última venda (API: "Preco Final"). Antes placeholder na UI. */
  precoPraticado: double("precoPraticado"),
  /** Markup (API: "Markup"). */
  markup: double("markup"),
  /** Valor da última compra com IPI (API 9; na 15 é derivado de preço/markup). */
  valorUltimaCompraIpi: double("valorUltimaCompraIpi"),
  /** MC (Margem de Contribuição) — API "pescador_3"/15. */
  mc: double("mc"),
  /** MC em % do preço líquido (API "Perc_MC" × 100). */
  percMc: double("percMc"),
  /** Giro de estoque (API: "Giro_Estoque"). */
  giroEstoque: double("giroEstoque"),
  /** Custo médio comercial em R$ (API: "Vlr_CustoMedio"). */
  vlrCustoMedio: double("vlrCustoMedio"),
  /** Percentuais efetivos sobre o preço líquido (já em %). Alimentam o recálculo da MC. */
  percIcms: double("percIcms"),
  percPis: double("percPis"),
  percCofins: double("percCofins"),
  percComissao: double("percComissao"),
  percFrete: double("percFrete"),
  percInvestEmp: double("percInvestEmp"),
  percAssociativismo: double("percAssociativismo"),
  percPerdasVencidos: double("percPerdasVencidos"),
  percContratos: double("percContratos"),
  /** Repasse: informativo (não abatido direto da MC). */
  percRepasse: double("percRepasse"),
  origemPreco: varchar("origemPreco", { length: 32 }),
  giroMes: double("giroMes"),
  qtdVendidaMes: int("qtdVendidaMes").default(0),
  qtdVendidaMesAnterior: int("qtdVendidaMesAnterior").default(0),
  acompanhamento: varchar("acompanhamento", { length: 32 }),
  /** Janela móvel de 15 dias úteis (datas + qtd vendida em cada uma). D6–D15 vêm da API. */
  dataD1: date("dataD1", { mode: "string" }),
  vendaD1: int("vendaD1").default(0),
  dataD2: date("dataD2", { mode: "string" }),
  vendaD2: int("vendaD2").default(0),
  dataD3: date("dataD3", { mode: "string" }),
  vendaD3: int("vendaD3").default(0),
  dataD4: date("dataD4", { mode: "string" }),
  vendaD4: int("vendaD4").default(0),
  dataD5: date("dataD5", { mode: "string" }),
  vendaD5: int("vendaD5").default(0),
  dataD6: date("dataD6", { mode: "string" }),
  vendaD6: int("vendaD6").default(0),
  dataD7: date("dataD7", { mode: "string" }),
  vendaD7: int("vendaD7").default(0),
  dataD8: date("dataD8", { mode: "string" }),
  vendaD8: int("vendaD8").default(0),
  dataD9: date("dataD9", { mode: "string" }),
  vendaD9: int("vendaD9").default(0),
  dataD10: date("dataD10", { mode: "string" }),
  vendaD10: int("vendaD10").default(0),
  dataD11: date("dataD11", { mode: "string" }),
  vendaD11: int("vendaD11").default(0),
  dataD12: date("dataD12", { mode: "string" }),
  vendaD12: int("vendaD12").default(0),
  dataD13: date("dataD13", { mode: "string" }),
  vendaD13: int("vendaD13").default(0),
  dataD14: date("dataD14", { mode: "string" }),
  vendaD14: int("vendaD14").default(0),
  dataD15: date("dataD15", { mode: "string" }),
  vendaD15: int("vendaD15").default(0),
  codLote: varchar("codLote", { length: 64 }),
  loteEstoque: int("loteEstoque").default(0),
  loteVencimento: date("loteVencimento", { mode: "string" }),
  /** Status de validade do lote próximo (API: ACEITAVEL / NAO ACEITAVEL / SEM LOTE / SEM REGRA). */
  statusValidadeLote: varchar("statusValidadeLote", { length: 32 }),
  embalagem: varchar("embalagem", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  eanPoliticaUnique: uniqueIndex("pescador_triagem_ean_politica_unique").on(table.ean, table.politica),
  codInternoIdx: index("pescador_triagem_cod_interno_idx").on(table.codInterno),
  fabricanteIdx: index("pescador_triagem_fabricante_idx").on(table.fabricante),
  fornecedorIdx: index("pescador_triagem_fornecedor_idx").on(table.fornecedor),
  politicaIdx: index("pescador_triagem_politica_idx").on(table.politica),
  curvaAbcIdx: index("pescador_triagem_curva_abc_idx").on(table.curvaAbc),
  acompanhamentoIdx: index("pescador_triagem_acompanhamento_idx").on(table.acompanhamento),
  origemPrecoIdx: index("pescador_triagem_origem_preco_idx").on(table.origemPreco),
  loteVencimentoIdx: index("pescador_triagem_lote_vencimento_idx").on(table.loteVencimento),
}));

export const pescadorPedidos = mysqlTable("pescador_pedidos", {
  id: int("id").autoincrement().primaryKey(),
  dataPedido: date("dataPedido", { mode: "string" }),
  numeroPedidoVenda: varchar("numeroPedidoVenda", { length: 64 }).notNull(),
  codigoPedidoCliente: varchar("codigoPedidoCliente", { length: 64 }),
  cnpjCliente: varchar("cnpjCliente", { length: 32 }),
  numeroDesdobramento: int("numeroDesdobramento"),
  valorTotalPedido: double("valorTotalPedido"),
  motivoRejeicaoPedido: varchar("motivoRejeicaoPedido", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // Chave natural: CNPJ + nº do pedido do cliente + desdobramento.
  // NUMERO_PEDIDO_VENDA fica '0' em pedidos rejeitados que não viraram venda,
  // então NÃO serve como identificador único.
  pedidoNaturalUnique: uniqueIndex("pescador_pedidos_unique").on(table.cnpjCliente, table.codigoPedidoCliente, table.numeroDesdobramento),
  dataPedidoIdx: index("pescador_pedidos_data_idx").on(table.dataPedido),
  cnpjIdx: index("pescador_pedidos_cnpj_idx").on(table.cnpjCliente),
}));

export const pescadorPedidosItens = mysqlTable("pescador_pedidos_itens", {
  id: int("id").autoincrement().primaryKey(),
  pedidoId: int("pedidoId").notNull().references(() => pescadorPedidos.id, { onDelete: "cascade" }),
  codInterno: varchar("codInterno", { length: 32 }).notNull(),
  ean: varchar("ean", { length: 32 }),
  descricao: varchar("descricao", { length: 255 }),
  fabricante: varchar("fabricante", { length: 128 }),
  politica: varchar("politica", { length: 96 }),
  qtdSolicitada: int("qtdSolicitada").default(0),
  qtdAtendida: int("qtdAtendida").default(0),
  statusAtendimento: varchar("statusAtendimento", { length: 32 }),
  motivoRejeicaoItem: varchar("motivoRejeicaoItem", { length: 255 }),
  precoUnitarioPedido: double("precoUnitarioPedido"),
  descontoPedidoPerc: double("descontoPedidoPerc"),
  valorTotalItemPedido: double("valorTotalItemPedido"),
  numeroNota: varchar("numeroNota", { length: 64 }),
  dataNota: date("dataNota", { mode: "string" }),
  qtdFaturada: int("qtdFaturada").default(0),
  precoPraticadoNota: double("precoPraticadoNota"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  pedidoIdx: index("pescador_pedidos_itens_pedido_idx").on(table.pedidoId),
  codInternoIdx: index("pescador_pedidos_itens_cod_interno_idx").on(table.codInterno),
  statusIdx: index("pescador_pedidos_itens_status_idx").on(table.statusAtendimento),
  motivoIdx: index("pescador_pedidos_itens_motivo_idx").on(table.motivoRejeicaoItem),
}));

export const pescadorHistorico = mysqlTable("pescador_historico", {
  id: int("id").autoincrement().primaryKey(),
  estabelecimento: varchar("estabelecimento", { length: 16 }).notNull(),
  numeroNota: varchar("numeroNota", { length: 64 }).notNull(),
  serieNota: varchar("serieNota", { length: 16 }),
  dataEmissao: date("dataEmissao", { mode: "string" }).notNull(),
  layoutOrigem: varchar("layoutOrigem", { length: 64 }),
  pedidoVenda: varchar("pedidoVenda", { length: 64 }),
  seqItem: int("seqItem").notNull(),
  codInterno: varchar("codInterno", { length: 32 }).notNull(),
  ean: varchar("ean", { length: 32 }),
  descricao: varchar("descricao", { length: 255 }),
  fabricante: varchar("fabricante", { length: 128 }),
  codLote: varchar("codLote", { length: 64 }),
  qtdFaturada: int("qtdFaturada").default(0),
  precoLiquido: double("precoLiquido"),
  valorStUnitario: double("valorStUnitario"),
  precoFinal: double("precoFinal"),
  descontoPerc: double("descontoPerc"),
  valorTotalItem: double("valorTotalItem"),
  embalagem: varchar("embalagem", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  notaSeqUnique: uniqueIndex("pescador_historico_unique").on(table.numeroNota, table.serieNota, table.seqItem),
  dataEmissaoIdx: index("pescador_historico_data_idx").on(table.dataEmissao),
  codInternoIdx: index("pescador_historico_cod_interno_idx").on(table.codInterno),
  codLoteIdx: index("pescador_historico_lote_idx").on(table.codLote),
}));

export type PescadorTriagem = typeof pescadorTriagem.$inferSelect;
export type InsertPescadorTriagem = typeof pescadorTriagem.$inferInsert;
export type PescadorPedido = typeof pescadorPedidos.$inferSelect;
export type InsertPescadorPedido = typeof pescadorPedidos.$inferInsert;
export type PescadorPedidoItem = typeof pescadorPedidosItens.$inferSelect;
export type InsertPescadorPedidoItem = typeof pescadorPedidosItens.$inferInsert;
export type PescadorHistorico = typeof pescadorHistorico.$inferSelect;
export type InsertPescadorHistorico = typeof pescadorHistorico.$inferInsert;
export type PescadorMeta = typeof pescadorMeta.$inferSelect;
export type InsertPescadorMeta = typeof pescadorMeta.$inferInsert;

/**
 * Histórico de campanhas por produto
 */
export const campanhaHistorico = mysqlTable("superestocados_campanha_historico", {
  id: int("id").autoincrement().primaryKey(),
  superestoqueId: int("superestoqueId").notNull().references(() => superestoque.id, { onDelete: "cascade" }),
  descricao: text("descricao").notNull(),
  dataInicio: date("dataInicio", { mode: "string" }),
  dataFim: date("dataFim", { mode: "string" }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  finalizadoEm: timestamp("finalizadoEm"),
}, (table) => ({
  superestoqueIdx: index("campanha_hist_superestoque_idx").on(table.superestoqueId),
  criadoEmIdx: index("campanha_hist_criado_idx").on(table.criadoEm),
}));

export type CampanhaHistorico = typeof campanhaHistorico.$inferSelect;
export type InsertCampanhaHistorico = typeof campanhaHistorico.$inferInsert;

/**
 * Departments/Sectors table
 */
export const departments = mysqlTable("sys_departamentos", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nameIdx: index("name_idx").on(table.name),
}));

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = typeof departments.$inferInsert;

/**
 * Tickets table for help desk system
 */
export const tickets = mysqlTable("suporte_chamados", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: varchar("ticketId", { length: 32 }).notNull().unique(), // e.g., "bilhete_1"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: mysqlEnum("category", ["Técnico", "Acesso", "Funcionalidade", "Dúvida", "Outro"]).default("Técnico").notNull(),
  priority: mysqlEnum("priority", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  status: mysqlEnum("status", ["Novos", "Em Andamento", "Pendente Cliente", "Em Análise", "Pendente ERP", "Resolvido / Aguardando Validação", "Concluído"]).default("Novos").notNull(),
  departmentId: int("departmentId"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 255 }),
  /** Department name waiting for response */
  waitingForDepartment: varchar("waitingForDepartment", { length: 255 }),
  /** Role of the last person who responded (admin or user) */
  lastRespondentRole: mysqlEnum("lastRespondentRole", ["admin", "user"]),
  /** ID of the last person who responded */
  lastRespondentId: int("lastRespondentId"),
  /** Name of the last person who responded */
  lastRespondentName: varchar("lastRespondentName", { length: 255 }),
  /** Order for sorting within status column (for Kanban) */
  order: int("order").default(0).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(), // Unix timestamp in milliseconds
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;

/**
 * Comments on tickets
 */
export const comments = mysqlTable("suporte_comentarios", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  authorId: int("authorId").notNull(),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Activity feed for tickets
 */
export const activities = mysqlTable("suporte_atividades", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  type: mysqlEnum("type", ["status_change", "priority_change", "assignment", "comment", "created", "sector_change"]).notNull(),
  authorId: int("authorId").notNull(),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  oldValue: varchar("oldValue", { length: 255 }),
  newValue: varchar("newValue", { length: 255 }),
  description: text("description"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

/**
 * Attachments on tickets
 */
export const attachments = mysqlTable("suporte_anexos", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"),
  uploadedById: int("uploadedById").notNull(),
  uploadedByName: varchar("uploadedByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

/**
 * Announcements for the portal
 */
export const announcements = mysqlTable("sys_comunicados", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  type: mysqlEnum("type", ["info", "warning", "success", "error"]).default("info").notNull(),
  isActive: int("isActive").default(1).notNull(), // 1 = active, 0 = inactive
  createdById: int("createdById").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

/**
 * Projects table for project management
 */
export const projects = mysqlTable("projetos_base", {
  id: int("id").autoincrement().primaryKey(),
  projectId: varchar("projectId", { length: 32 }).notNull().unique(), // e.g., "proj_1"
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["Planejamento", "Em Andamento", "Em Pausa", "Concluído", "Cancelado"]).default("Planejamento").notNull(),
  priority: mysqlEnum("priority", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  ownerId: int("ownerId").notNull(), // Project owner/manager
  ownerName: varchar("ownerName", { length: 255 }).notNull(),
  sector: mysqlEnum("sector", ["TI", "RH", "Financeiro", "Comercial", "Suporte", "Operações"]).default("TI").notNull(),
  projectType: mysqlEnum("projectType", ["Integração Interna", "Integração Externa"]).default("Integração Interna").notNull(),
  startDate: bigint("startDate", { mode: "number" }), // Unix timestamp in milliseconds
  endDate: bigint("endDate", { mode: "number" }), // Unix timestamp in milliseconds
  progress: int("progress").default(0).notNull(), // 0-100
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  updatedById: int("updatedById"),
  updatedByName: varchar("updatedByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  kanbanOrder: int("kanbanOrder"),
  isBeingTreated: boolean("isBeingTreated").notNull().default(false),
  treatedByName: varchar("treatedByName", { length: 255 }),
  treatedAt: bigint("treatedAt", { mode: "number" }),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Project phases/milestones
 */
export const projectPhases = mysqlTable("projetos_fases", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["Pendente", "Em Andamento", "Concluída", "Atrasada"]).default("Pendente").notNull(),
  order: int("order").notNull(), // Display order
  startDate: bigint("startDate", { mode: "number" }),
  endDate: bigint("endDate", { mode: "number" }),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdById: int("createdById"),
  createdByName: varchar("createdByName", { length: 255 }),
  updatedById: int("updatedById"),
  updatedByName: varchar("updatedByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type ProjectPhase = typeof projectPhases.$inferSelect;
export type InsertProjectPhase = typeof projectPhases.$inferInsert;

/**
 * Comments on projects for team communication
 */
export const projectComments = mysqlTable("projetos_comentarios", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  authorId: int("authorId").notNull(),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  mentions: text("mentions"), // JSON array of mentioned user IDs
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type ProjectComment = typeof projectComments.$inferSelect;
export type InsertProjectComment = typeof projectComments.$inferInsert;

/**
 * Daily tasks within projects for day-to-day work tracking
 */
export const dailyTasks = mysqlTable("tarefas_diarias", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["Pendente", "Em Andamento", "Concluída"]).default("Pendente").notNull(),
  priority: mysqlEnum("priority", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 255 }),
  dueDate: bigint("dueDate", { mode: "number" }),
  completedAt: bigint("completedAt", { mode: "number" }),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  // Gamification
  points: int("points").default(0).notNull(),
  difficulty: mysqlEnum("difficulty", ["Facil", "Normal", "Dificil", "Muito Dificil"]).default("Normal").notNull(),
  // Collaboration
  assignedToIds: json("assignedToIds").$defaultFn(() => []),
  tags: json("tags").$defaultFn(() => []),
  // Automation
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurrencePattern: varchar("recurrencePattern", { length: 50 }),
  templateId: int("templateId"),
  // Kanban order
  order: int("order").default(0).notNull(),
  updatedById: int("updatedById"),
  updatedByName: varchar("updatedByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type DailyTask = typeof dailyTasks.$inferSelect;
export type InsertDailyTask = typeof dailyTasks.$inferInsert;

/**
 * Permission groups (profiles) for easier permission management
 */
export const permissionGroups = mysqlTable("sys_grupos_permissao", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  permissions: json("permissions").notNull(), // JSON object with module permissions
  isDefault: boolean("isDefault").default(false).notNull(), // Whether this is a default group
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type PermissionGroup = typeof permissionGroups.$inferSelect;
export type InsertPermissionGroup = typeof permissionGroups.$inferInsert;

/**
 * Suppliers table for purchasing module
 */
export const suppliers = mysqlTable("comercial_fornecedores", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }).unique(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  status: mysqlEnum("status", ["Ativo", "Inativo", "Bloqueado"]).default("Ativo").notNull(),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

/**
 * Products/Medicines table for purchasing module
 */
export const products = mysqlTable("comercial_catalogo", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  unit: varchar("unit", { length: 20 }).default("UN").notNull(), // UN, CX, FR, etc
  minStock: int("minStock").default(0),
  currentStock: int("currentStock").default(0),
  status: mysqlEnum("status", ["Ativo", "Inativo"]).default("Ativo").notNull(),
  requiresPrescription: boolean("requiresPrescription").default(false),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Quotations table for price comparison
 */
export const quotations = mysqlTable("compras_cotacoes", {
  id: int("id").autoincrement().primaryKey(),
  quotationNumber: varchar("quotationNumber", { length: 32 }).notNull().unique(),
  supplierId: int("supplierId").notNull(),
  supplierName: varchar("supplierName", { length: 255 }).notNull(),
  productId: int("productId").notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull(), // Price in cents
  totalPrice: int("totalPrice").notNull(), // Total in cents
  deliveryDays: int("deliveryDays"),
  status: mysqlEnum("status", ["Pendente", "Aprovada", "Rejeitada", "Expirada"]).default("Pendente").notNull(),
  validUntil: bigint("validUntil", { mode: "number" }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = typeof quotations.$inferInsert;

/**
 * Purchase Orders table
 */
export const purchaseOrders = mysqlTable("compras_pedidos", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
  supplierId: int("supplierId").notNull(),
  supplierName: varchar("supplierName", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["Rascunho", "Pendente", "Aprovado", "Enviado", "Recebido Parcial", "Recebido", "Cancelado"]).default("Rascunho").notNull(),
  totalAmount: int("totalAmount").notNull(), // Total in cents
  expectedDelivery: bigint("expectedDelivery", { mode: "number" }),
  actualDelivery: bigint("actualDelivery", { mode: "number" }),
  paymentTerms: varchar("paymentTerms", { length: 100 }),
  notes: text("notes"),
  approvedById: int("approvedById"),
  approvedByName: varchar("approvedByName", { length: 255 }),
  approvedAt: bigint("approvedAt", { mode: "number" }),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;

/**
 * Purchase Order Items table
 */
export const purchaseOrderItems = mysqlTable("compras_pedido_itens", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  productId: int("productId").notNull(),
  productCode: varchar("productCode", { length: 50 }).notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: int("unitPrice").notNull(), // Price in cents
  totalPrice: int("totalPrice").notNull(), // Total in cents
  receivedQuantity: int("receivedQuantity").default(0).notNull(),
  notes: text("notes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = typeof purchaseOrderItems.$inferInsert;

// Database Backups
export const backups = mysqlTable("sys_backups", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull(), // Size in bytes
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hash
  status: mysqlEnum("status", ["completed", "failed", "in_progress"]).default("in_progress").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(), // S3 storage path
  s3Url: varchar("s3Url", { length: 1024 }).notNull(), // S3 public URL
  tablesBackedUp: json("tablesBackedUp").$defaultFn(() => []), // List of table names
  recordCount: int("recordCount").default(0).notNull(), // Total records backed up
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  createdBy: varchar("createdBy", { length: 255 }).notNull(),
});

export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;

/**
 * Purchasing Tasks table for Kanban board
 */
export const purchasingTasks = mysqlTable("tarefas_compras", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", [
    "todo",           // A Fazer
    "quoting",        // Cotando
    "awaiting_approval", // Aguardando Aprovação
    "ordered",        // Pedido Realizado
    "received",       // Recebido
    "completed"       // Concluído
  ]).default("todo").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedToId: int("assignedToId"), // User responsible
  tags: text("tags"), // Comma-separated tags like "Urgente, Estoque Baixo, Cotação"
  dueDate: date("dueDate"),
  position: int("position").default(0).notNull(), // For ordering within column
  createdById: int("createdById").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("status_idx").on(table.status),
  assignedToIdx: index("assigned_to_idx").on(table.assignedToId),
}));

export type PurchasingTask = typeof purchasingTasks.$inferSelect;
export type InsertPurchasingTask = typeof purchasingTasks.$inferInsert;

/**
 * Kanban Column Settings - stores custom names for Kanban columns
 */
export const kanbanColumnSettings = mysqlTable("suporte_kanban_colunas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Each user can have their own column names
  module: varchar("module", { length: 50 }).notNull(), // e.g., "purchasing_tasks"
  columnKey: varchar("columnKey", { length: 50 }).notNull(), // e.g., "todo", "quoting", etc.
  customName: varchar("customName", { length: 100 }).notNull(), // User's custom name
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userModuleColumnIdx: index("user_module_column_idx").on(table.userId, table.module, table.columnKey),
}));

export type KanbanColumnSetting = typeof kanbanColumnSettings.$inferSelect;
export type InsertKanbanColumnSetting = typeof kanbanColumnSettings.$inferInsert;


/**
 * Notifications table for real-time alerts
 */
export const notifications = mysqlTable("sys_notificacoes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // Target user
  type: mysqlEnum("type", [
    "stock_critical",     // Estoque crítico (abaixo do mínimo)
    "stock_low",          // Estoque baixo (próximo do mínimo)
    "request_created",    // Nova solicitação criada
    "request_updated",    // Solicitação atualizada
    "request_completed",  // Solicitação concluída
    "task_assigned",      // Tarefa atribuída
    "task_due_soon",      // Tarefa com prazo próximo
    "ticket_created",     // Novo ticket aberto
    "ticket_updated",     // Ticket atualizado
    "ticket_comment",     // Novo comentário no ticket
    "ticket_assigned",    // Ticket atribuído
    "ticket_status_changed", // Status do ticket alterado
    "mention",            // Usuário mencionado em comentário
    "system"              // Notificação do sistema
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  /** Reference to related entity (productId, taskId, etc) */
  referenceId: int("referenceId"),
  referenceType: varchar("referenceType", { length: 50 }), // "product", "task", "ticket", etc
  /** Link to navigate when clicking the notification */
  actionUrl: varchar("actionUrl", { length: 512 }),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  userIdx: index("notification_user_idx").on(table.userId),
  userReadIdx: index("notification_user_read_idx").on(table.userId, table.isRead),
  typeIdx: index("notification_type_idx").on(table.type),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;


/**
 * Chat Conversations - Each conversation can be linked to a ticket
 */
export const chatConversations = mysqlTable("chat_conversas", {
  id: int("id").autoincrement().primaryKey(),
  /** Optional link to a ticket */
  ticketId: int("ticketId"),
  /** Conversation title/subject */
  title: varchar("title", { length: 255 }),
  /** Type of conversation */
  type: mysqlEnum("type", ["ticket_chat", "direct_message", "support_request"]).default("ticket_chat").notNull(),
  /** Status of the conversation */
  status: mysqlEnum("status", ["active", "waiting", "resolved", "closed"]).default("active").notNull(),
  /** Last message timestamp for ordering */
  lastMessageAt: bigint("lastMessageAt", { mode: "number" }),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  ticketIdx: index("chat_ticket_idx").on(table.ticketId),
  statusIdx: index("chat_status_idx").on(table.status),
  lastMessageIdx: index("chat_last_message_idx").on(table.lastMessageAt),
}));

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

/**
 * Chat Participants - Users involved in a conversation
 */
export const chatParticipants = mysqlTable("chat_participantes", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  /** Role in the conversation */
  role: mysqlEnum("role", ["user", "operator", "admin"]).default("user").notNull(),
  /** Last time user read messages in this conversation */
  lastReadAt: bigint("lastReadAt", { mode: "number" }),
  /** Whether user is currently typing */
  isTyping: boolean("isTyping").default(false).notNull(),
  /** When typing status was last updated */
  typingUpdatedAt: bigint("typingUpdatedAt", { mode: "number" }),
  joinedAt: bigint("joinedAt", { mode: "number" }).notNull(),
  leftAt: bigint("leftAt", { mode: "number" }),
}, (table) => ({
  conversationIdx: index("participant_conversation_idx").on(table.conversationId),
  userIdx: index("participant_user_idx").on(table.userId),
  conversationUserIdx: index("participant_conv_user_idx").on(table.conversationId, table.userId),
}));

export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type InsertChatParticipant = typeof chatParticipants.$inferInsert;

/**
 * Chat Messages - Individual messages in conversations
 */
export const chatMessages = mysqlTable("chat_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  senderId: int("senderId").notNull(),
  senderName: varchar("senderName", { length: 255 }).notNull(),
  senderRole: mysqlEnum("senderRole", ["user", "operator", "admin", "system"]).default("user").notNull(),
  /** Message content */
  content: text("content").notNull(),
  /** Type of message */
  messageType: mysqlEnum("messageType", ["text", "file", "image", "system"]).default("text").notNull(),
  /** Optional file attachment URL */
  attachmentUrl: text("attachmentUrl"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  /** Whether message has been edited */
  isEdited: boolean("isEdited").default(false).notNull(),
  editedAt: bigint("editedAt", { mode: "number" }),
  /** Whether message has been deleted (soft delete) */
  isDeleted: boolean("isDeleted").default(false).notNull(),
  deletedAt: bigint("deletedAt", { mode: "number" }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  conversationIdx: index("message_conversation_idx").on(table.conversationId),
  senderIdx: index("message_sender_idx").on(table.senderId),
  createdAtIdx: index("message_created_at_idx").on(table.createdAt),
}));

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * User Online Status - Track when users/operators are online
 */
export const userOnlineStatus = mysqlTable("sys_status_online", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  userName: varchar("userName", { length: 255 }).notNull(),
  userRole: mysqlEnum("userRole", ["user", "admin"]).default("user").notNull(),
  /** Whether user is currently online */
  isOnline: boolean("isOnline").default(false).notNull(),
  /** Last activity timestamp */
  lastActivityAt: bigint("lastActivityAt", { mode: "number" }).notNull(),
  /** Current page/module the user is viewing */
  currentPage: varchar("currentPage", { length: 255 }),
  /** Status message (e.g., "Disponível", "Ocupado", "Ausente") */
  statusMessage: varchar("statusMessage", { length: 100 }).default("Disponível"),
}, (table) => ({
  userIdx: index("online_user_idx").on(table.userId),
  onlineIdx: index("online_status_idx").on(table.isOnline),
  roleOnlineIdx: index("online_role_status_idx").on(table.userRole, table.isOnline),
}));

export type UserOnlineStatus = typeof userOnlineStatus.$inferSelect;
export type InsertUserOnlineStatus = typeof userOnlineStatus.$inferInsert;


/**
 * Chat Queue - Users waiting for operator attention
 */
export const chatQueue = mysqlTable("chat_fila", {
  id: int("id").autoincrement().primaryKey(),
  /** User waiting in queue */
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  /** Optional conversation ID if already created */
  conversationId: int("conversationId"),
  /** Optional ticket ID if related to a ticket */
  ticketId: int("ticketId"),
  /** Position in queue (1 = first) */
  position: int("position").notNull(),
  /** Queue status */
  status: mysqlEnum("status", [
    "waiting",      // Aguardando atendimento
    "assigned",     // Atribuído a um operador
    "in_progress",  // Em atendimento
    "completed",    // Atendimento concluído
    "cancelled"     // Cancelado pelo usuário
  ]).default("waiting").notNull(),
  /** Operator who accepted the chat */
  assignedOperatorId: int("assignedOperatorId"),
  assignedOperatorName: varchar("assignedOperatorName", { length: 255 }),
  /** Initial message/reason for contact */
  initialMessage: text("initialMessage"),
  /** Priority (VIP users, urgent tickets, etc) */
  priority: mysqlEnum("priority", ["normal", "high", "urgent"]).default("normal").notNull(),
  /** When user entered the queue */
  enteredAt: bigint("enteredAt", { mode: "number" }).notNull(),
  /** When operator accepted */
  acceptedAt: bigint("acceptedAt", { mode: "number" }),
  /** When chat was completed */
  completedAt: bigint("completedAt", { mode: "number" }),
}, (table) => ({
  userIdx: index("queue_user_idx").on(table.userId),
  statusIdx: index("queue_status_idx").on(table.status),
  positionIdx: index("queue_position_idx").on(table.position),
  operatorIdx: index("queue_operator_idx").on(table.assignedOperatorId),
}));

export type ChatQueue = typeof chatQueue.$inferSelect;
export type InsertChatQueue = typeof chatQueue.$inferInsert;

/**
 * Operator Availability - Track operator availability for chat
 */
export const operatorAvailability = mysqlTable("suporte_disponibilidade_operador", {
  id: int("id").autoincrement().primaryKey(),
  /** Operator user ID (must be admin) */
  operatorId: int("operatorId").notNull().unique(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  /** Whether operator is available to receive new chats */
  isAvailableForChat: boolean("isAvailableForChat").default(false).notNull(),
  /** Current status */
  status: mysqlEnum("status", [
    "available",    // Disponível para novos chats
    "busy",         // Ocupado (atendendo no limite)
    "away",         // Ausente temporariamente
    "offline"       // Offline/Indisponível
  ]).default("offline").notNull(),
  /** Maximum concurrent chats this operator can handle */
  maxConcurrentChats: int("maxConcurrentChats").default(3).notNull(),
  /** Current number of active chats */
  currentActiveChats: int("currentActiveChats").default(0).notNull(),
  /** Last time operator was active */
  lastActiveAt: bigint("lastActiveAt", { mode: "number" }),
  /** Custom status message */
  statusMessage: varchar("statusMessage", { length: 255 }),
  /** When availability was last updated */
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  operatorIdx: index("availability_operator_idx").on(table.operatorId),
  statusIdx: index("availability_status_idx").on(table.status),
  availableIdx: index("availability_available_idx").on(table.isAvailableForChat),
}));

export type OperatorAvailability = typeof operatorAvailability.$inferSelect;
export type InsertOperatorAvailability = typeof operatorAvailability.$inferInsert;


/**
 * Chat Ratings - User ratings for chat support sessions
 */
export const chatRatings = mysqlTable("chat_avaliacoes", {
  id: int("id").autoincrement().primaryKey(),
  /** Conversation ID being rated */
  conversationId: int("conversationId").notNull(),
  /** User who gave the rating */
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  /** Operator who provided the support */
  operatorId: int("operatorId").notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  /** Star rating (1-5) */
  rating: int("rating").notNull(),
  /** Optional comment from user */
  comment: text("comment"),
  /** When rating was submitted */
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  conversationIdx: index("rating_conversation_idx").on(table.conversationId),
  userIdx: index("rating_user_idx").on(table.userId),
  operatorIdx: index("rating_operator_idx").on(table.operatorId),
  ratingIdx: index("rating_rating_idx").on(table.rating),
}));

export type ChatRating = typeof chatRatings.$inferSelect;
export type InsertChatRating = typeof chatRatings.$inferInsert;

/**
 * Responsibility Tags - Categories/Tags for responsibilities
 */
export const responsibilityTags = mysqlTable("responsabilidades_tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#3b82f6").notNull(), // Hex color
  icon: varchar("icon", { length: 50 }), // Icon name (lucide-react)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nameIdx: index("tag_name_idx").on(table.name),
}));

export type ResponsibilityTag = typeof responsibilityTags.$inferSelect;
export type InsertResponsibilityTag = typeof responsibilityTags.$inferInsert;

/**
 * Person Responsibilities - Vincula pessoas a responsabilidades
 */
export const personResponsibilities = mysqlTable("responsabilidades_pessoas", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tagId: int("tagId").notNull(),
  /** Expertise level: junior, pleno, senior, especialista */
  level: mysqlEnum("level", ["junior", "pleno", "senior", "especialista"]).default("pleno").notNull(),
  /** Whether this is a primary responsibility */
  isPrimary: boolean("isPrimary").default(false).notNull(),
  /** Notes about this responsibility */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdx: index("person_resp_user_idx").on(table.userId),
  tagIdx: index("person_resp_tag_idx").on(table.tagId),
  userTagIdx: index("person_resp_user_tag_idx").on(table.userId, table.tagId),
}));

export type PersonResponsibility = typeof personResponsibilities.$inferSelect;
export type InsertPersonResponsibility = typeof personResponsibilities.$inferInsert;

/**
 * Ticket Responsibilities - Vincula chamados a pessoas responsáveis
 */
export const ticketResponsibilities = mysqlTable("suporte_responsaveis", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  userId: int("userId").notNull(),
  /** Role: primary (responsável principal), secondary (apoio), reviewer (revisor) */
  role: mysqlEnum("role", ["primary", "secondary", "reviewer"]).default("primary").notNull(),
  /** Whether this person is currently active on this ticket */
  isActive: boolean("isActive").default(true).notNull(),
  /** Estimated hours to resolve */
  estimatedHours: int("estimatedHours"),
  /** Actual hours spent */
  actualHours: int("actualHours"),
  /** Notes about the assignment */
  notes: text("notes"),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ticketIdx: index("ticket_resp_ticket_idx").on(table.ticketId),
  userIdx: index("ticket_resp_user_idx").on(table.userId),
  ticketUserIdx: index("ticket_resp_ticket_user_idx").on(table.ticketId, table.userId),
  activeIdx: index("ticket_resp_active_idx").on(table.isActive),
}));

export type TicketResponsibility = typeof ticketResponsibilities.$inferSelect;
export type InsertTicketResponsibility = typeof ticketResponsibilities.$inferInsert;

/**
 * Task Responsibilities - Vincula tarefas a pessoas responsáveis
 */
export const taskResponsibilities = mysqlTable("tarefas_responsaveis", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  /** Role: owner (responsável), collaborator (colaborador) */
  role: mysqlEnum("role", ["owner", "collaborator"]).default("owner").notNull(),
  /** Whether this person is currently active on this task */
  isActive: boolean("isActive").default(true).notNull(),
  /** Estimated hours to complete */
  estimatedHours: int("estimatedHours"),
  /** Actual hours spent */
  actualHours: int("actualHours"),
  /** Notes about the assignment */
  notes: text("notes"),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  taskIdx: index("task_resp_task_idx").on(table.taskId),
  userIdx: index("task_resp_user_idx").on(table.userId),
  taskUserIdx: index("task_resp_task_user_idx").on(table.taskId, table.userId),
  activeIdx: index("task_resp_active_idx").on(table.isActive),
}));

export type TaskResponsibility = typeof taskResponsibilities.$inferSelect;
export type InsertTaskResponsibility = typeof taskResponsibilities.$inferInsert;

/**
 * Responsibility History - Auditoria de mudanças em responsabilidades
 */
export const responsibilityHistory = mysqlTable("responsabilidades_historico", {
  id: int("id").autoincrement().primaryKey(),
  /** Type of change: created, updated, deleted, assigned, unassigned */
  changeType: mysqlEnum("changeType", ["created", "updated", "deleted", "assigned", "unassigned"]).notNull(),
  /** Entity type: tag, person_responsibility, ticket_responsibility, task_responsibility */
  entityType: mysqlEnum("entityType", ["tag", "person_responsibility", "ticket_responsibility", "task_responsibility"]).notNull(),
  /** ID of the entity that was changed */
  entityId: int("entityId").notNull(),
  /** User who made the change */
  changedById: int("changedById").notNull(),
  changedByName: varchar("changedByName", { length: 255 }).notNull(),
  /** Old values (JSON) */
  oldValues: json("oldValues"),
  /** New values (JSON) */
  newValues: json("newValues"),
  /** Description of the change */
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("history_entity_idx").on(table.entityType, table.entityId),
  userIdx: index("history_user_idx").on(table.changedById),
  createdAtIdx: index("history_created_at_idx").on(table.createdAt),
}));

export type ResponsibilityHistory = typeof responsibilityHistory.$inferSelect;
export type InsertResponsibilityHistory = typeof responsibilityHistory.$inferInsert;

/**
 * User statistics for gamification
 */
export const userStats = mysqlTable("sys_estatisticas_usuario", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  totalPoints: int("totalPoints").default(0).notNull(),
  tasksCompleted: int("tasksCompleted").default(0).notNull(),
  currentStreak: int("currentStreak").default(0).notNull(),
  longestStreak: int("longestStreak").default(0).notNull(),
  lastActiveDate: date("lastActiveDate"),
  level: int("level").default(1).notNull(),
  badges: json("badges").$defaultFn(() => []),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type UserStat = typeof userStats.$inferSelect;
export type InsertUserStat = typeof userStats.$inferInsert;

/**
 * Comments on daily tasks for collaboration
 */
export const taskComments = mysqlTable("tarefas_comentarios", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  authorId: int("authorId").notNull(),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  mentions: json("mentions").$defaultFn(() => []),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = typeof taskComments.$inferInsert;

/**
 * Task templates for automation
 */
export const taskTemplates = mysqlTable("tarefas_modelos", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  defaultPriority: mysqlEnum("defaultPriority", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  defaultDifficulty: mysqlEnum("defaultDifficulty", ["Facil", "Normal", "Dificil", "Muito Dificil"]).default("Normal").notNull(),
  defaultPoints: int("defaultPoints").default(10).notNull(),
  defaultTags: json("defaultTags").$defaultFn(() => []),
  isRecurring: boolean("isRecurring").default(false).notNull(),
  recurrencePattern: varchar("recurrencePattern", { length: 50 }),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});

export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = typeof taskTemplates.$inferInsert;


/**
 * Tasks Management table - Independent task management system
 * Supports daily, weekly, and monthly tasks
 */
export const tasksManagement = mysqlTable("tarefas_gestao", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["daily", "weekly", "monthly"]).notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "completed"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["Baixa", "Média", "Alta", "Crítica"]).default("Média").notNull(),
  difficulty: mysqlEnum("difficulty", ["Facil", "Normal", "Dificil", "Muito Dificil"]).default("Normal").notNull(),
  points: int("points").default(10).notNull(),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 255 }),
  dueDate: bigint("dueDate", { mode: "number" }),
  completedDate: bigint("completedDate", { mode: "number" }),
  recurrencePattern: varchar("recurrencePattern", { length: 50 }),
  tags: json("tags").$defaultFn(() => []),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  typeIdx: index("type_idx").on(table.type),
  statusIdx: index("status_idx").on(table.status),
  assignedToIdx: index("assignedTo_idx").on(table.assignedToId),
  dueDateIdx: index("dueDate_idx").on(table.dueDate),
}));

export type TaskManagement = typeof tasksManagement.$inferSelect;
export type InsertTaskManagement = typeof tasksManagement.$inferInsert;

/**
 * Task Management Comments table
 */
export const taskManagementComments = mysqlTable("tarefas_gestao_comentarios", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  mentionedUserIds: json("mentionedUserIds").$defaultFn(() => []),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  taskIdx: index("taskId_idx").on(table.taskId),
  userIdx: index("userId_idx").on(table.userId),
}));

export type TaskManagementComment = typeof taskManagementComments.$inferSelect;
export type InsertTaskManagementComment = typeof taskManagementComments.$inferInsert;


// ============ ALMOXARIFADO DE TI ============

/**
 * Categorias de equipamentos de TI
 */
export const itInventoryCategories = mysqlTable("ti_inventario_categorias", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ItInventoryCategory = typeof itInventoryCategories.$inferSelect;
export type InsertItInventoryCategory = typeof itInventoryCategories.$inferInsert;

/**
 * Equipamentos de TI no almoxarifado
 */
export const itInventoryItems = mysqlTable("ti_inventario_itens", {
  id: int("id").autoincrement().primaryKey(),
  itemId: varchar("itemId", { length: 32 }).notNull().unique(), // e.g., "EQUIP_001"
  tag: varchar("tag", { length: 100 }).notNull().unique(), // TAG única do equipamento (chave de negócio)
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  categoryId: int("categoryId").notNull(),
  categoryName: varchar("categoryName", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 255 }), // Setor onde o equipamento está
  responsible: varchar("responsible", { length: 255 }), // Nome do responsável
  serialNumber: varchar("serialNumber", { length: 255 }),
  model: varchar("model", { length: 255 }),
  manufacturer: varchar("manufacturer", { length: 255 }),
  purchaseDate: bigint("purchaseDate", { mode: "number" }), // Unix timestamp in milliseconds
  purchasePrice: decimal("purchasePrice", { precision: 10, scale: 2 }),
  warrantyExpiration: bigint("warrantyExpiration", { mode: "number" }), // Unix timestamp
  status: mysqlEnum("status", ["Disponível", "Em Uso", "Manutenção", "Descartado", "Emprestado"]).default("Disponível").notNull(),
  location: varchar("location", { length: 255 }), // Physical location in warehouse
  assignedToId: int("assignedToId"), // User ID if assigned
  assignedToName: varchar("assignedToName", { length: 255 }), // User name if assigned
  assignedDate: bigint("assignedDate", { mode: "number" }), // When assigned
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  tagIdx: uniqueIndex("tag_unique_idx").on(table.tag),
  categoryIdx: index("category_idx").on(table.categoryId),
  statusIdx: index("status_idx").on(table.status),
  assignedToIdx: index("assignedTo_idx").on(table.assignedToId),
  serialIdx: index("serial_idx").on(table.serialNumber),
  sectorIdx: index("sector_idx").on(table.sector),
  responsibleIdx: index("responsible_idx").on(table.responsible),
}));

export type ItInventoryItem = typeof itInventoryItems.$inferSelect;
export type InsertItInventoryItem = typeof itInventoryItems.$inferInsert;

/**
 * Movimentações de estoque (entrada, saída, transferência)
 */
export const itInventoryMovements = mysqlTable("ti_inventario_movimentacoes", {
  id: int("id").autoincrement().primaryKey(),
  movementId: varchar("movementId", { length: 32 }).notNull().unique(), // e.g., "MOV_001"
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["Entrada", "Saída", "Transferência", "Devolução", "Manutenção"]).notNull(),
  quantity: int("quantity").default(1).notNull(),
  fromLocation: varchar("fromLocation", { length: 255 }), // For transfers
  toLocation: varchar("toLocation", { length: 255 }), // For transfers
  fromUserId: int("fromUserId"), // For transfers/assignments
  fromUserName: varchar("fromUserName", { length: 255 }), // For transfers/assignments
  toUserId: int("toUserId"), // For transfers/assignments
  toUserName: varchar("toUserName", { length: 255 }), // For transfers/assignments
  reason: varchar("reason", { length: 255 }), // Reason for movement
  notes: text("notes"),
  authorizedById: int("authorizedById"),
  authorizedByName: varchar("authorizedByName", { length: 255 }),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  itemIdx: index("item_idx").on(table.itemId),
  typeIdx: index("type_idx").on(table.type),
  createdByIdx: index("createdBy_idx").on(table.createdById),
}));

export type ItInventoryMovement = typeof itInventoryMovements.$inferSelect;
export type InsertItInventoryMovement = typeof itInventoryMovements.$inferInsert;

/**
 * Baixa de equipamentos (descarte, venda, doação)
 */
export const itInventoryWriteOffs = mysqlTable("ti_inventario_baixas", {
  id: int("id").autoincrement().primaryKey(),
  writeOffId: varchar("writeOffId", { length: 32 }).notNull().unique(), // e.g., "WRITEOFF_001"
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  serialNumber: varchar("serialNumber", { length: 255 }),
  reason: mysqlEnum("reason", ["Defeito", "Obsoleto", "Perda", "Roubo", "Doação", "Venda", "Outro"]).notNull(),
  reasonDescription: text("reasonDescription"),
  writeOffDate: bigint("writeOffDate", { mode: "number" }).notNull(),
  estimatedValue: decimal("estimatedValue", { precision: 10, scale: 2 }),
  authorizedById: int("authorizedById").notNull(),
  authorizedByName: varchar("authorizedByName", { length: 255 }).notNull(),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  itemIdx: index("item_idx").on(table.itemId),
  reasonIdx: index("reason_idx").on(table.reason),
  authorizedByIdx: index("authorizedBy_idx").on(table.authorizedById),
}));

export type ItInventoryWriteOff = typeof itInventoryWriteOffs.$inferSelect;
export type InsertItInventoryWriteOff = typeof itInventoryWriteOffs.$inferInsert;

/**
 * Manutenção de equipamentos
 */
export const itInventoryMaintenance = mysqlTable("ti_inventario_manutencao", {
  id: int("id").autoincrement().primaryKey(),
  maintenanceId: varchar("maintenanceId", { length: 32 }).notNull().unique(), // e.g., "MAINT_001"
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["Preventiva", "Corretiva", "Limpeza", "Inspeção"]).notNull(),
  description: text("description"),
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  endDate: bigint("endDate", { mode: "number" }),
  status: mysqlEnum("status", ["Agendada", "Em Andamento", "Concluída", "Cancelada"]).default("Agendada").notNull(),
  technician: varchar("technician", { length: 255 }),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  itemIdx: index("item_idx").on(table.itemId),
  statusIdx: index("status_idx").on(table.status),
  startDateIdx: index("startDate_idx").on(table.startDate),
}));

export type ItInventoryMaintenance = typeof itInventoryMaintenance.$inferSelect;
export type InsertItInventoryMaintenance = typeof itInventoryMaintenance.$inferInsert;


/* ────────────────────────────────────────────────────────────────────────
 * Mapa de Inventário (submódulo do Almoxarifado de TI)
 * Hierarquia: Área → Setor → Equipamento → Periféricos. Cada nível é um nó
 * posicionável no canvas (React Flow). Posições/tamanhos em double; quando um
 * nó tem pai (setorId/areaId), a posição é relativa ao pai, senão absoluta.
 * IDs são strings (nanoid) geradas no cliente. DDL espelhada em
 * server/scripts/inventario-mapa/apply-schema.mjs.
 * ──────────────────────────────────────────────────────────────────────── */

/** Área — maior divisão do galpão (ex.: Logística, Administrativo). */
export const inventarioMapaAreas = mysqlTable("inventario_mapa_areas", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cor: varchar("cor", { length: 16 }).notNull(),
  posX: double("posX").notNull(),
  posY: double("posY").notNull(),
  width: double("width").notNull(),
  height: double("height").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type InventarioMapaArea = typeof inventarioMapaAreas.$inferSelect;
export type InsertInventarioMapaArea = typeof inventarioMapaAreas.$inferInsert;

/** Setor — caixa que agrupa equipamentos; opcionalmente dentro de uma Área. */
export const inventarioMapaSetores = mysqlTable("inventario_mapa_setores", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cor: varchar("cor", { length: 16 }).notNull(),
  areaId: varchar("areaId", { length: 36 }), // null = solto no mapa (posição absoluta)
  posX: double("posX").notNull(),
  posY: double("posY").notNull(),
  width: double("width").notNull(),
  height: double("height").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  areaIdx: index("inventario_mapa_setores_area_idx").on(table.areaId),
}));
export type InventarioMapaSetor = typeof inventarioMapaSetores.$inferSelect;
export type InsertInventarioMapaSetor = typeof inventarioMapaSetores.$inferInsert;

/** Equipamento (computador) — nó folha; periféricos ficam em coluna JSON. */
export const inventarioMapaEquipamentos = mysqlTable("inventario_mapa_equipamentos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tipo: varchar("tipo", { length: 32 }).default("Computador").notNull(),
  setorId: varchar("setorId", { length: 36 }), // null = solto no mapa (posição absoluta)
  posX: double("posX").notNull(),
  posY: double("posY").notNull(),
  // Bloco "geral"
  nome: varchar("nome", { length: 255 }).notNull(),
  patrimonio: varchar("patrimonio", { length: 100 }),
  mac: varchar("mac", { length: 64 }),
  sistemaOperacional: varchar("sistemaOperacional", { length: 128 }),
  responsavel: varchar("responsavel", { length: 255 }),
  departamento: varchar("departamento", { length: 255 }),
  status: mysqlEnum("status", ["Online", "Offline", "Alerta", "Manutencao"]).default("Offline").notNull(),
  // Lista de periféricos: [{ id, tipo, descricao, patrimonio }]
  perifericos: json("perifericos").$defaultFn(() => []),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  setorIdx: index("inventario_mapa_equip_setor_idx").on(table.setorId),
  statusIdx: index("inventario_mapa_equip_status_idx").on(table.status),
}));
export type InventarioMapaEquipamento = typeof inventarioMapaEquipamentos.$inferSelect;
export type InsertInventarioMapaEquipamento = typeof inventarioMapaEquipamentos.$inferInsert;


// ============================================================
// Módulo Comercial - Análise de Rejeições PDE
// ============================================================

/**
 * Uploads de arquivos comerciais (Excel de rejeições PDE)
 */
export const commercialUploads = mysqlTable("comercial_uploads", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  originalName: varchar("originalName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  totalRecords: int("totalRecords").default(0),
  status: mysqlEnum("status", ["processing", "completed", "error"]).default("processing").notNull(),
  errorMessage: text("errorMessage"),
  uploadedById: int("uploadedById").notNull(),
  uploadedByName: varchar("uploadedByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

/**
 * Rejeições PDE importadas do Excel
 */
export const commercialPdeRejections = mysqlTable("comercial_pde_rejeicoes", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(),
  dataRegistro: varchar("dataRegistro", { length: 20 }),
  estado: varchar("estado", { length: 5 }),
  razaoSocial: varchar("razaoSocial", { length: 512 }),
  cnpj: varchar("cnpj", { length: 20 }),
  pedido: varchar("pedido", { length: 32 }),
  codProduto: varchar("codProduto", { length: 32 }),
  produto: varchar("produto", { length: 512 }),
  percentualDesconto: decimal("percentualDesconto", { precision: 10, scale: 2 }),
  precoUnitario: decimal("precoUnitario", { precision: 12, scale: 2 }),
  qtdSolicitado: int("qtdSolicitado"),
  qtdAtendido: int("qtdAtendido"),
  codFabricante: varchar("codFabricante", { length: 32 }),
  fabricante: varchar("fabricante", { length: 255 }),
  idPolitica: varchar("idPolitica", { length: 32 }),
  politica: varchar("politica", { length: 255 }),
  motivoRejeicao: varchar("motivoRejeicao", { length: 255 }),
  layout: varchar("layout", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("upload_idx").on(table.uploadId),
  index("estado_idx").on(table.estado),
  index("motivo_idx").on(table.motivoRejeicao),
  index("fabricante_idx").on(table.fabricante),
  index("produto_idx").on(table.codProduto),
  index("cnpj_idx").on(table.cnpj),
  index("data_idx").on(table.dataRegistro),
]);

/**
 * Cadastro de Produtos importados do Excel
 */
export const commercialProducts = mysqlTable("comercial_produtos", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(),
  codigoProduto: varchar("codigoProduto", { length: 32 }),
  produto: varchar("produto", { length: 512 }),
  codigoEan: varchar("codigoEan", { length: 32 }),
  classificacaoFiscal: varchar("classificacaoFiscal", { length: 32 }),
  codigoCest: varchar("codigoCest", { length: 32 }),
  classificacaoTributaria: varchar("classificacaoTributaria", { length: 32 }),
  descricaoClassificacao: varchar("descricaoClassificacao", { length: 512 }),
  fabricante: varchar("fabricante", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("prod_upload_idx").on(table.uploadId),
  index("prod_codigo_idx").on(table.codigoProduto),
  index("prod_fabricante_idx").on(table.fabricante),
]);


// ============================================================
// Historico de Atividades de Projetos
// ============================================================

/**
 * Project Activity History - Registra todas as alteracoes feitas em projetos, fases e tarefas
 */
export const projectActivityHistory = mysqlTable("projetos_historico", {
  id: int("id").autoincrement().primaryKey(),
  /** ID do projeto relacionado */
  projectId: int("projectId").notNull(),
  /** Tipo da entidade alterada */
  entityType: mysqlEnum("entityType", ["project", "phase", "daily_task", "comment"]).notNull(),
  /** ID da entidade alterada */
  entityId: int("entityId").notNull(),
  /** Tipo de acao */
  actionType: mysqlEnum("actionType", [
    "created",
    "updated",
    "deleted",
    "status_changed",
    "progress_changed",
    "priority_changed",
    "assigned",
    "completed",
    "comment_added"
  ]).notNull(),
  /** Descricao legivel da acao */
  description: text("description").notNull(),
  /** Valores anteriores (JSON) */
  oldValues: json("oldValues"),
  /** Novos valores (JSON) */
  newValues: json("newValues"),
  /** Campo que foi alterado */
  fieldChanged: varchar("fieldChanged", { length: 100 }),
  /** Usuario que fez a alteracao */
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  /** Timestamp da alteracao */
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  projectIdx: index("pah_project_idx").on(table.projectId),
  entityIdx: index("pah_entity_idx").on(table.entityType, table.entityId),
  userIdx: index("pah_user_idx").on(table.userId),
  actionIdx: index("pah_action_idx").on(table.actionType),
  createdAtIdx: index("pah_created_at_idx").on(table.createdAt),
}));

export type ProjectActivityHistory = typeof projectActivityHistory.$inferSelect;
export type InsertProjectActivityHistory = typeof projectActivityHistory.$inferInsert;

/**
 * Subscriptions and Licenses - Gerenciamento de assinaturas e licenças
 */
export const subscriptionsLicenses = mysqlTable("admin_assinaturas_licencas", {
  id: int("id").autoincrement().primaryKey(),
  /** Nome do serviço/produto */
  serviceName: varchar("serviceName", { length: 255 }).notNull(),
  /** Categoria: Segurança, IA/LLM, Infraestrutura, Software, Outro */
  category: mysqlEnum("category", ["Segurança", "IA/LLM", "Infraestrutura", "Software", "Outro"]).notNull(),
  /** Tipo de renovação: Mensal, Anual, Personalizado */
  renewalType: mysqlEnum("renewalType", ["Mensal", "Anual", "Personalizado"]).notNull(),
  /** Para renovação personalizada: a cada quantos dias */
  renewalDays: int("renewalDays"),
  /** Data de início da assinatura (timestamp) */
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  /** Data de vencimento/expiração (timestamp) */
  expirationDate: bigint("expirationDate", { mode: "number" }).notNull(),
  /** Valor da assinatura */
  value: decimal("value", { precision: 12, scale: 2 }).notNull(),
  /** Moeda: R$ ou USD */
  currency: mysqlEnum("currency", ["BRL", "USD"]).default("BRL").notNull(),
  /** Status calculado: Ativo, Próximo do vencimento, Vencido, Cancelado */
  status: mysqlEnum("status", ["Ativo", "Próximo do vencimento", "Vencido", "Cancelado"]).default("Ativo").notNull(),
  /** Observações livres */
  notes: text("notes"),
  /** Responsável interno (ID do usuário) */
  responsibleUserId: int("responsibleUserId").notNull(),
  responsibleUserName: varchar("responsibleUserName", { length: 255 }).notNull(),
  /** Configuração de alerta: dias antes do vencimento para notificar */
  alertDaysBefore: int("alertDaysBefore").default(30).notNull(),
  /** Se o alerta está ativo */
  alertEnabled: boolean("alertEnabled").default(true).notNull(),
  /** Grupo/departamento que pode visualizar (para filtro futuro) */
  groupId: int("groupId").notNull(),
  /** Quem criou */
  createdById: int("createdById").notNull(),
  createdByName: varchar("createdByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  serviceIdx: index("sub_service_idx").on(table.serviceName),
  categoryIdx: index("sub_category_idx").on(table.category),
  statusIdx: index("sub_status_idx").on(table.status),
  expirationIdx: index("sub_expiration_idx").on(table.expirationDate),
  responsibleIdx: index("sub_responsible_idx").on(table.responsibleUserId),
  groupIdx: index("sub_group_idx").on(table.groupId),
}));

export type SubscriptionLicense = typeof subscriptionsLicenses.$inferSelect;
export type InsertSubscriptionLicense = typeof subscriptionsLicenses.$inferInsert;

/**
 * Anexos (PDFs) vinculados a assinaturas/licenças
 */
export const subscriptionAttachments = mysqlTable("admin_assinaturas_anexos", {
  id: int("id").autoincrement().primaryKey(),
  /** ID da assinatura pai */
  subscriptionId: int("subscriptionId").notNull(),
  /** Nome original do arquivo */
  fileName: varchar("fileName", { length: 500 }).notNull(),
  /** Chave no S3 */
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  /** URL pública do arquivo */
  fileUrl: text("fileUrl").notNull(),
  /** Tamanho em bytes */
  fileSize: int("fileSize").notNull(),
  /** MIME type */
  mimeType: varchar("mimeType", { length: 100 }).default("application/pdf").notNull(),
  /** Quem fez upload */
  uploadedById: int("uploadedById").notNull(),
  uploadedByName: varchar("uploadedByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  subscriptionIdx: index("att_subscription_idx").on(table.subscriptionId),
}));

export type SubscriptionAttachment = typeof subscriptionAttachments.$inferSelect;
export type InsertSubscriptionAttachment = typeof subscriptionAttachments.$inferInsert;


/**
 * Ticket Evaluations - Avaliações sigilosas de atendimento
 * Registradas pelo solicitante ao concluir o chamado.
 * O admin visualiza apenas setor, nota, comentário e dados do chamado.
 * O nome/email/login do avaliador NÃO é exibido na interface.
 */
export const ticketEvaluations = mysqlTable("suporte_avaliacoes", {
  id: int("id").autoincrement().primaryKey(),
  /** Número do chamado (ex: #870002) */
  ticketId: int("ticketId").notNull().unique(), // Um chamado = uma avaliação
  ticketDisplayId: varchar("ticketDisplayId", { length: 32 }).notNull(), // ex: "bilhete_1"
  ticketTitle: varchar("ticketTitle", { length: 255 }).notNull(),
  ticketCategory: varchar("ticketCategory", { length: 100 }).notNull(),
  /** Responsável pelo atendimento (admin) */
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 255 }),
  /** Nota de 1 a 5 estrelas */
  rating: int("rating").notNull(), // 1-5
  /** Observação do usuário */
  observation: text("observation"),
  /** Setor do avaliador - único dado de identificação exibido ao admin */
  evaluatorSectorId: int("evaluatorSectorId"),
  evaluatorSectorName: varchar("evaluatorSectorName", { length: 255 }),
  /** Vínculo interno com o usuário - apenas para integridade técnica, NÃO exibido na interface */
  evaluatorUserId: int("evaluatorUserId").notNull(),
  /** Data da avaliação */
  evaluatedAt: bigint("evaluatedAt", { mode: "number" }).notNull(),
  /** Tempo de atendimento em minutos (calculado automaticamente) */
  resolutionTimeMinutes: int("resolutionTimeMinutes"),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  ticketIdx: index("eval_ticket_idx").on(table.ticketId),
  ratingIdx: index("eval_rating_idx").on(table.rating),
  sectorIdx: index("eval_sector_idx").on(table.evaluatorSectorId),
  evaluatedAtIdx: index("eval_evaluated_at_idx").on(table.evaluatedAt),
  assignedToIdx: index("eval_assigned_to_idx").on(table.assignedToId),
}));

export type TicketEvaluation = typeof ticketEvaluations.$inferSelect;
export type InsertTicketEvaluation = typeof ticketEvaluations.$inferInsert;


/**
 * Development Activity Log - Feed de atividade em tempo real do módulo de Desenvolvimento
 * Registra criação, edição, exclusão de projetos e tarefas
 */
export const devActivityLog = mysqlTable("dev_log_atividades", {
  id: int("id").autoincrement().primaryKey(),
  /** Tipo de ação */
  action: mysqlEnum("action", [
    "project_created",
    "project_updated",
    "project_deleted",
    "project_status_changed",
    "task_created",
    "task_updated",
    "task_deleted",
    "task_status_changed",
    "phase_created",
    "phase_updated",
    "phase_deleted",
    "comment_added",
  ]).notNull(),
  /** Usuário que realizou a ação */
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  /** Entidade afetada */
  entityType: mysqlEnum("entityType", ["project", "task", "phase", "comment"]).notNull(),
  entityId: int("entityId").notNull(),
  entityName: varchar("entityName", { length: 255 }).notNull(),
  /** Projeto pai (para tarefas, fases e comentários) */
  projectId: int("projectId"),
  projectName: varchar("projectName", { length: 255 }),
  /** Detalhes da mudança (ex: "Status: Planejamento → Em Andamento") */
  details: text("details"),
  /** Valores antigos/novos para comparação */
  oldValue: varchar("oldValue", { length: 255 }),
  newValue: varchar("newValue", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  userIdx: index("dev_activity_user_idx").on(table.userId),
  entityIdx: index("dev_activity_entity_idx").on(table.entityType, table.entityId),
  projectIdx: index("dev_activity_project_idx").on(table.projectId),
  createdAtIdx: index("dev_activity_created_at_idx").on(table.createdAt),
}));

export type DevActivityLog = typeof devActivityLog.$inferSelect;
export type InsertDevActivityLog = typeof devActivityLog.$inferInsert;

/**
 * Project attachments for storing documents, images, and spreadsheets
 */
export const projectAttachments = mysqlTable("projetos_anexos", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"), // Size in bytes
  category: mysqlEnum("category", ["imagem", "planilha", "documento", "outro"]).default("outro").notNull(),
  description: text("description"),
  uploadedById: int("uploadedById").notNull(),
  uploadedByName: varchar("uploadedByName", { length: 255 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  projectIdx: index("proj_attach_project_idx").on(table.projectId),
  categoryIdx: index("proj_attach_category_idx").on(table.category),
  createdAtIdx: index("proj_attach_created_at_idx").on(table.createdAt),
}));

export type ProjectAttachment = typeof projectAttachments.$inferSelect;
export type InsertProjectAttachment = typeof projectAttachments.$inferInsert;


// ============================================================
// CONTRATOS DE REPASSE — submódulo Gestão de Negócios > Contratos
// ============================================================

/**
 * Cabeçalho do contrato de repasse com farmácias / associativismos.
 * Hierarquia de escopo: estado (SC/RS) × grupo (Associativismo/Farmácias).
 */
export const contratosRepasse = mysqlTable("repasses_contratos", {
  id: int("id").autoincrement().primaryKey(),
  /** Identificador opcional interno (ex.: "REP-2026-001") */
  codigo: varchar("codigo", { length: 32 }),
  /** Apelido / nomenclatura interna usada pela operação comercial */
  apelidoInterno: varchar("apelidoInterno", { length: 255 }),
  /** Razão social / nome do parceiro extraído do PDF */
  parceiro: varchar("parceiro", { length: 512 }).notNull(),
  cnpj: varchar("cnpj", { length: 32 }).notNull(),
  estado: mysqlEnum("estado", ["SC", "RS"]).notNull(),
  grupo: mysqlEnum("grupo", ["Associativismo", "Farmácias"]).notNull(),
  /** Status pode ser auto-derivado da vigência ou setado manualmente */
  status: mysqlEnum("status", ["Vigente", "Vencido"]).default("Vigente").notNull(),
  /** Gatilho mensal acordado (R$) */
  gatilhoMensal: decimal("gatilhoMensal", { precision: 14, scale: 2 }).notNull(),
  vigenciaInicio: date("vigenciaInicio", { mode: "string" }).notNull(),
  vigenciaFim: date("vigenciaFim", { mode: "string" }).notNull(),
  /** Observações internas livres */
  observacoes: text("observacoes"),
  /** Anexos do PDF original / aditivos */
  pdfFileName: varchar("pdfFileName", { length: 512 }),
  pdfFileKey: varchar("pdfFileKey", { length: 512 }),
  pdfFileUrl: text("pdfFileUrl"),
  /** Auditoria mínima */
  createdById: int("createdById"),
  createdByName: varchar("createdByName", { length: 255 }),
  updatedById: int("updatedById"),
  updatedByName: varchar("updatedByName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => [
  index("contratos_repasse_estado_idx").on(table.estado),
  index("contratos_repasse_grupo_idx").on(table.grupo),
  index("contratos_repasse_status_idx").on(table.status),
  index("contratos_repasse_cnpj_idx").on(table.cnpj),
  index("contratos_repasse_parceiro_idx").on(table.parceiro),
]);

/**
 * Tabela 1:N de taxas de repasse por categoria/laboratório.
 * Ex.: Genéricos 3%, Geolab 6%, EMS 4.5%.
 */
export const contratosRepasseTaxas = mysqlTable("repasses_taxas", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId")
    .notNull()
    .references(() => contratosRepasse.id, { onDelete: "cascade" }),
  categoria: varchar("categoria", { length: 255 }).notNull(),
  percentual: decimal("percentual", { precision: 6, scale: 2 }).notNull(),
  ordem: int("ordem").notNull().default(0),
}, (table) => [
  index("contratos_repasse_taxas_contrato_idx").on(table.contratoId),
]);

/**
 * Tabela 1:N de filiais beneficiadas pelo contrato.
 */
export const contratosRepasseFiliais = mysqlTable("repasses_filiais", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId")
    .notNull()
    .references(() => contratosRepasse.id, { onDelete: "cascade" }),
  nome: varchar("nome", { length: 512 }).notNull(),
  ordem: int("ordem").notNull().default(0),
}, (table) => [
  index("contratos_repasse_filiais_contrato_idx").on(table.contratoId),
]);

/**
 * Log de atualizações de contratos de repasse.
 * Registra quem atualizou, quando e por qual motivo.
 */
export const contratosRepasseLog = mysqlTable("repasses_log", {
  id: int("id").autoincrement().primaryKey(),
  contratoId: int("contratoId")
    .notNull()
    .references(() => contratosRepasse.id, { onDelete: "cascade" }),
  /** Tipo da ação realizada */
  acao: mysqlEnum("acao", ["criacao", "atualizacao", "edicao"]).notNull(),
  /** Motivo informado pelo usuário */
  motivo: text("motivo"),
  /** Dados anteriores (snapshot JSON para auditoria) */
  dadosAnteriores: json("dadosAnteriores"),
  /** Usuário que realizou a ação */
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => [
  index("contratos_repasse_log_contrato_idx").on(table.contratoId),
  index("contratos_repasse_log_acao_idx").on(table.acao),
]);

export type ContratoRepasse = typeof contratosRepasse.$inferSelect;
export type InsertContratoRepasse = typeof contratosRepasse.$inferInsert;
export type ContratoRepasseTaxa = typeof contratosRepasseTaxas.$inferSelect;
export type InsertContratoRepasseTaxa = typeof contratosRepasseTaxas.$inferInsert;
export type ContratoRepasseFilial = typeof contratosRepasseFiliais.$inferSelect;
export type InsertContratoRepasseFilial = typeof contratosRepasseFiliais.$inferInsert;
export type ContratoRepasseLog = typeof contratosRepasseLog.$inferSelect;
export type InsertContratoRepasseLog = typeof contratosRepasseLog.$inferInsert;

/**
 * Tabela de parâmetros configuráveis do sistema.
 * Permite ajustar regras de negócio sem recompilar o código.
 */
export const parametros = mysqlTable("sys_parametros", {
  id: int("id").autoincrement().primaryKey(),
  /** Chave única do parâmetro (ex: DIAS_ESTOQUE_ENTRADA) */
  chave: varchar("chave", { length: 100 }).notNull().unique(),
  /** Valor armazenado como string (convertido em runtime conforme o tipo) */
  valor: varchar("valor", { length: 500 }).notNull(),
  /** Tipo do valor para conversão correta */
  tipo: mysqlEnum("tipo", ["number", "boolean", "string"]).notNull().default("string"),
  /** Módulo ao qual o parâmetro pertence */
  modulo: varchar("modulo", { length: 100 }).notNull().default("geral"),
  /** Descrição legível do parâmetro */
  descricao: text("descricao"),
  /** Quem atualizou por último */
  updatedBy: varchar("updatedBy", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Parametro = typeof parametros.$inferSelect;
export type InsertParametro = typeof parametros.$inferInsert;

/**
 * Log de erros do sistema.
 * Registra erros de backend para analise pela equipe de TI.
 * Permite rastrear falhas, identificar padroes e corrigir bugs.
 */
export const systemErrorLogs = mysqlTable("system_error_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** Modulo onde o erro ocorreu (ex: repasses, chamados, admin) */
  module: varchar("module", { length: 100 }).notNull(),
  /** Operacao que falhou (ex: createContrato, extractFromPdf) */
  operation: varchar("operation", { length: 255 }).notNull(),
  /** Mensagem de erro */
  errorMessage: text("errorMessage").notNull(),
  /** Stack trace completo */
  stackTrace: text("stackTrace"),
  /** Dados de contexto (input, params, etc) em JSON */
  context: json("context"),
  /** Severidade: error, warning, info */
  severity: mysqlEnum("severity", ["error", "warning", "info"]).notNull().default("error"),
  /** Se o erro ja foi resolvido/analisado */
  resolved: tinyint("resolved").notNull().default(0),
  /** Notas da equipe de TI sobre a resolucao */
  resolutionNotes: text("resolutionNotes"),
  /** Usuario que estava logado quando o erro ocorreu */
  userId: int("userId"),
  userName: varchar("userName", { length: 255 }),
  /** Timestamp do erro */
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  /** Timestamp da resolucao */
  resolvedAt: bigint("resolvedAt", { mode: "number" }),
}, (table) => [
  index("system_error_logs_module_idx").on(table.module),
  index("system_error_logs_severity_idx").on(table.severity),
  index("system_error_logs_resolved_idx").on(table.resolved),
  index("system_error_logs_created_idx").on(table.createdAt),
]);

export type SystemErrorLog = typeof systemErrorLogs.$inferSelect;
export type InsertSystemErrorLog = typeof systemErrorLogs.$inferInsert;


/**
 * Chat history for Superestocados AI assistant.
 * Messages are stored per user per region, auto-expired after 2 days.
 */
export const superestocadosChatHistory = mysqlTable("superestocados_chat_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  region: superestoqueRegionEnum.notNull(),
  /** JSON array of messages: [{role: 'user'|'assistant', content: string, timestamp: number}] */
  messages: json("messages").notNull().$defaultFn(() => []),
  /** Session title (first user message summary) */
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userRegionIdx: index("chat_history_user_region_idx").on(table.userId, table.region),
  createdAtIdx: index("chat_history_created_at_idx").on(table.createdAt),
}));

export type SuperestocadosChatHistory = typeof superestocadosChatHistory.$inferSelect;
export type InsertSuperestocadosChatHistory = typeof superestocadosChatHistory.$inferInsert;

// ============================================================
// Envio de Parcial (submódulo Comercial) — control plane do bot WhatsApp
// ============================================================
//
// Substitui os arquivos JSON do projeto original (bot_state/bot_log/bot_qr +
// painel_output.png). O bot roda no servidor Windows local (junto do conector)
// e sincroniza por HTTPS via /api/parcial/*; o portal lê/escreve via tRPC.
//
// As tabelas são criadas por server/scripts/parcial/apply-schema.mjs (SQL puro,
// por causa do drizzle-kit dessincronizado). Estas definições servem apenas para
// a tipagem das queries — NÃO são aplicadas via drizzle-kit. Por isso `dataUrl`
// e `base64` aqui são `text()` (string), mas no banco são MEDIUMTEXT/LONGTEXT.

export const parcialStatusEnum = mysqlEnum("status", [
  "iniciando",
  "rodando",
  "pausado",
  "aguardando_qr",
  "reconectando",
  "erro_banco",
]);

/** Estado/config do bot — linha singleton (id = 1). */
export const parcialEstado = mysqlTable("parcial_estado", {
  id: int("id").primaryKey(),
  status: parcialStatusEnum.default("iniciando").notNull(),
  pausado: boolean("pausado").default(false).notNull(),
  grupo: varchar("grupo", { length: 255 }).default("SC - OpenDesk COMERCIAL").notNull(),
  cron: varchar("cron", { length: 64 }).default("0 7-19 * * 1-5").notNull(),
  horaInicio: int("horaInicio").default(7).notNull(),
  horaFim: int("horaFim").default(19).notNull(),
  /** Médias de referência por gerente: { "GV KA MICHEL": 133025.08, ... } */
  medias: json("medias").$type<Record<string, number>>(),
  /** Horários fixos de envio (horas, 0-23) nos dias úteis que não são o último do mês. */
  horariosPadrao: json("horariosPadrao").$type<number[]>(),
  /** Flag de "enviar agora": portal seta true, bot consome e zera. */
  forcarEnvio: boolean("forcarEnvio").default(false).notNull(),
  ultimoEnvio: timestamp("ultimoEnvio"),
  proximoEnvio: timestamp("proximoEnvio"),
  /** Heartbeat: o bot está conectado e reportando? */
  botOnline: boolean("botOnline").default(false).notNull(),
  ultimoHeartbeat: timestamp("ultimoHeartbeat"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Log de atividades do bot (cap de 200 linhas feito na aplicação). */
export const parcialLog = mysqlTable("parcial_log", {
  id: int("id").autoincrement().primaryKey(),
  ts: timestamp("ts").defaultNow().notNull(),
  nivel: mysqlEnum("nivel", ["ok", "info", "warn", "erro"]).default("info").notNull(),
  msg: varchar("msg", { length: 512 }).notNull(),
}, (table) => ({
  tsIdx: index("parcial_log_ts_idx").on(table.ts),
}));

/** QR Code (dataURL base64) publicado pelo bot — linha singleton (id = 1). */
export const parcialQr = mysqlTable("parcial_qr", {
  id: int("id").primaryKey(),
  dataUrl: text("dataUrl"), // MEDIUMTEXT no banco
  ts: timestamp("ts"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Última imagem gerada (PNG base64) para preview — linha singleton (id = 1). */
export const parcialImagem = mysqlTable("parcial_imagem", {
  id: int("id").primaryKey(),
  mimeType: varchar("mimeType", { length: 32 }).default("image/png").notNull(),
  base64: text("base64"), // LONGTEXT no banco
  geradoEm: timestamp("geradoEm"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParcialEstado = typeof parcialEstado.$inferSelect;
export type InsertParcialEstado = typeof parcialEstado.$inferInsert;
export type ParcialLog = typeof parcialLog.$inferSelect;
export type ParcialQr = typeof parcialQr.$inferSelect;
export type ParcialImagem = typeof parcialImagem.$inferSelect;

// ============================================================
// ENVIO DE PARCIAL — MODELO MULTI-REGIÃO (parcial_envios)
// ============================================================
//
// Substitui o singleton parcial_estado para suportar N envios (SC, RS, etc.).
// Cada envio é uma região com grupo WhatsApp, gerentes, horários e médias
// independentes. O bot itera os envios habilitados.
//
// Tabelas criadas por server/scripts/parcial/migrate-multi-envio.mjs.
// Estas definições servem apenas para tipagem (não aplicadas via drizzle-kit).

export const parcialEnvioStatusEnum = mysqlEnum("status", [
  "iniciando",
  "rodando",
  "pausado",
  "aguardando_qr",
  "reconectando",
  "erro_banco",
]);

/** Um envio de parcial (região). Cada linha = 1 grupo WhatsApp + 1 query + 1 imagem. */
export const parcialEnvios = mysqlTable("parcial_envios", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 32 }).unique().notNull(),
  nome: varchar("nome", { length: 128 }).notNull(),
  grupo: varchar("grupo", { length: 255 }).notNull(),
  /** Nomes exatos dos gerentes no ERP (usados no WHERE e na ORDEM da imagem). */
  gerentes: json("gerentes").$type<string[]>().notNull(),
  /** @deprecated Denylist antiga. Substituída por `gerentesVisiveis` (allowlist).
   *  Mantida no banco para rollback/histórico; não é mais lida pelo bot/portal. */
  gerentesOcultos: json("gerentesOcultos").$type<string[]>(),
  /** Gerências VISÍVEIS no painel completo (allowlist). Só as marcadas aparecem;
   *  gerência nova entra DESMARCADA (não aparece sozinha). NULL = legado (mostra todas). */
  gerentesVisiveis: json("gerentesVisiveis").$type<string[]>(),
  /** Base da Média diária de Venda: true = soma TODOS os vendedores da área (padrão,
   *  recorte lista todos); false = só os RCAs com pedido no momento da consulta. */
  mediaBaseTodos: boolean("mediaBaseTodos").default(true).notNull(),
  /** RCAs ocultos no recorte por área (denylist). Vazio/NULL = todos visíveis. */
  rcasOcultos: json("rcasOcultos").$type<string[]>(),
  /** {gerencia: {rca: media}} publicado pelo bot — fonte dos RCAs por área no portal. */
  mediasGerenteRca: json("mediasGerenteRca").$type<Record<string, Record<string, number>>>(),
  /** Chave que o bot usa para decidir qual SQL/filtro executar. */
  queryKey: varchar("queryKey", { length: 32 }).notNull(),
  /** Cod_Estabe para filtro SQL. */
  codEstabelecimentos: json("codEstabelecimentos").$type<number[]>().notNull(),
  horaInicio: int("horaInicio").default(7).notNull(),
  horaFim: int("horaFim").default(19).notNull(),
  horariosPadrao: json("horariosPadrao").$type<number[]>(),
  /** Médias calculadas pelo bot (read-only no portal). */
  medias: json("medias").$type<Record<string, number>>(),
  forcarEnvio: boolean("forcarEnvio").default(false).notNull(),
  pausado: boolean("pausado").default(false).notNull(),
  status: varchar("status", { length: 32 }).default("iniciando").notNull(),
  botOnline: boolean("botOnline").default(false).notNull(),
  ultimoHeartbeat: timestamp("ultimoHeartbeat"),
  ultimoEnvio: timestamp("ultimoEnvio"),
  proximoEnvio: timestamp("proximoEnvio"),
  habilitado: boolean("habilitado").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Imagem de preview por envio (1:1 com parcial_envios). */
export const parcialImagens = mysqlTable("parcial_imagens", {
  id: int("id").autoincrement().primaryKey(),
  envioId: int("envioId").notNull(),
  mimeType: varchar("mimeType", { length: 32 }).default("image/png").notNull(),
  base64: text("base64"), // LONGTEXT no banco
  geradoEm: timestamp("geradoEm"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParcialEnvio = typeof parcialEnvios.$inferSelect;
export type InsertParcialEnvio = typeof parcialEnvios.$inferInsert;
export type ParcialImagemEnvio = typeof parcialImagens.$inferSelect;

// ============================================================
// ENVIO DE PARCIAL — DESTINATÁRIOS MÚLTIPLOS (contatos/grupos)
// ============================================================
//
// Cadastro central reutilizável (parcial_contatos) + vínculo N:N com os envios
// (parcial_contato_envios), cada vínculo com o filtro de área (todos|gerencia|rca).
// Tabelas criadas por server/scripts/parcial/apply-destinatarios.mjs.

/** Contato ou grupo de WhatsApp reutilizável entre envios. */
export const parcialContatos = mysqlTable("parcial_contatos", {
  id: int("id").autoincrement().primaryKey(),
  /** "grupo" | "contato". */
  tipo: varchar("tipo", { length: 16 }).notNull(),
  /** Nome exato do grupo OU número E.164 (só dígitos) do contato. */
  identificador: varchar("identificador", { length: 255 }).notNull(),
  /** Rótulo amigável exibido no portal. */
  nome: varchar("nome", { length: 128 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tipoIdentUk: uniqueIndex("parcial_contatos_tipo_ident_uk").on(table.tipo, table.identificador),
}));

/** Vínculo N:N contato↔envio + filtro de áreas (personalização). */
export const parcialContatoEnvios = mysqlTable("parcial_contato_envios", {
  id: int("id").autoincrement().primaryKey(),
  contatoId: int("contatoId").notNull(),
  envioId: int("envioId").notNull(),
  /** "todos" (painel cheio) | "gerencia" | "rca". */
  filtroTipo: varchar("filtroTipo", { length: 16 }).default("todos").notNull(),
  /** Lista de gerências/RCAs; vazia quando filtroTipo="todos". */
  filtroValores: json("filtroValores").$type<string[]>().notNull(),
  habilitado: boolean("habilitado").default(true).notNull(),
  /** Flag "enviar/testar só para este destino" (read-and-clear no heartbeat). */
  forcarEnvio: boolean("forcarEnvio").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  contatoEnvioUk: uniqueIndex("parcial_contato_envios_uk").on(table.contatoId, table.envioId),
  envioIdx: index("parcial_contato_envios_envio_idx").on(table.envioId),
}));

/** Preview por recorte: 1 linha por filtro distinto de um envio (painel + áreas). */
export const parcialPreviews = mysqlTable("parcial_previews", {
  id: int("id").autoincrement().primaryKey(),
  envioId: int("envioId").notNull(),
  /** Assinatura do filtro: "completo" ou "gerencia:AREA1|AREA2". */
  sig: varchar("sig", { length: 80 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 32 }).default("image/png").notNull(),
  base64: text("base64"), // LONGTEXT no banco
  geradoEm: timestamp("geradoEm"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  envioSigUk: uniqueIndex("parcial_previews_envio_sig_uk").on(table.envioId, table.sig),
}));

/** Lista de grupos do WhatsApp publicada pelo bot (singleton id=1). */
export const parcialGruposWa = mysqlTable("parcial_grupos_wa", {
  id: int("id").primaryKey(),
  grupos: json("grupos").$type<string[]>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ParcialContato = typeof parcialContatos.$inferSelect;
export type InsertParcialContato = typeof parcialContatos.$inferInsert;
export type ParcialContatoEnvio = typeof parcialContatoEnvios.$inferSelect;
export type InsertParcialContatoEnvio = typeof parcialContatoEnvios.$inferInsert;
export type ParcialGruposWa = typeof parcialGruposWa.$inferSelect;
export type ParcialPreview = typeof parcialPreviews.$inferSelect;

/* ─────────────────────────────────────────────────────────────────────────────
 * Validades Curtas — snapshot de TODOS os produtos com lote e vencimento
 * Alimentado pelo sync (fetchProdutosEstoque) sem filtros de superestocados.
 * ────────────────────────────────────────────────────────────────────────── */

export const validadesCurtasRegionEnum = mysqlEnum("vcRegion", ["SC", "RS"]);
export const validadesCurtasTipoEnum = mysqlEnum("vcTipoProduto", ["medicamento", "nao_medicamento"]);

export const validadesCurtasItens = mysqlTable("validades_curtas_itens", {
  id: int("id").autoincrement().primaryKey(),
  codigo: int("codigo").notNull(),
  region: validadesCurtasRegionEnum.notNull(),
  tipoProduto: validadesCurtasTipoEnum.notNull().default("medicamento"),
  nomeProduto: varchar("nomeProduto", { length: 255 }).notNull(),
  fornecedor: varchar("fornecedor", { length: 255 }).notNull(),
  codLote: varchar("codLote", { length: 64 }).notNull(),
  vencimentoLote: date("vencimentoLote", { mode: "string" }).notNull(),
  estoqueLote: int("estoqueLote").notNull().default(0),
  estoqueTotal: int("estoqueTotal").notNull().default(0),
  vendaMedia: double("vendaMedia").notNull().default(0),
  valorCusto: double("valorCusto"),
  valorEstoqueCusto: double("valorEstoqueCusto"),
  diasEstoque: double("diasEstoque").notNull().default(0),
  dataUltimaCompra: varchar("dataUltimaCompra", { length: 32 }),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => ({
  codigoRegionLoteUnique: uniqueIndex("vc_codigo_region_lote_uk").on(table.codigo, table.region, table.codLote),
  regionIdx: index("vc_region_idx").on(table.region),
  vencimentoIdx: index("vc_vencimento_idx").on(table.vencimentoLote),
  tipoProdutoIdx: index("vc_tipo_produto_idx").on(table.tipoProduto),
  fornecedorIdx: index("vc_fornecedor_idx").on(table.fornecedor),
}));

export type ValidadesCurtasItem = typeof validadesCurtasItens.$inferSelect;
export type InsertValidadesCurtasItem = typeof validadesCurtasItens.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR DE INTEGRAÇÕES (Indicadores) — prefixo `monarq_`
// Espelho de tipagem das tabelas criadas por server/scripts/monitor-arquivos/apply-schema.mjs.
// Ver docs/monitor-arquivos-handoff.md. O CÉREBRO (máquina de estados/SLA/alertas) vive no
// portal (server/monitorArquivosControlPlane.ts); o coletor e o WA gateway são agentes na VM.
// ═══════════════════════════════════════════════════════════════════════════

/** Um caminho monitorado + suas regras (editável na modal do painel). */
export const monarqConfig = mysqlTable("monarq_config", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull(),
  caminho: varchar("caminho", { length: 512 }).notNull(),
  /** 'pedidos' (máquina de estados .ped→._RM) | 'geracao' (presença/deadline, Fase 4). */
  tipoMonitoramento: varchar("tipoMonitoramento", { length: 16 }).default("pedidos").notNull(),
  /** Extensões que significam "caiu, não lido" (ex.: ['.txt','.ped','.pnn']). */
  extensoesPendente: json("extensoesPendente").$type<string[]>().notNull(),
  /** Extensão que significa "lido pelo ERP" (ex.: '._rm'). */
  extensaoLida: varchar("extensaoLida", { length: 32 }).default("._RM").notNull(),
  intervaloVarreduraSeg: int("intervaloVarreduraSeg").default(60).notNull(),
  /** 🔴 min. sem virar lido após cair → atrasado + WhatsApp. */
  slaLeituraMin: int("slaLeituraMin").default(30).notNull(),
  /** 🟡 min. sem cair pedido novo (dentro da janela) → amarelo (só visual). */
  gapSemPedidoMin: int("gapSemPedidoMin").default(60).notNull(),
  /** Re-alerta a cada N min enquanto seguir atrasado. */
  realertaMin: int("realertaMin").default(30).notNull(),
  /** Agenda (ver @shared/agenda): dias 0=dom..6=sáb + janela [horaInicio, horaFim). */
  diasSemana: json("diasSemana").$type<number[]>(),
  horaInicio: int("horaInicio").default(0).notNull(),
  horaFim: int("horaFim").default(24).notNull(),
  /** Conta do WA gateway usada para enviar os alertas deste caminho (multi-conta futuro). */
  waContaId: varchar("waContaId", { length: 64 }).default("monitor").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  ultimaVarreduraEm: timestamp("ultimaVarreduraEm"),
  /** mtime da PRÓPRIA pasta (fallback visual quando não há arquivos reconhecidos). */
  ultimaPastaMtime: timestamp("ultimaPastaMtime"),
  /** Estado do ALERTA AGREGADO por integração (1 mensagem, não por evento). `*Em` = início do ciclo
   * de alerta atual (null = não alertando); `*UltimoEm` = último envio (alerta/re-alerta). */
  alertaPedidoEm: timestamp("alertaPedidoEm"),
  alertaPedidoUltimoEm: timestamp("alertaPedidoUltimoEm"),
  alertaListaEm: timestamp("alertaListaEm"),
  alertaListaUltimoEm: timestamp("alertaListaUltimoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  ativoIdx: index("monarq_config_ativo_idx").on(table.ativo),
}));

/** Máquina de estados por arquivo (= um pedido). Chave natural (configId, nomeBase). */
export const monarqEvento = mysqlTable("monarq_evento", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull().references(() => monarqConfig.id, { onDelete: "cascade" }),
  nomeBase: varchar("nomeBase", { length: 255 }).notNull(),
  arquivoPendente: varchar("arquivoPendente", { length: 300 }),
  extensaoPendente: varchar("extensaoPendente", { length: 32 }),
  /** mtime do arquivo pendente (quando o pedido caiu). */
  caiuEm: timestamp("caiuEm").notNull(),
  /** Observação da transição para a extensão lida (quando o ERP leu). */
  lidoEm: timestamp("lidoEm"),
  /** 'pendente' | 'atrasado' | 'lido'. */
  estado: varchar("estado", { length: 16 }).default("pendente").notNull(),
  alertadoEm: timestamp("alertadoEm"),
  ultimoAlertaEm: timestamp("ultimoAlertaEm"),
  resolvidoAvisado: boolean("resolvidoAvisado").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  configBaseUnique: uniqueIndex("monarq_evento_config_base_unique").on(table.configId, table.nomeBase),
  configEstadoIdx: index("monarq_evento_config_estado_idx").on(table.configId, table.estado),
  configCaiuIdx: index("monarq_evento_config_caiu_idx").on(table.configId, table.caiuEm),
}));

/**
 * Modo 'geracao' (Fase 4): uma LISTA a acompanhar (preço/estoque/rota…) dentro de uma integração
 * (monarq_config). Config-mãe → N listas, cada uma com caminho + extensões + horário limite (deadline).
 * "Gerada" = arquivo da extensão com mtime de HOJE (SP). Estado do dia dirigido por snapshot.
 */
export const monarqLista = mysqlTable("monarq_lista", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull().references(() => monarqConfig.id, { onDelete: "cascade" }),
  rotulo: varchar("rotulo", { length: 120 }).notNull(),
  caminho: varchar("caminho", { length: 512 }).notNull(),
  /** Como identificar a geração: 'extensao' (conta arquivos da extensão) | 'nome' (nome exato). */
  modoIdentificacao: varchar("modoIdentificacao", { length: 12 }).default("extensao").notNull(),
  /** Nome exato do arquivo esperado (modo 'nome'). */
  nomeArquivo: varchar("nomeArquivo", { length: 300 }),
  /** Extensões que contam como a lista (ex.: ['.csv','.txt']) — modo 'extensao'. */
  extensoes: json("extensoes").$type<string[]>().notNull(),
  /** Quantos arquivos da extensão devem ser gerados no dia (modo 'extensao'). */
  quantidadeEsperada: int("quantidadeEsperada").default(1).notNull(),
  /** Horário limite (deadline) em hora:minuto de parede SP. Não gerada até lá → 🔴 + WhatsApp. */
  horaAlvo: int("horaAlvo").default(8).notNull(),
  minutoAlvo: int("minutoAlvo").default(0).notNull(),
  /** Re-alerta a cada N min enquanto seguir sem gerar. */
  realertaMin: int("realertaMin").default(60).notNull(),
  /** Ordem de exibição no formulário/detalhe. */
  ordem: int("ordem").default(0).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  /** Quantos arquivos válidos foram observados hoje (última varredura) — para "X/Y gerados". */
  qtdGeradaHoje: int("qtdGeradaHoje").default(0).notNull(),
  /** Como a geração foi detectada hoje: 'arquivo' (reconheceu o arquivo) | 'pasta' (mtime da pasta). */
  deteccao: varchar("deteccao", { length: 10 }),
  /** mtime do arquivo mais recente gerado hoje — fonte do "gerada às". */
  ultimaGeracaoEm: timestamp("ultimaGeracaoEm"),
  ultimoArquivo: varchar("ultimoArquivo", { length: 300 }),
  ultimaVarreduraEm: timestamp("ultimaVarreduraEm"),
  /** Dia SP corrente da régua ('AAAA-MM-DD') — usado para resetar o estado do dia. */
  diaRef: varchar("diaRef", { length: 10 }),
  /** 'aguardando' | 'gerado' | 'atrasado' (dedupe de alerta/resolvido). */
  estadoDia: varchar("estadoDia", { length: 16 }).default("aguardando").notNull(),
  alertadoEm: timestamp("alertadoEm"),
  ultimoAlertaEm: timestamp("ultimoAlertaEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  configIdx: index("monarq_lista_config_idx").on(table.configId),
  ativoIdx: index("monarq_lista_ativo_idx").on(table.ativo),
}));

/** Destino WhatsApp reutilizável (grupo|contato), por conta do gateway. */
export const monarqDestino = mysqlTable("monarq_destino", {
  id: int("id").autoincrement().primaryKey(),
  waContaId: varchar("waContaId", { length: 64 }).default("monitor").notNull(),
  /** 'grupo' | 'contato'. */
  tipo: varchar("tipo", { length: 8 }).notNull(),
  /** Nome do grupo / número E.164 do contato. */
  identificador: varchar("identificador", { length: 255 }).notNull(),
  nome: varchar("nome", { length: 160 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  /** Destino UNIVERSAL: recebe os alertas de TODAS as integrações (além dos vínculos por caminho). */
  universal: boolean("universal").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  contaTipoIdentUnique: uniqueIndex("monarq_destino_conta_tipo_ident_unique").on(
    table.waContaId,
    table.tipo,
    table.identificador,
  ),
}));

/** N:N: quais destinos recebem os alertas de cada caminho. */
export const monarqConfigDestino = mysqlTable("monarq_config_destino", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull().references(() => monarqConfig.id, { onDelete: "cascade" }),
  destinoId: int("destinoId").notNull().references(() => monarqDestino.id, { onDelete: "cascade" }),
  habilitado: boolean("habilitado").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  configDestinoUnique: uniqueIndex("monarq_config_destino_unique").on(table.configId, table.destinoId),
  destinoIdx: index("monarq_config_destino_destino_idx").on(table.destinoId),
}));

/** Fila de saída WhatsApp: o cérebro enfileira, o WA gateway drena (read-and-clear). */
export const monarqWaOutbox = mysqlTable("monarq_wa_outbox", {
  id: int("id").autoincrement().primaryKey(),
  waContaId: varchar("waContaId", { length: 64 }).default("monitor").notNull(),
  tipo: varchar("tipo", { length: 8 }).notNull(),
  identificador: varchar("identificador", { length: 255 }).notNull(),
  mensagem: text("mensagem").notNull(),
  eventoId: int("eventoId"),
  /** 'alerta' | 'realerta' | 'resolvido'. */
  categoria: varchar("categoria", { length: 16 }).default("alerta").notNull(),
  /** 'pendente' | 'enviado' | 'erro'. */
  status: varchar("status", { length: 12 }).default("pendente").notNull(),
  tentativas: int("tentativas").default(0).notNull(),
  erro: varchar("erro", { length: 512 }),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  enviadoEm: timestamp("enviadoEm"),
}, (table) => ({
  statusIdx: index("monarq_wa_outbox_status_idx").on(table.status, table.criadoEm),
}));

/** Heartbeat do coletor (singleton id=1) — evita "verde falso" com o agente caído. */
export const monarqColetor = mysqlTable("monarq_coletor", {
  id: int("id").primaryKey(),
  online: boolean("online").default(false).notNull(),
  ultimoHeartbeat: timestamp("ultimoHeartbeat"),
  versao: varchar("versao", { length: 32 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Conta de WhatsApp do WA Gateway (Fase 2). `id` = waContaId (ex.: 'monitor'). O gateway na VM
 * publica QR/status/grupos e drena a fila daquela conta. Multi-conta = mais linhas.
 */
export const monarqWaConta = mysqlTable("monarq_wa_conta", {
  id: varchar("id", { length: 64 }).primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull(),
  /** 'aguardando_qr' | 'conectado' | 'reconectando' | 'desconectado' | 'erro'. */
  status: varchar("status", { length: 24 }).default("aguardando_qr").notNull(),
  /** QR (dataURL) publicado pelo gateway quando precisa parear; limpo ao conectar. */
  qrDataUrl: text("qrDataUrl"),
  qrTs: timestamp("qrTs"),
  /** Lista de grupos do WhatsApp publicada pelo gateway (para conferência/seleção). */
  grupos: json("grupos").$type<string[]>(),
  online: boolean("online").default(false).notNull(),
  ultimoHeartbeat: timestamp("ultimoHeartbeat"),
  /** Flag one-shot: portal pede logout/re-pareamento; consumida no heartbeat. */
  logoutSolicitado: boolean("logoutSolicitado").default(false).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Log de eventos do módulo (auditoria/depuração). Cap 200 na aplicação. */
export const monarqLog = mysqlTable("monarq_log", {
  id: int("id").autoincrement().primaryKey(),
  ts: timestamp("ts").defaultNow().notNull(),
  nivel: varchar("nivel", { length: 8 }).default("info").notNull(),
  msg: varchar("msg", { length: 512 }).notNull(),
}, (table) => ({
  tsIdx: index("monarq_log_ts_idx").on(table.ts),
}));

/**
 * Backup de pedidos por RETENÇÃO (singleton id=1). Ajustes pelo portal: extensões, quantos dias
 * manter na pasta (úteis/corridos) e a retenção dos zips em meses. O agendamento é da VM (systemd).
 * As colunas `ultimo*` guardam o resultado do último backup para a notificação + a linha
 * "só leitura" no painel.
 */
export const monarqBackupConfig = mysqlTable("monarq_backup_config", {
  id: int("id").primaryKey(),
  /** Extensões que são arquivadas e SAEM da pasta (default ['._rm']; admin adiciona extras). */
  extensoesZip: json("extensoesZip").$type<string[]>(),
  /** Manter na pasta os últimos N dias; o mais antigo é arquivado. */
  manterDias: int("manterDias").default(5).notNull(),
  /** Unidade de `manterDias`: 'uteis' (seg–sex) | 'corridos'. */
  manterUnidade: varchar("manterUnidade", { length: 8 }).default("uteis").notNull(),
  /** Apaga pastas-mês de backup mais velhas que isto (meses). */
  retencaoZipMeses: int("retencaoZipMeses").default(12).notNull(),
  /** Caminhos EXTRAS a arquivar (ex.: pastas de listas), cada um com a própria extensão. A
   * retenção/poda é a mesma dos pedidos. Estrutura pronta pra escalar (por-caminho). */
  caminhosExtras: json("caminhosExtras").$type<{ caminho: string; extensoes: string[] }[]>(),
  /** Data de corte usada no último backup ('AAAA-MM-DD'). */
  ultimoCorte: varchar("ultimoCorte", { length: 10 }),
  ultimaExecucaoEm: timestamp("ultimaExecucaoEm"),
  ultimoOk: boolean("ultimoOk"),
  ultimoResumo: json("ultimoResumo").$type<{
    pastas: number;
    arquivos: number;
    zips: number;
    podados: number;
  }>(),
  ultimoErros: json("ultimoErros").$type<{ caminho: string; erro: string }[]>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Config (singleton) do RESUMO DIÁRIO por imagem no WhatsApp. O cérebro monta o cenário
 * (pedidos + listas) e enfileira em monarq_wa_outbox (categoria='resumo') quando passa de
 * `hora:minuto` (fuso SP) num dia marcado e ainda não enviou hoje (`diaRef`). `destinoIds`
 * vazio = destinos universais. Ver docs/monitor-arquivos-handoff.md.
 */
export const monarqResumoConfig = mysqlTable("monarq_resumo_config", {
  id: int("id").primaryKey(),
  ativo: boolean("ativo").default(false).notNull(),
  /** Horário-alvo do envio (fuso America/Sao_Paulo). */
  hora: int("hora").default(21).notNull(),
  minuto: int("minuto").default(0).notNull(),
  /** Dias marcados (0=dom … 6=sáb, padrão JS). Vazio = nunca envia. */
  diasSemana: json("diasSemana").$type<number[]>(),
  incluirPedidos: boolean("incluirPedidos").default(true).notNull(),
  incluirListas: boolean("incluirListas").default(true).notNull(),
  /** Destinos WhatsApp específicos; vazio/nulo = todos os universais. */
  destinoIds: json("destinoIds").$type<number[]>(),
  /** Data (SP, 'AAAA-MM-DD') do último envio — guard "1x por dia". */
  diaRef: varchar("diaRef", { length: 10 }),
  ultimoEnvioEm: timestamp("ultimoEnvioEm"),
  ultimoOk: boolean("ultimoOk"),
  ultimoDetalhe: varchar("ultimoDetalhe", { length: 512 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/* ─── Alerta EM TELA de pedidos travados (Monitor de Integrações) ──────────────
 * Singleton (id=1). Define QUEM (usuários do portal) vê o overlay/aba/som quando
 * QUALQUER integração de PEDIDOS fica vermelha (SLA estourado). Listas ficam de fora.
 * O WhatsApp agregado por integração segue independente (monarq_config.alerta*Em).
 */
export const monarqAlertaTelaConfig = mysqlTable("monarq_alerta_tela_config", {
  id: int("id").primaryKey(),
  /** Liga/desliga o alerta em tela (não afeta o WhatsApp). */
  ativo: boolean("ativo").default(true).notNull(),
  /** IDs de usuários do portal que veem o alerta em tela (overlay + aba + som). */
  destinatarioIds: json("destinatarioIds").$type<number[]>(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MonarqAlertaTelaConfig = typeof monarqAlertaTelaConfig.$inferSelect;

export type MonarqConfig = typeof monarqConfig.$inferSelect;
export type InsertMonarqConfig = typeof monarqConfig.$inferInsert;
export type MonarqEvento = typeof monarqEvento.$inferSelect;
export type MonarqLista = typeof monarqLista.$inferSelect;
export type InsertMonarqLista = typeof monarqLista.$inferInsert;
export type MonarqDestino = typeof monarqDestino.$inferSelect;
export type MonarqConfigDestino = typeof monarqConfigDestino.$inferSelect;
export type MonarqWaOutbox = typeof monarqWaOutbox.$inferSelect;
export type MonarqWaConta = typeof monarqWaConta.$inferSelect;
export type MonarqBackupConfig = typeof monarqBackupConfig.$inferSelect;
export type MonarqResumoConfig = typeof monarqResumoConfig.$inferSelect;

/**
 * Histórico diário de processamento por integração (últimos 30 dias úteis).
 * Uma linha por (configId, dia). Upsert no processarSnapshot; poda inline (> 45 dias corridos).
 */
export const monarqHistoricoDia = mysqlTable("monarq_historico_dia", {
  id: int("id").autoincrement().primaryKey(),
  configId: int("configId").notNull().references(() => monarqConfig.id, { onDelete: "cascade" }),
  /** Dia no fuso SP (YYYY-MM-DD). */
  dia: varchar("dia", { length: 10 }).notNull(),
  /** true se ao menos 1 arquivo pendente caiu neste dia. */
  tevePedido: boolean("tevePedido").default(false).notNull(),
  /** Quantidade de arquivos pendentes que caíram neste dia. */
  qtdPedidos: int("qtdPedidos").default(0).notNull(),
  /** Quantidade de arquivos lidos (._RM) neste dia. */
  qtdLidos: int("qtdLidos").default(0).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  configDiaIdx: uniqueIndex("monarq_historico_dia_config_dia_idx").on(table.configId, table.dia),
}));
export type MonarqHistoricoDia = typeof monarqHistoricoDia.$inferSelect;

/* ─── Alerta CFV (Pedidos por Layout) ─────────────────────────────────────────
 * Configuração do alerta global que avisa quando o layout CFV fica sem pedidos
 * por mais de X minutos. Singleton (1 row). Destinatários = IDs de usuários.
 */
export const indicadoresAlertaCfvConfig = mysqlTable("indicadores_alerta_cfv_config", {
  id: int("id").autoincrement().primaryKey(),
  /** Layouts monitorados (ex.: ["CFV"]). */
  layouts: json("layouts").$type<string[]>().notNull(),
  /** Regiões monitoradas (ex.: ["SC","RS"]). */
  regioes: json("regioes").$type<string[]>().notNull(),
  /** Minutos sem pedido para disparar o alerta. */
  gapMinutos: int("gapMinutos").default(30).notNull(),
  /** Hora início da janela de monitoramento (0-23, fuso SP). */
  horaInicio: int("horaInicio").default(8).notNull(),
  /** Hora fim da janela de monitoramento (0-23, fuso SP). */
  horaFim: int("horaFim").default(18).notNull(),
  /** Dias da semana ativos (0=dom..6=sáb). */
  diasSemana: json("diasSemana").$type<number[]>().notNull(),
  /** IDs dos usuários que receberão o alerta overlay (canal EM TELA). */
  destinatarioIds: json("destinatarioIds").$type<number[]>().notNull(),
  /** IDs de destinos WhatsApp (monarq_destino) que recebem o alerta por WhatsApp. */
  destinoIds: json("destinoIds").$type<number[]>(),
  /** Intervalo (min) para RE-alertar no WhatsApp enquanto o alerta persistir. */
  waRealertaMin: int("waRealertaMin").default(60).notNull(),
  /** Início do ciclo de alerta WhatsApp atual (null = sem alerta ativo). Estado do disparo server-side. */
  waAlertaEm: timestamp("waAlertaEm"),
  /** Último envio de WhatsApp do alerta (para o re-alerta). */
  waUltimoAlertaEm: timestamp("waUltimoAlertaEm"),
  ativo: boolean("ativo").default(true).notNull(),
  criadoEm: timestamp("criadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
});
export type IndicadoresAlertaCfvConfig = typeof indicadoresAlertaCfvConfig.$inferSelect;

/**
 * Histórico do painel "Pedidos por Layout" (Indicadores). Fotos periódicas (30 min, janela
 * 08:00–22:00 SP) do agregado por (dia, hhmm, estado, layout) — habilita comparação vs. período
 * anterior + sparkline (mesmo-horário-do-dia). Só SC/RS (Unificado = soma na leitura). UPSERT por
 * slot. Ver server/scripts/indicadores/apply-schema.mjs e docs/indicadores-handoff.md.
 */
export const indicadoresPedidoLayoutHist = mysqlTable("indicadores_pedido_layout_hist", {
  id: int("id").autoincrement().primaryKey(),
  /** Dia SP 'AAAA-MM-DD'. */
  dia: varchar("dia", { length: 10 }).notNull(),
  /** Slot de 30 min 'HH:MM' (fuso SP): '08:00'…'22:00'. */
  hhmm: varchar("hhmm", { length: 5 }).notNull(),
  estado: varchar("estado", { length: 8 }).notNull(),
  layout: varchar("layout", { length: 120 }).notNull(),
  qtdPedidos: int("qtdPedidos").default(0).notNull(),
  valorPedido: double("valorPedido").default(0).notNull(),
  qtdCortados: int("qtdCortados").default(0).notNull(),
  valorCortados: double("valorCortados").default(0).notNull(),
  /** Total de pedidos do dia (query 1018 — todos os status). */
  qtdTotal: int("qtdTotal").default(0).notNull(),
  capturadoEm: timestamp("capturadoEm").defaultNow().notNull(),
}, (table) => ({
  diaHhmmEstadoLayout: uniqueIndex("ipl_hist_dia_hhmm_estado_layout_unique").on(
    table.dia, table.hhmm, table.estado, table.layout,
  ),
}));
export type IndicadoresPedidoLayoutHist = typeof indicadoresPedidoLayoutHist.$inferSelect;
