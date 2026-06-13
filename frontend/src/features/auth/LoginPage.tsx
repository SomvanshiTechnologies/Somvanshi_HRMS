import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "./AuthShell";
import { useLogin, useTwoFactorLogin } from "./useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/form-field";
import { Alert } from "@/components/ui/alert";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});
type LoginInput = z.infer<typeof LoginSchema>;

const TwoFactorSchema = z.object({
  code: z.string().min(6, "Enter the 6-digit code or a recovery code"),
});
type TwoFactorInput = z.infer<typeof TwoFactorSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const twoFactor = useTwoFactorLogin();
  const [challengeToken, setChallengeToken] = React.useState<string | null>(null);

  const form = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });
  const tfaForm = useForm<TwoFactorInput>({ resolver: zodResolver(TwoFactorSchema) });

  const onLogin = form.handleSubmit(async (values) => {
    const result = await login.mutateAsync(values);
    if (result.requiresTwoFactor && result.challengeToken) {
      setChallengeToken(result.challengeToken);
    } else {
      navigate("/", { replace: true });
    }
  });

  const onVerify = tfaForm.handleSubmit(async (values) => {
    await twoFactor.mutateAsync({ challengeToken: challengeToken!, code: values.code });
    navigate("/", { replace: true });
  });

  return (
    <AuthShell>
      {challengeToken ? (
        <form onSubmit={onVerify} className="space-y-5" noValidate>
          <div>
            <div className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary dark:text-chart-3">
              <ShieldCheck className="size-6" />
            </div>
            <h2 className="text-xl font-semibold text-text">Two-factor verification</h2>
            <p className="mt-1 text-sm text-text-muted">
              Enter the 6-digit code from your authenticator app, or one of your recovery codes.
            </p>
          </div>
          <FormField label="Verification code" htmlFor="code" required error={tfaForm.formState.errors.code?.message}>
            <Input
              id="code"
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              error={!!tfaForm.formState.errors.code}
              {...tfaForm.register("code")}
            />
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={twoFactor.isPending}>
            Verify & Sign in
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setChallengeToken(null)}>
            Back to login
          </Button>
        </form>
      ) : (
        <form onSubmit={onLogin} className="space-y-5" noValidate>
          <div>
            <h2 className="text-xl font-semibold text-text">Sign in to Somvanshi HRMS</h2>
            <p className="mt-1 text-sm text-text-muted">Use your Somvanshi Technologies work account.</p>
          </div>

          {params.get("expired") && (
            <Alert variant="warning" title="Session expired">
              Please sign in again to continue.
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

          <FormField label="Password" htmlFor="password" required error={form.formState.errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              error={!!form.formState.errors.password}
              {...form.register("password")}
            />
          </FormField>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-primary hover:underline dark:text-chart-3">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
            Sign in
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
