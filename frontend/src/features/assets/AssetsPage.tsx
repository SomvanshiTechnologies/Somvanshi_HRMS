import * as React from "react";
import { motion } from "framer-motion";
import {
  Cpu, HardDrive, KeyRound, Laptop, Monitor, MonitorSmartphone, Plus, Search,
  Smartphone, Wrench,
} from "lucide-react";
import {
  ASSET_CATEGORIES, useAssetSummary, useAssets, useAssignAsset, useCreateAsset,
  useMyAssets, useReturnAsset, type Asset,
} from "./useAssets";
import { useEmployees } from "@/features/employees/useEmployees";
import { usePermissions } from "@/hooks/usePermissions";
import { apiErrorMessage } from "@/lib/api";
import { cn, formatDate, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORY_ICONS: Record<string, typeof Laptop> = {
  LAPTOP: Laptop, MONITOR: Monitor, MOBILE: Smartphone, SIM: Smartphone,
  ACCESS_CARD: KeyRound, KEYBOARD: Cpu, MOUSE: Cpu, HEADSET: Cpu,
  SOFTWARE_LICENSE: HardDrive, FURNITURE: HardDrive, OTHER: HardDrive,
};

function AssetCard({ asset, onAssign, onReturn, canAssign }: { asset: Asset; onAssign: () => void; onReturn: () => void; canAssign: boolean }) {
  const Icon = CATEGORY_ICONS[asset.category] ?? HardDrive;
  const holder = asset.assignments[0]?.employee;
  return (
    <Card className="rounded-xl p-4 hover:shadow-raised transition-shadow">
      <div className="flex items-start justify-between">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3"><Icon className="size-5" /></div>
        <Badge variant={statusVariant(asset.status)}>{asset.status.replace("_", " ")}</Badge>
      </div>
      <h3 className="mt-3 font-semibold text-text truncate">{asset.name}</h3>
      <p className="text-xs text-text-muted">
        <span className="font-mono">{asset.assetTag}</span>
        {asset.serialNumber ? ` · SN ${asset.serialNumber}` : ""}
      </p>
      {asset.warrantyEndsAt && (
        <p className="text-[11px] text-text-faint mt-0.5">Warranty till {formatDate(asset.warrantyEndsAt)}</p>
      )}
      <div className="mt-3 border-t border-border pt-3">
        {holder ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <Avatar size="sm">
                {holder.photoUrl && <AvatarImage src={holder.photoUrl} alt="" />}
                <AvatarFallback>{initials(holder.firstName, holder.lastName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-text truncate">{holder.firstName} {holder.lastName}</span>
            </span>
            {canAssign && <Button variant="secondary" size="sm" onClick={onReturn}>Return</Button>}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-faint">Unassigned</span>
            {canAssign && asset.status === "AVAILABLE" && <Button size="sm" onClick={onAssign}>Assign</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

function InventoryTab() {
  const { can } = usePermissions();
  const canManage = can("assets:manage");
  const canAssign = can("assets:assign", "assets:manage");
  const summary = useAssetSummary();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const assets = useAssets({
    search: search || undefined,
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
  });
  const employees = useEmployees({ page: 1, limit: 100, status: "ACTIVE" });
  const createAsset = useCreateAsset();
  const assignAsset = useAssignAsset();
  const returnAsset = useReturnAsset();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState({ assetTag: "", category: "LAPTOP", name: "", serialNumber: "", brand: "" });
  const [assignFor, setAssignFor] = React.useState<Asset | null>(null);
  const [assignEmployee, setAssignEmployee] = React.useState("");

  return (
    <div className="space-y-4">
      {/* summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Assets", value: summary.data?.total, accent: "" },
          { label: "Assigned", value: summary.data?.byStatus["ASSIGNED"] ?? 0, accent: "text-success" },
          { label: "Available", value: summary.data?.byStatus["AVAILABLE"] ?? 0, accent: "text-info" },
          { label: "Warranty <60d", value: summary.data?.warrantyExpiring ?? 0, accent: "text-warning" },
        ].map((c) => (
          <Card key={c.label} className="rounded-xl p-4">
            <p className={cn("text-xl font-semibold tabular-nums", c.accent || "text-text")}>
              {summary.isLoading ? <Skeleton className="h-7 w-10" /> : c.value ?? 0}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mt-0.5">{c.label}</p>
          </Card>
        ))}
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-faint" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tag, name, serial…" className="pl-8" aria-label="Search assets" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 h-9" aria-label="Status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["AVAILABLE", "ASSIGNED", "IN_REPAIR", "RETIRED"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40 h-9" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {ASSET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canManage && <Button onClick={() => setCreateOpen(true)}><Plus /> Add Asset</Button>}
      </div>

      {assets.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : assets.isError ? (
        <ErrorState message={apiErrorMessage(assets.error)} onRetry={() => assets.refetch()} />
      ) : !assets.data?.length ? (
        <EmptyState icon={MonitorSmartphone} title="No assets found" description="Add laptops, monitors, SIMs and more to your inventory." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {assets.data.map((asset, i) => (
            <motion.div key={asset.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
              <AssetCard
                asset={asset}
                canAssign={canAssign}
                onAssign={() => { setAssignFor(asset); setAssignEmployee(""); }}
                onReturn={() => returnAsset.mutate({ id: asset.id })}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* create asset */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add asset</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Asset tag" required hint="e.g. SOM-LP-001"><Input value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value.toUpperCase() })} /></FormField>
            <FormField label="Category" required>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Name" required className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dell Latitude 5440" /></FormField>
            <FormField label="Brand"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></FormField>
            <FormField label="Serial number"><Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={form.assetTag.length < 2 || form.name.length < 2}
              loading={createAsset.isPending}
              onClick={async () => {
                await createAsset.mutateAsync({ assetTag: form.assetTag, category: form.category, name: form.name, brand: form.brand || undefined, serialNumber: form.serialNumber || undefined });
                setCreateOpen(false);
                setForm({ assetTag: "", category: "LAPTOP", name: "", serialNumber: "", brand: "" });
              }}
            >
              Add asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* assign */}
      <Dialog open={Boolean(assignFor)} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign {assignFor?.name}</DialogTitle></DialogHeader>
          <FormField label="Assign to" required>
            <Select value={assignEmployee} onValueChange={setAssignEmployee}>
              <SelectTrigger aria-label="Employee"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {(employees.data?.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button disabled={!assignEmployee} loading={assignAsset.isPending} onClick={async () => { await assignAsset.mutateAsync({ id: assignFor!.id, employeeId: assignEmployee }); setAssignFor(null); }}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MyAssetsTab() {
  const my = useMyAssets();
  return my.isLoading ? (
    <Skeleton className="h-40 rounded-xl" />
  ) : !my.data?.length ? (
    <EmptyState icon={Laptop} title="No assets assigned to you" />
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {my.data.map((a) => {
        const Icon = CATEGORY_ICONS[a["asset"]?.category] ?? HardDrive;
        return (
          <Card key={a["id"]} className="rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3"><Icon className="size-5" /></div>
              <div className="min-w-0">
                <p className="font-medium text-text truncate">{a["asset"]?.name}</p>
                <p className="text-xs text-text-muted font-mono">{a["asset"]?.assetTag}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-text-faint">Assigned {formatDate(a["assignedAt"])}</p>
          </Card>
        );
      })}
    </div>
  );
}

export function AssetsPage() {
  const { can } = usePermissions();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Assets</h1>
        <p className="text-sm text-text-muted">Inventory, assignments, warranty and maintenance.</p>
      </div>
      {can("assets:read_all") ? (
        <Tabs defaultValue="inventory">
          <TabsList>
            <TabsTrigger value="inventory"><MonitorSmartphone /> Inventory</TabsTrigger>
            <TabsTrigger value="mine"><Laptop /> My Assets</TabsTrigger>
          </TabsList>
          <TabsContent value="inventory"><InventoryTab /></TabsContent>
          <TabsContent value="mine"><MyAssetsTab /></TabsContent>
        </Tabs>
      ) : (
        <MyAssetsTab />
      )}
    </div>
  );
}

export { Wrench };
