import { Check, Eye, EyeOff, LifeBuoy, X } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordStrength } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {hint}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordInput({
  id,
  invalid,
  className,
  ...props
}: ComponentProps<typeof Input> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={cn("h-12 min-w-0 w-full bg-card pr-12", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function StrengthMeter({ password }: { password: string }) {
  const { checks, score, label } = passwordStrength(password);
  if (!password) return null;
  const tone = score <= 1 ? "bg-destructive" : score === 2 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full bg-muted", i < score && tone)} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Password strength: <span className="font-semibold text-foreground">{label}</span>
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn(
              "flex items-center gap-1.5",
              c.ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {c.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormAlert({
  tone = "error",
  children,
  onClose,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const cls = {
    error: "border-destructive/30 bg-destructive/5 text-destructive",
    success: "border-success/30 bg-success/10 text-success",
    info: "border-primary/30 bg-primary/5 text-foreground",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm", cls)}
    >
      <div className="flex-1">{children}</div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-current opacity-70 hover:opacity-100"
          aria-label="Close message"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function HelpLink() {
  return (
    <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
      <LifeBuoy aria-hidden="true" className="size-3.5" />
      Contact your school administrator for account help.
    </p>
  );
}
