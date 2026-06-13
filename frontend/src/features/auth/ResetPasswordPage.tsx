import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { useResetPassword } from "./useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";

const Schema = z
  .object({
    password: z
      .string()
      .min(10, "At least 10 characters")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[0-9]/, "Add a digit"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Input_ = z.infer<typeof Schema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const form = useForm<Input_>({ resolver: zodResolver(Schema) });

  return (
    <AuthShell>
      <form
        onSubmit={form.handleSubmit((v) => reset.mutate({ token, password: v.password }))}
        className="space-y-5"
        noValidate
      >
        <div>
          <h2 className="text-xl font-semibold text-text">Choose a new password</h2>
          <p className="mt-1 text-sm text-text-muted">
            Minimum 10 characters with upper- and lowercase letters and a digit.
          </p>
        </div>

        {!token && (
          <Alert variant="danger" title="Invalid link">
            This reset link is malformed. Request a new one from the{" "}
            <Link to="/forgot-password" className="underline">
              forgot password
            </Link>{" "}
            page.
          </Alert>
        )}

        <FormField label="New password" htmlFor="password" required error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" autoFocus error={!!form.formState.errors.password} {...form.register("password")} />
        </FormField>

        <FormField label="Confirm password" htmlFor="confirm" required error={form.formState.errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" error={!!form.formState.errors.confirm} {...form.register("confirm")} />
        </FormField>

        <Button type="submit" className="w-full" size="lg" disabled={!token} loading={reset.isPending}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
