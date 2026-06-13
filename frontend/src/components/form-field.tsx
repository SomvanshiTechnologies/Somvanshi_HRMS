import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Standard RHF field wrapper: label + control + error message slot. */
interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, required, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
