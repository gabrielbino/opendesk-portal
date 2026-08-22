import { BarChart3 } from "lucide-react";
import PowerBiEmbed from "@/components/PowerBiEmbed";

const POWERBI_EMBED_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiNmMyNzJkMDEtMTExNC00MDZlLWFlMTktZmNkYTE5NDUyNzU0IiwidCI6Ijg4OWYwYWE3LWM2YjUtNDA4YS1hZTY5LTY0NjJhNjEzYWRlZiJ9";

export default function IndicadoresCortesBi() {
  return (
    <PowerBiEmbed
      title="Cortes"
      subtitle="Análise detalhada de pedidos cortados"
      embedUrl={POWERBI_EMBED_URL}
      icon={<BarChart3 />}
      iconGradient="from-slate-700 to-slate-800"
    />
  );
}
