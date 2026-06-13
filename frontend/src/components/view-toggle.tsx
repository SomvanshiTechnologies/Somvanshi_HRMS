import * as React from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

/** Persisted per-module Grid/List preference — global UX requirement. */
export function useViewMode(moduleKey: string, fallback: ViewMode = "grid") {
  const storageKey = `somhr-view:${moduleKey}`;
  const [mode, setMode] = React.useState<ViewMode>(
    () => (localStorage.getItem(storageKey) as ViewMode) || fallback
  );
  const set = (m: ViewMode) => {
    localStorage.setItem(storageKey, m);
    setMode(m);
  };
  return [mode, set] as const;
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const opts: Array<{ key: ViewMode; icon: typeof LayoutGrid; label: string }> = [
    { key: "grid", icon: LayoutGrid, label: "Card view" },
    { key: "list", icon: List, label: "List view" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-sunken p-0.5" role="group" aria-label="View mode">
      {opts.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          aria-pressed={mode === opt.key}
          aria-label={opt.label}
          title={opt.label}
          className={cn(
            "rounded-md px-2.5 py-1.5 transition-colors cursor-pointer",
            mode === opt.key ? "bg-surface text-text shadow-card" : "text-text-faint hover:text-text"
          )}
        >
          <opt.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
