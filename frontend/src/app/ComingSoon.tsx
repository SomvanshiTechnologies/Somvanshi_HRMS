import { Link } from "react-router-dom";
import { Rocket, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Branded placeholder for modules scheduled in upcoming phases — never a 404. */
export function ComingSoon({ module, phase }: { module: string; phase: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="rounded-2xl bg-primary/10 p-5 text-primary dark:text-chart-3">
        <Rocket className="size-10" aria-hidden />
      </div>
      <Badge variant="primary">{phase}</Badge>
      <h1 className="text-2xl font-semibold text-text">{module} is on the way</h1>
      <p className="max-w-md text-sm text-text-muted">
        This module is part of the Somvanshi HRMS rollout plan and will appear here automatically
        once its phase ships — fully integrated with your live data.
      </p>
      <Button asChild variant="secondary">
        <Link to="/">
          <ArrowLeft /> Back to Dashboard
        </Link>
      </Button>
    </div>
  );
}
