import type { LucideIcon } from "lucide-react";
import { Inbox, RefreshCw, UserCog } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="rounded-full bg-surface-sunken p-3.5">
        <Icon className="size-6 text-text-faint" aria-hidden />
      </div>
      <p className="mt-1 font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Standard API error state with retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  // Admin/system accounts have no employee profile — show an informational state, not a scary error.
  if (/no employee profile linked/i.test(message)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <div className="rounded-full bg-surface-sunken p-3.5"><UserCog className="size-6 text-text-faint" aria-hidden /></div>
        <p className="mt-1 font-medium text-text">No employee profile</p>
        <p className="max-w-sm text-sm text-text-muted">This is an administrator account that isn't linked to an employee record, so there's nothing personal to show here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" role="alert">
      <div className="rounded-full bg-danger-bg p-3.5">
        <RefreshCw className="size-6 text-danger" aria-hidden />
      </div>
      <p className="font-medium text-text">Couldn't load data</p>
      <p className="max-w-sm text-sm text-text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}
