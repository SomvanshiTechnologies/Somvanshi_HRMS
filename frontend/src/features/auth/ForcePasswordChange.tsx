import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { BrandLockup } from "@/components/brand";

/**
 * Full-screen gate shown when the account is flagged `mustChangePassword`
 * (e.g. after an admin-approved reset). The app is inaccessible until a new
 * password is set with the temporary one.
 */
export function ForcePasswordChange() {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrent] = React.useState("");
  const [newPassword, setNew] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const change = useMutation({
    mutationFn: () => api.post("/auth/change-password", { currentPassword, newPassword }),
    onSuccess: async () => {
      toast.success("Password updated. Welcome back!");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const valid = currentPassword.length >= 8 && newPassword.length >= 8 && newPassword === confirm;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-overlay">
        <div className="mb-5 flex flex-col items-center text-center">
          <BrandLockup />
          <div className="mt-4 rounded-full bg-warning-bg p-3 text-warning"><ShieldCheck className="size-6" /></div>
          <h1 className="mt-3 text-lg font-semibold text-text">Set a new password</h1>
          <p className="mt-1 text-sm text-text-muted">For your security, you must replace the temporary password before continuing.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (valid) change.mutate(); }}
        >
          <FormField label="Temporary password" htmlFor="cur" required>
            <Input id="cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} placeholder="From your email" />
          </FormField>
          <FormField label="New password" htmlFor="np" required hint="At least 8 characters, with upper, lower, number & symbol">
            <Input id="np" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          </FormField>
          <FormField label="Confirm new password" htmlFor="cp" required error={mismatch ? "Passwords don't match" : undefined}>
            <Input id="cp" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </FormField>
          <Button type="submit" className="w-full" loading={change.isPending} disabled={!valid}>
            <KeyRound /> Update password & continue
          </Button>
        </form>
      </div>
    </div>
  );
}
