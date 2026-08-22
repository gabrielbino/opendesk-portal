import { TrendingUp } from "lucide-react";
import PowerBiEmbed from "@/components/PowerBiEmbed";

const POWERBI_EMBED_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiMzRiOTg5OTEtZjY3YS00NGNhLWI5MGMtYjMwMWYwNjliY2UwIiwidCI6Ijg4OWYwYWE3LWM2YjUtNDA4YS1hZTY5LTY0NjJhNjEzYWRlZiJ9";

export default function IndicadoresVendasBi() {
  return (
    <PowerBiEmbed
      title="Áreas de Atuação"
      subtitle="Análise por áreas de atuação"
      embedUrl={POWERBI_EMBED_URL}
      icon={<TrendingUp />}
      iconGradient="from-emerald-500 to-emerald-600"
    />
  );
}
