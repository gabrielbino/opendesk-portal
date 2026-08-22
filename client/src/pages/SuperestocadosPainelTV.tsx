import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";

import { parseRankingParams, RankingTVChip } from "@/components/RankingTV";
import { SuperestocadosTVView, SuperestocadosProdutosTVView } from "./tv/panels";

/**
 * Painel modo TV de Superestocados (standalone). Alterna entre duas visões pela
 * querystring `?visao=`:
 *   - `industrias` (padrão) → ranking por indústria/fornecedor (tempo médio);
 *   - `produtos`            → ranking por produto (tempo EXATO no painel).
 * O seletor entra na barra do RankingTV via `extraControls`; `extraQuery` preserva o
 * `visao` quando o usuário troca região/top. As mesmas views são reusadas no Monitor TV.
 */
export default function SuperestocadosPainelTV() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { regiao, top, rotacao } = useMemo(() => parseRankingParams(search), [search]);
  const visao = new URLSearchParams(search).get("visao") === "produtos" ? "produtos" : "industrias";

  const irPara = (v: "industrias" | "produtos") => {
    const q = `regiao=${regiao}&top=${top}${rotacao ? `&rotacao=${rotacao}` : ""}`;
    setLocation(`/superestocados/painel?${q}${v === "produtos" ? "&visao=produtos" : ""}`);
  };

  const toggle = (
    <>
      <RankingTVChip ativo={visao === "industrias"} onClick={() => irPara("industrias")}>Indústrias</RankingTVChip>
      <RankingTVChip ativo={visao === "produtos"} onClick={() => irPara("produtos")}>Produtos</RankingTVChip>
    </>
  );

  const extraQuery = visao === "produtos" ? { visao: "produtos" } : undefined;
  const View = visao === "produtos" ? SuperestocadosProdutosTVView : SuperestocadosTVView;

  return <View regiao={regiao} top={top} rotacao={rotacao} extraControls={toggle} extraQuery={extraQuery} />;
}
