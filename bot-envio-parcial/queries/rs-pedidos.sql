select

'OpenDesk RS' as Empresa,
ge.Descricao as Gerente,
ve.Nome_Guerra as Rca,
SUM(CONVERT(MONEY, Vlr_SubsTrib,0)) as ValorST,
SUM(CONVERT(MONEY, C_VlrPedido,0)) as ValorPedidos,
SUM(CONVERT(MONEY, C_VlrPedido,0)) - SUM(CONVERT(MONEY, Vlr_SubsTrib,0)) as ValorSemST,

sum(
case when Cod_OrigemPdv in ('ML','MF') then 1 else 0 end) as QtdPalm


from PDVCB  pd
left join VENDE ve on pd.Cod_Vendedor = ve.Codigo
left join GEREN ge on ve.Cod_Gerencia = ge.Codigo

where Status1 <> 'C'
and Tip_Faturamento = 'FAT'
and Dat_Pedido >= CAST(GETDATE() AS DATE) and Dat_Pedido < CAST(DATEADD(DAY,1,GETDATE()) AS DATE)
and C_VlrPedido > 0
and Cod_Estabe in (2)



group by 
ge.Descricao, ve.Nome_Guerra
order by SUM(CONVERT(MONEY, C_VlrPedido,0)) desc
