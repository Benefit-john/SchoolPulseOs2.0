import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AuthLayout, AuthSwitch } from "@/components/auth-layout";
import { Field, FormAlert, HelpLink, PasswordInput } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { signInWithLockout } from "@/lib/auth.functions";
import { roleHome, roleLabels, setRememberMe, type AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (s) =>
    z.object({ reason: z.enum(["expired", "signed-out", "reset"]).optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Sign in | SchoolPulseOS" },
      { name: "description", content: "Sign in to your SchoolPulseOS school account." },
      { property: "og:title", content: "Sign in | SchoolPulseOS" },
    ],
  }),
  component: SignInPage,
});
const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or phone number")
    .max(255)
    .refine(
      (v) =>
        v.includes("@") ? z.string().email().safeParse(v).success : /^\+?[\d\s-]{7,20}$/.test(v),
      "Enter a valid email or phone number",
    ),
  password: z.string().min(1, "Enter your password"),
});
async function routeAfterLogin(chosen: AppRole | "auto") {
  const { data } = await supabase.from("user_roles").select("role");
  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (chosen !== "auto" && roles.length && !roles.includes(chosen)) {
    await supabase.auth.signOut();
    return {
      error: `This account isn't registered as ${roleLabels[chosen]}. Choose automatic detection or the correct role.`,
    };
  }
  return { dest: roleHome(roles.length ? (chosen !== "auto" ? chosen : roles[0]) : undefined) };
}
function SignInPage() {
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const signIn = useServerFn(signInWithLockout);
  const [role, setRole] = useState<AppRole | "auto">("auto");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      identifier: fd.get("identifier"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await signIn({ data: parsed.data });
      if (!res.ok) {
        setFormError(res.message);
        return;
      }
      setRememberMe(remember);
      await supabase.auth.setSession({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
      });
      const next = await routeAfterLogin(role);
      if ("error" in next) {
        setFormError(next.error);
        return;
      }
      await navigate({ ...next.dest, replace: true });
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  const portal =
    role === "auto"
      ? "all"
      : ["admin", "parent", "student", "teacher"].includes(role)
        ? role
        : "staff";
  return (
    <AuthLayout portal={portal as "all" | "admin" | "parent" | "student" | "teacher" | "staff"}>
      <p className="text-sm font-semibold text-brand">Welcome back</p>
      <h2 className="mt-3 text-3xl font-bold">Sign in to your school account</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        One clear workspace for school leaders, staff, families, and students.
      </p>
      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        {reason === "expired" ? (
          <FormAlert tone="info">
            You were signed out after 30 minutes of inactivity. Please sign in again.
          </FormAlert>
        ) : null}
        {reason === "signed-out" ? (
          <FormAlert tone="success">You've been signed out safely.</FormAlert>
        ) : null}
        {reason === "reset" ? (
          <FormAlert tone="success">Password updated. Sign in with your new password.</FormAlert>
        ) : null}
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <div className="space-y-2">
          <Label htmlFor="role">I am signing in as</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole | "auto")}>
            <SelectTrigger id="role" className="glass-input h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detect automatically</SelectItem>
              {(Object.keys(roleLabels) as AppRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field id="identifier" label="Email or phone number" error={errors["identifier"]}>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder="you@school.edu.ng or +234…"
            aria-invalid={!!errors["identifier"] || undefined}
            className="glass-input h-12"
          />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors["password"]}
          hint={
            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-brand hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            invalid={!!errors["password"]}
            className="glass-input"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          <Label htmlFor="remember" className="font-normal">
            Remember me on this device
          </Label>
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="auth-primary-button h-12 w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              Sign in <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>
      <AuthSwitch label="New parent or student?" action="Create an account" to="/sign-up" />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Teachers and staff receive an invitation from the school admin.
      </p>
      <HelpLink />
    </AuthLayout>
  );
}
