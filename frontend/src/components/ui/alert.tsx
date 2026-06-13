import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative flex w-full gap-3 rounded-lg border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-info/25 bg-info-bg text-text [&_svg]:text-info",
      success: "border-success/25 bg-success-bg text-text [&_svg]:text-success",
      warning: "border-warning/25 bg-warning-bg text-text [&_svg]:text-warning",
      danger: "border-danger/25 bg-danger-bg text-text [&_svg]:text-danger",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle };

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? "info"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="size-4 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1">
        {title && <p className="font-medium mb-0.5">{title}</p>}
        <div className="text-text-muted">{children}</div>
      </div>
    </div>
  );
}
