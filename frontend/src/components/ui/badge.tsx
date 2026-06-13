import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Atlassian "Lozenge" — compact, bold, uppercase status indicator (subtle bg, no border).
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase leading-4 tracking-[0.02em] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-lz-neutral-bg text-lz-neutral-fg",
        primary: "bg-lz-brand-bg text-lz-brand-fg",
        success: "bg-lz-success-bg text-lz-success-fg",
        warning: "bg-lz-warning-bg text-lz-warning-fg",
        danger: "bg-lz-danger-bg text-lz-danger-fg",
        info: "bg-lz-info-bg text-lz-info-fg",
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
