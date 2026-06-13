import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { useForgotPassword } from "./useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";

const Schema = z.object({ email: z.string().email("Enter a valid email") });
type Input_ = z.infer<typeof Schema>;

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const form = useForm<Input_>({ resolver: zodResolver(Schema) });

  return (
    <AuthShell>
      <form onSubmit={form.handleSubmit((v) => forgot.mutate(v))} className="space-y-5" noValidate>
        <div>
          <h2 className="text-xl font-semibold text-text">Reset your password</h2>
          <p className="mt-1 text-sm text-text-muted">
            Enter your work email and we'll send you a secure reset link.
          </p>
        </div>

        {forgot.isSuccess && (
          <Alert variant="success" title="Check your inbox">
            If that email exists in Somvanshi HRMS, a reset link is on its way. It expires in 30 minutes.
          </Alert>
        )}

        <FormField label="Work email" htmlFor="email" required error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@somvanshitech.com"
            error={!!form.formState.errors.email}
            {...form.register("email")}
          />
        </FormField>

        <Button type="submit" className="w-full" size="lg" loading={forgot.isPending}>
          Send reset link
        </Button>
        <p className="text-center text-sm text-text-muted">
          Remembered it?{" "}
          <Link to="/login" className="text-primary hover:underline dark:text-chart-3">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
