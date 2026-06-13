import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { usePermissions } from "@/hooks/usePermissions";
import { NAV_SECTIONS } from "@/app/nav";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { can } = usePermissions();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.permissions.length === 0 || can(...item.permissions)),
  })).filter((section) => section.items.length > 0);

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Main navigation">
      <div className={cn("flex h-16 items-center border-b border-white/8 px-4", collapsed && "justify-center px-2")}>
        <BrandLockup collapsed={collapsed} />
      </div>

      <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
        {sections.map((section, i) => (
          <div key={i} className="mb-1 px-2.5">
            {section.title && !collapsed && (
              <p className="px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-text/70">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const link = (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      "group mb-0.5 flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      isActive
                        ? "bg-sidebar-active text-sidebar-text-active shadow-card"
                        : "text-sidebar-text hover:bg-sidebar-hover hover:text-white"
                    )
                  }
                >
                  <item.icon className="size-[18px] shrink-0" aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </div>

      <button
        onClick={onToggle}
        className="hidden lg:flex items-center justify-center gap-2 border-t border-white/8 py-3 text-xs text-sidebar-text hover:text-white transition-colors cursor-pointer"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="size-4" /> : (
          <>
            <ChevronsLeft className="size-4" /> Collapse
          </>
        )}
      </button>
    </nav>
  );

  return (
    <>
      {/* desktop */}
      <aside
        className={cn(
          "hidden lg:block shrink-0 bg-sidebar transition-[width] duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>

      {/* mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-overlay">{nav}</aside>
        </div>
      )}
    </>
  );
}
