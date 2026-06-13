import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-sunken text-text-muted border border-border",
        primary: "bg-primary/10 text-primary border border-primary/20 dark:text-chart-3",
        success: "bg-success-bg text-success border border-success/25",
        warning: "bg-warning-bg text-warning border border-warning/25",
        danger: "bg-danger-bg text-danger border border-danger/25",
        info: "bg-info-bg text-info border border-info/25",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map common entity statuses to badge variants — used across modules. */
export function statusVariant(status: string): NonNullable<BadgeProps["variant"]> {
  const map: Record<string, NonNullable<BadgeProps["variant"]>> = {
    ACTIVE: "success", PRESENT: "success", APPROVED: "success", PAID: "success", COMPLETED: "success", RESOLVED: "success", JOINED: "success",
    PROBATION: "info", ONBOARDING: "info", IN_PROGRESS: "info", PROCESSING: "info", SCHEDULED: "info", OPEN: "info",
    PENDING: "warning", PENDING_APPROVAL: "warning", ON_HOLD: "warning", ESCALATED: "warning", ON_LEAVE: "warning", DRAFT: "default",
    RESIGNED: "warning", CANDIDATE: "default", ALUMNI: "default",
    TERMINATED: "danger", REJECTED: "danger", CANCELLED: "danger", ABSENT: "danger", LOCKED: "danger", SUSPENDED: "danger", DEACTIVATED: "danger",
  };
  return map[status] ?? "default";
}
