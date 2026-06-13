import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { Compass, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Branded error boundary — no raw stack traces or default 404s. */
export function ErrorPage() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <div className="rounded-2xl bg-primary/10 p-5 text-primary dark:text-chart-3">
        <Compass className="size-10" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold text-text">
        {is404 ? "Page not found" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm text-text-muted">
        {is404
          ? "The page you're looking for doesn't exist or may have moved."
          : "An unexpected error occurred. Our team has been notified — try again or head back to your dashboard."}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          <RefreshCw /> Reload
        </Button>
        <Button asChild>
          <Link to="/">
            <Home /> Go to Dashboard
          </Link>
        </Button>
      </div>
      <p className="mt-4 text-xs text-text-faint">Somvanshi HRMS · People. Performance. Growth.</p>
    </div>
  );
}
