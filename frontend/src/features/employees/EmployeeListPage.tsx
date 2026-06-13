import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  downloadEmployeesCsv,
  useDepartments,
  useEmployees,
  type EmployeeRow,
} from "./useEmployees";
import { EmployeeCard } from "./EmployeeCard";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { ViewToggle, useViewMode } from "@/components/view-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["ONBOARDING", "PROBATION", "ACTIVE", "RESIGNED", "TERMINATED", "ALUMNI"];
const ALL = "__all__";

export function EmployeeListPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [view, setView] = useViewMode("employees", "grid");
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [status, setStatus] = React.useState<string>(ALL);
  const [departmentId, setDepartmentId] = React.useState<string>(ALL);
  const [sorting, setSorting] = React.useState<SortingState>([]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchDraft !== search) {
        setSearch(searchDraft);
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft, search]);

  const departments = useDepartments();
  const filters = {
    page,
    limit: view === "grid" ? 12 : 20,
    search: search || undefined,
    status: status === ALL ? undefined : status,
    departmentId: departmentId === ALL ? undefined : departmentId,
    sort: sorting[0]?.id,
    order: sorting[0] ? ((sorting[0].desc ? "desc" : "asc") as "asc" | "desc") : undefined,
  };
  const employees = useEmployees(filters);
  const meta = employees.data?.meta;

  const columns = React.useMemo<ColumnDef<EmployeeRow, unknown>[]>(
    () => [
      {
        id: "firstName",
        header: "Employee",
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            <Avatar size="sm">
              {row.original.photoUrl && <AvatarImage src={row.original.photoUrl} alt="" />}
              <AvatarFallback>{initials(row.original.firstName, row.original.lastName)}</AvatarFallback>
            </Avatar>
            <span>
              <span className="block font-medium text-text">
                {row.original.firstName} {row.original.lastName}
              </span>
              <span className="block text-xs text-text-muted">{row.original.email}</span>
            </span>
          </span>
        ),
      },
      { id: "employeeCode", header: "Code", accessorKey: "employeeCode" },
      { id: "department", header: "Department", enableSorting: false, cell: ({ row }) => row.original.department?.name ?? "—" },
      { id: "designation", header: "Designation", enableSorting: false, cell: ({ row }) => row.original.designation?.title ?? "—" },
      { id: "dateOfJoining", header: "Joined", cell: ({ row }) => formatDate(row.original.dateOfJoining) },
      { id: "status", header: "Status", cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge> },
    ],
    []
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search name, email, code…"
          className="pl-8"
          aria-label="Search employees"
        />
      </div>
      <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <SelectTrigger className="w-36 h-9" aria-label="Filter by status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setPage(1); }}>
        <SelectTrigger className="w-44 h-9" aria-label="Filter by department">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All departments</SelectItem>
          {(departments.data ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex-1" />
      {can("employees:export") && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const { page: _p, ...rest } = filters;
            downloadEmployeesCsv(rest).catch((err) => toast.error(apiErrorMessage(err)));
          }}
        >
          <Download /> Export
        </Button>
      )}
      <ViewToggle mode={view} onChange={setView} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">People</h1>
          <p className="text-sm text-text-muted">
            {meta?.total != null ? `${meta.total} ${meta.total === 1 ? "person" : "people"}` : "Directory"} at Somvanshi Technologies
          </p>
        </div>
        {can("employees:create") && (
          <Button asChild>
            <Link to="/employees/new">
              <Plus /> Add Employee
            </Link>
          </Button>
        )}
      </div>

      {filterBar}

      {view === "grid" ? (
        employees.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        ) : employees.isError ? (
          <ErrorState message={apiErrorMessage(employees.error)} onRetry={() => employees.refetch()} />
        ) : !employees.data?.data.length ? (
          <EmptyState
            icon={Users}
            title="No people match"
            description="Adjust your search or filters — or add your first employee."
            action={
              can("employees:create") ? (
                <Button asChild size="sm">
                  <Link to="/employees/new">
                    <Plus /> Add Employee
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {employees.data.data.map((emp, i) => (
                <EmployeeCard key={emp.id} employee={emp} index={i} />
              ))}
            </div>
            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-1 text-sm text-text-muted">
                <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums px-1">
                  {meta.page} / {meta.totalPages}
                </span>
                <Button variant="secondary" size="icon-sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight />
                </Button>
              </div>
            )}
          </>
        )
      ) : (
        <DataTable
          columns={columns}
          data={employees.data?.data}
          meta={meta}
          isLoading={employees.isLoading}
          error={employees.isError ? employees.error : undefined}
          errorMessage={employees.isError ? apiErrorMessage(employees.error) : undefined}
          onRetry={() => employees.refetch()}
          page={page}
          onPageChange={setPage}
          sorting={sorting}
          onSortingChange={setSorting}
          onRowClick={(row) => navigate(`/employees/${row.id}`)}
          emptyTitle="No employees found"
        />
      )}
    </div>
  );
}
