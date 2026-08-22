import { useMemo } from "react";
import { useSearch } from "wouter";

import { parseRankingParams } from "@/components/RankingTV";
import { RupturasTVView } from "./tv/panels";

export default function RupturasPainelTV() {
  const search = useSearch();
  const { regiao, top, rotacao } = useMemo(() => parseRankingParams(search), [search]);
  return <RupturasTVView regiao={regiao} top={top} rotacao={rotacao} />;
}
