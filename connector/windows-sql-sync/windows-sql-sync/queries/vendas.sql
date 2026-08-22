/*
  Consulta COMPLETA de vendas por região — banco DMD (NFSCB + NFSIT).
  Traz os últimos 15 DIAS ÚTEIS com CROSS JOIN para garantir que todos
  os produtos retornem quantidade (0 quando não houve venda no dia).

  Usada como BOOTSTRAP quando a região não possui dados de vendas no painel.
  No fluxo normal diário, o connector usa vendas-incremental.sql.

  O conector exige exatamente estes aliases no resultado:
    codigo, nomeProduto, dataVenda, quantidade

  Placeholders disponíveis:
    {{cod_estabe}}            -> código do estabelecimento (1 = SC, 2 = RS)
    {{product_codes}}         -> lista de códigos separados por vírgula (ex: 123,456,789)
    {{product_codes_values}}  -> lista no formato VALUES (ex: (123),(456),(789))
*/

WITH DatasCalculadas AS (
    -- Geramos 30 dias passados para garantir que encontraremos 15 dias úteis
    SELECT 
        CAST(GETDATE() AS DATE) AS DataFiltro,
        1 AS Contador
    UNION ALL
    SELECT 
        DATEADD(day, -1, DataFiltro),
        Contador + 1
    FROM DatasCalculadas
    WHERE Contador < 30
),
DiasUteis AS (
    -- Filtramos apenas dias de semana (Segunda a Sexta)
    SELECT DataFiltro
    FROM DatasCalculadas
    WHERE ((DATEPART(dw, DataFiltro) + @@DATEFIRST - 1) % 7) NOT IN (0, 6)
),
LimiteDiasUteis AS (
    -- Pegamos exatamente os últimos 15 dias úteis
    SELECT TOP 15 DataFiltro
    FROM DiasUteis
    ORDER BY DataFiltro DESC
),
ProdutosList AS (
    -- Lista de produtos do painel (via placeholder do connector)
    SELECT v.codigo
    FROM (VALUES {{product_codes_values}}) AS v(codigo)
)

SELECT
  p.codigo                                        AS codigo,
  ''                                              AS nomeProduto,
  CONVERT(VARCHAR(10), d.DataFiltro, 23)          AS dataVenda,
  ISNULL(SUM(it.Qtd_Produto), 0)                  AS quantidade
FROM
  ProdutosList p
CROSS JOIN
  LimiteDiasUteis d
LEFT JOIN
  DMD.dbo.NFSCB cb
    ON cb.Cod_Estabe = {{cod_estabe}}
    AND CAST(cb.Dat_Emissao AS DATE) = d.DataFiltro
    AND cb.Status = 'F'
LEFT JOIN
  DMD.dbo.NFSIT it
    ON  cb.Ser_Nota   = it.Ser_Nota
    AND cb.Num_Nota   = it.Num_Nota
    AND cb.Cod_Estabe = it.Cod_Estabe
    AND it.Cod_Produto = p.codigo
GROUP BY
  p.codigo,
  d.DataFiltro
ORDER BY
  dataVenda DESC,
  p.codigo;
