import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";

interface ChartCardProps {
  title: string;
  description?: string;
  isLoading?: boolean;
  error?: unknown;
  errorMessage?: string;
  onRetry?: () => void;
  action?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  isLoading,
  error,
  errorMessage,
  onRetry,
  action,
  height = 280,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton style={{ height }} className="w-full" />
        ) : error ? (
          <ErrorState message={errorMessage ?? "Failed to load chart."} onRetry={onRetry} />
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
