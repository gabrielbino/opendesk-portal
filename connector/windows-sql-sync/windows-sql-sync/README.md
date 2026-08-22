# OpenDesk Windows SQL Connector

Este conector lê consultas do SQL Server localmente e envia os resultados ao painel por HTTPS.

## Fluxo resumido

1. O arquivo `.env` define a conexão SQL e a URL do painel.
2. O arquivo `config/jobs.json` define quais jobs serão executados.
3. Cada job aponta para um arquivo `.sql` em `queries/`.
4. O conector executa as consultas, valida as colunas esperadas e publica a carga em `/api/connector/sync`.
5. Logs ficam em `04_Logs/` e o estado incremental fica em `state/`.

## Comandos

```bash
npm install
npm run check-config
npm run dry-run
npm start
```

## Jobs flexíveis

As consultas **não ficam presas no código**. Vocês podem trocar os arquivos SQL, desde que respeitem os aliases exigidos para cada `kind`.

| kind | Colunas obrigatórias |
|---|---|
| medicamentos | `codigo`, `nomeProduto`, `fornecedor`, `diasEstoque`, `estoqueAtual`, `valorCusto`, `vendaMedia` |
| vendas | `codigo`, `nomeProduto`, `dataVenda`, `quantidade` |
| lotes | `codEstabe`, `codProduto`, `codLote`, `vencimentoLote`, `qtdVendida`, `estoqueLote` |

## Jobs de lotes

Os jobs de lotes consultam a tabela `PRLOT` do SQL Server para obter informações de lote (código, vencimento, estoque do lote) e vendas/devoluções recentes por lote. O conector busca automaticamente os códigos de produtos cadastrados no painel antes de executar a consulta SQL.

A configuração em `jobs.json` segue o mesmo padrão dos demais jobs:

```json
{
  "key": "lotes-sc",
  "enabled": true,
  "kind": "lotes",
  "region": "SC",
  "sqlFile": "../queries/lotes.sql",
  "trackState": true,
  "variables": {
    "empresa": "SC",
    "cod_estabe": "1"
  }
}
```

O campo `tipoProduto` é opcional e pode ser usado para filtrar apenas medicamentos ou não medicamentos:

```json
{
  "key": "lotes-sc-medicamentos",
  "kind": "lotes",
  "region": "SC",
  "tipoProduto": "medicamento",
  "sqlFile": "../queries/lotes.sql",
  "trackState": true,
  "variables": { "cod_estabe": "1" }
}
```

## Ordem de execução recomendada

Os jobs devem ser executados na seguinte ordem para garantir que os dados estejam disponíveis:

1. **Medicamentos** (SC e RS) — cadastra os produtos no painel
2. **Vendas** (SC e RS) — registra vendas diárias dos produtos
3. **Lotes** (SC e RS) — consulta lotes dos produtos já cadastrados

## Execução individual

Para executar apenas um job específico:

```bash
node src/index.mjs --job=lotes-sc
node src/index.mjs --job=lotes-rs
node src/index.mjs --job=lotes-sc --dry-run
```

## Jobs de atualização via CSV

Os jobs `csv-update-sc` e `csv-update-rs` leem arquivos CSV diretamente da rede (caminho UNC) e atualizam os campos dos produtos **já cadastrados** no painel. Não inserem produtos novos nem deletam existentes.

| kind | Campos atualizados |
|---|---|
| csv-update | `nomeProduto`, `fornecedor`, `dataUltimaCompra`, `diasEstoque`, `estoqueAtual`, `valorCusto`, `vendaMedia` |

Configuração em `jobs.json`:

```json
{
  "key": "csv-update-sc",
  "enabled": true,
  "kind": "csv-update",
  "region": "SC",
  "csvFile": "\\\\10.0.0.10\\Dados\\Repostorio\\TI\\Painel_SE_VendasDiarias\\dias_estoque_sc.csv",
  "trackState": true,
  "variables": {}
}
```

O CSV deve usar separador `;`, encoding `latin1/windows-1252`, e os campos:
- `Código` (int)
- `Nome Produto` (texto)
- `Fornecedor` (texto)
- `Data Última Compra` (DD/MM/YYYY ou vazio)
- `Dias de Estoque (Unidades)` (int)
- `Qtd em Estoque` (int)
- `Valor Estoque Custo` (decimal com vírgula)
- `Qtd Venda Média Mês` (decimal com vírgula)

## Ordem de execução recomendada (atualizada)

1. **Medicamentos** (SC e RS) — cadastra os produtos no painel
2. **CSV Update** (SC e RS) — atualiza dias de estoque, venda média, etc. dos produtos existentes
3. **Vendas** (SC e RS) — registra vendas diárias dos produtos
4. **Lotes** (SC e RS) — consulta lotes dos produtos já cadastrados

## Scripts Windows

| Script | Uso |
|---|---|
| `scripts\run-now.cmd` | Executa manualmente todos os jobs |
| `scripts\run-csv-update.cmd` | Executa apenas os jobs CSV (SC + RS) |
| `scripts\install-task.ps1` | Instala tarefas agendadas no Windows (seg-sex 07:00) |
