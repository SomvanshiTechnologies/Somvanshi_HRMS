import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        "flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text shadow-card",
        "placeholder:text-text-faint",
        "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 focus-visible:border-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-danger focus-visible:outline-danger",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
