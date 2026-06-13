import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  trend?: { value: number; positiveIsGood?: boolean };
  accent?: "primary" | "success" | "warning" | "danger" | "info";
}

const accentBg: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  primary: "bg-primary/10 text-primary dark:text-chart-3",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

export function KpiCard({ label, value, icon: Icon, hint, trend, accent = "primary" }: KpiCardProps) {
  const positive = trend ? (trend.positiveIsGood === false ? trend.value <= 0 : trend.value >= 0) : true;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-text tabular-nums truncate">{value}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              {trend && (
                <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-success" : "text-danger")}>
                  {trend.value >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {Math.abs(trend.value)}%
                </span>
              )}
              {hint && <span className="text-text-faint truncate">{hint}</span>}
            </div>
          </div>
          <div className={cn("rounded-lg p-2.5 shrink-0", accentBg[accent])}>
            <Icon className="size-5" aria-hidden />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
