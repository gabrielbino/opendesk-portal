import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InfoFieldProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function InfoField({ label, value, mono = true }: InfoFieldProps) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <p className={cn("break-words text-[13px] font-semibold text-foreground", mono && "font-mono")}>
        {value || "—"}
      </p>
    </div>
  );
}
