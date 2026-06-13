import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Briefcase, Mail, MoreHorizontal, Pencil, Phone, UserCircle2 } from "lucide-react";
import type { EmployeeRow } from "./useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Premium employee card — primary directory view. Navy header band from the
 * brand palette, rich avatar, status badge, contact row and quick actions.
 */
export function EmployeeCard({ employee, index = 0 }: { employee: EmployeeRow; index?: number }) {
  const navigate = useNavigate();
  const { can } = usePermissions();

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      className="group relative overflow-hidden rounded-xl border border-border bg-surface shadow-card hover:shadow-raised transition-shadow"
    >
      {/* navy accent band */}
      <div className="h-14 bg-gradient-to-r from-primary to-(--chart-2)" aria-hidden />

      <div className="px-4 pb-4">
        <div className="-mt-7 flex items-end justify-between">
          <button
            className="rounded-full ring-4 ring-surface cursor-pointer"
            onClick={() => navigate(`/employees/${employee.id}`)}
            aria-label={`View ${employee.firstName} ${employee.lastName}`}
          >
            <Avatar size="lg" className="size-14">
              {employee.photoUrl && <AvatarImage src={employee.photoUrl} alt="" />}
              <AvatarFallback className="text-base bg-surface-sunken text-primary dark:text-chart-3">
                {initials(employee.firstName, employee.lastName)}
              </AvatarFallback>
            </Avatar>
          </button>
          <Badge variant={statusVariant(employee.status)}>{employee.status}</Badge>
        </div>

        <div className="mt-2.5">
          <Link
            to={`/employees/${employee.id}`}
            className="block text-[15px] font-semibold text-text hover:text-primary dark:hover:text-chart-3 transition-colors truncate"
          >
            {employee.firstName} {employee.lastName}
          </Link>
          <p className="text-[13px] text-text-muted truncate">{employee.designation?.title ?? "—"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge className="font-mono">{employee.employeeCode}</Badge>
            {employee.department && <Badge variant="primary">{employee.department.name}</Badge>}
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs text-text-muted">
          <p className="flex items-center gap-1.5 truncate">
            <Mail className="size-3.5 shrink-0 text-text-faint" /> {employee.email}
          </p>
          {employee.phone && (
            <p className="flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0 text-text-faint" /> {employee.phone}
            </p>
          )}
        </div>

        {/* quick actions */}
        <div className="mt-3 flex items-center gap-1.5">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => navigate(`/employees/${employee.id}`)}>
            <UserCircle2 /> Profile
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon-sm" asChild>
                <a href={`mailto:${employee.email}`} aria-label="Send email">
                  <Mail />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send email</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => navigate(`/employees/${employee.id}`)}>
                <UserCircle2 /> View profile
              </DropdownMenuItem>
              {can("employees:update", "employees:manage") && (
                <DropdownMenuItem onSelect={() => navigate(`/employees/${employee.id}/edit`)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(`/employees/${employee.id}?tab=timeline`)}>
                <Briefcase /> Career timeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.article>
  );
}
