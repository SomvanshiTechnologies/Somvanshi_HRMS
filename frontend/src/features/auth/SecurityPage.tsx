import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, MonitorSmartphone, Trash2 } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useRequestReset } from "./usePasswordResets";

interface Session {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  createdAt: string;
  device: { id: string; name: string | null; platform: string | null; isTrusted: boolean } | null;
}

export function SecurityPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await api.get<{ data: Session[] }>("/auth/sessions")).data.data,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success("Session revoked.");
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const requestReset = useRequestReset();

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Security & Sessions</h1>
        <p className="text-sm text-text-muted">Manage how you sign in to SomHR.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="size-4" /> Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            {user?.twoFactorEnabled
              ? "2FA is enabled on your account. Codes are required at every sign-in."
              : "Add an authenticator app for a second layer of sign-in security."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={user?.twoFactorEnabled ? "success" : "warning"}>
            {user?.twoFactorEnabled ? "Enabled" : "Not enabled"}
          </Badge>
          <p className="mt-2 text-xs text-text-faint">
            2FA setup with QR enrolment is available via your administrator (API: /auth/2fa/setup).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="size-4" /> Password
          </CardTitle>
          <CardDescription>
            Forgot your password or need it reset? Send a request to your administrator. Once approved, a temporary
            password is emailed to you and you'll set a new one at sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="secondary"
            loading={requestReset.isPending}
            onClick={() => requestReset.mutate({ reason: "Requested from Security settings" })}
          >
            <KeyRound /> Request a password reset
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MonitorSmartphone className="size-4" /> Active Sessions
          </CardTitle>
          <CardDescription>Sign out of sessions you don't recognize.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.isLoading ? (
            <Skeleton className="h-32 m-4" />
          ) : !sessions.data?.length ? (
            <EmptyState title="No active sessions" />
          ) : (
            sessions.data.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {s.device?.name ?? s.device?.platform ?? s.userAgent?.slice(0, 60) ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {s.ip ?? "—"} · last active {formatDateTime(s.lastActiveAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Revoke session"
                  onClick={() => revoke.mutate(s.id)}
                >
                  <Trash2 className="text-danger" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
