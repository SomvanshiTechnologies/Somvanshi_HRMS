import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { api, apiErrorMessage, type ApiList } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  user: { id: string; email: string } | null;
}

export function AuditPage() {
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");

  const audit = useQuery({
    queryKey: ["audit", page, search],
    queryFn: async () =>
      (
        await api.get<ApiList<AuditRow>>("/audit", {
          params: { page, limit: 25, action: search || undefined },
        })
      ).data,
    placeholderData: (prev) => prev,
  });

  const columns = React.useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      { id: "createdAt", header: "When", enableSorting: false, cell: ({ row }) => formatDateTime(row.original.createdAt) },
      { id: "user", header: "Actor", enableSorting: false, cell: ({ row }) => row.original.user?.email ?? "system" },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => <Badge variant="primary">{row.original.action}</Badge>,
      },
      { id: "entity", header: "Entity", enableSorting: false, accessorKey: "entity" },
      {
        id: "entityId",
        header: "Entity ID",
        enableSorting: false,
        cell: ({ row }) => <span className="font-mono text-xs text-text-muted">{row.original.entityId ?? "—"}</span>,
      },
      { id: "ip", header: "IP", enableSorting: false, cell: ({ row }) => row.original.ip ?? "—" },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Audit Log</h1>
        <p className="text-sm text-text-muted">Append-only trail of every privileged action.</p>
      </div>
      <DataTable
        columns={columns}
        data={audit.data?.data}
        meta={audit.data?.meta}
        isLoading={audit.isLoading}
        error={audit.isError ? audit.error : undefined}
        errorMessage={audit.isError ? apiErrorMessage(audit.error) : undefined}
        onRetry={() => audit.refetch()}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Filter by action (e.g. auth.login)…"
        emptyTitle="No audit entries"
      />
    </div>
  );
}
