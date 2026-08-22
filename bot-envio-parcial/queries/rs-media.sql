select 
gerente,
rca,
Dia1,
Dia2,
Dia3,
Dia4,
Dia5,

case
when (Dia1+Dia2+Dia3+Dia4+Dia5) > 0 then
(Dia1+Dia2+Dia3+Dia4+Dia5)/
(
(case when Dia1>0 then 1 else 0 end)+
(case when Dia2>0 then 1 else 0 end)+
(case when Dia3>0 then 1 else 0 end)+
(case when Dia4>0 then 1 else 0 end)+
(case when Dia5>0 then 1 else 0 end)
)
else 0 end as MediaVenda


from(

select

ge.descricao as gerente,
ve.nome_guerra as rca,

isnull(
case datepart(w,getdate())
when 1 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-2,103))
when 2 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-3,103))
else (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-1,103))
        end,0) as Dia1,

isnull(
case 
when datepart(w,getdate()) = 1 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-3,103))
when datepart(w,getdate()) = 2 or datepart(w,getdate()) = 3 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-4,103))
else (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-2,103))
        end,0) as Dia2,

isnull(
case 
when datepart(w,getdate()) = 1 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-4,103))
when datepart(w,getdate()) = 2 or datepart(w,getdate()) = 3 or datepart(w,getdate()) = 4 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-5,103))
else (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-3,103))
        end,0) as Dia3,

isnull(
case 
when datepart(w,getdate()) = 1 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-5,103))
when datepart(w,getdate()) = 2 or datepart(w,getdate()) = 3 or datepart(w,getdate()) = 4 or datepart(w,getdate()) = 5 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-6,103))
else (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-4,103))
        end,0) as Dia4,

isnull(
case 
when datepart(w,getdate()) = 1 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-6,103))
when datepart(w,getdate()) = 7 then (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-5,103))
else (select convert(money, sum((it.Vlr_LiqItem-it.Vlr_RecSbt-it.Vlr_SubsTrib-it.Vlr_DespRateada-it.Vlr_SubsTribEmb-isnull(it.Vlr_SbtRes,0))))
            from NFSCB nf left join NFSIT it on nf.Num_Nota = it.Num_Nota and nf.Ser_Nota = it.Ser_Nota and nf.Cod_Estabe = it.Cod_Estabe 
            where nf.Cod_Vendedor = ve.Codigo and nf.status = 'F' and nf.Tip_Saida = 'V' and nf.cod_estabe = 2 and convert(varchar,nf.Dat_Emissao,103) = convert(varchar,getdate()-7,103))
        end,0) as Dia5

           
            
From 
Vende ve 
left join GEREN ge on ve.Cod_Gerencia = ge.Codigo
where ve.codigo in ((select distinct cod_vendedor from NFSCB where Dat_Emissao > getdate() - 10))
) a
where Dia1+Dia2+Dia3+Dia4+Dia5 > 0
