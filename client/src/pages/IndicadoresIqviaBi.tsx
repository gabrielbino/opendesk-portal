import { Activity } from "lucide-react";
import PowerBiEmbed from "@/components/PowerBiEmbed";

const POWERBI_EMBED_URL =
  "https://app.powerbi.com/view?r=eyJrIjoiOGEwNWRjZTYtMDEwYS00NGE5LTgwZDYtZmU4ZjU5YTgzYThlIiwidCI6Ijg4OWYwYWE3LWM2YjUtNDA4YS1hZTY5LTY0NjJhNjEzYWRlZiJ9";

export default function IndicadoresIqviaBi() {
  return (
    <PowerBiEmbed
      title="IQVIA"
      subtitle="Dados do mercado farmacêutico"
      embedUrl={POWERBI_EMBED_URL}
      icon={<Activity />}
      iconGradient="from-violet-500 to-violet-600"
    />
  );
}
