import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthLayout } from "@/components/auth-layout";
import { Field, FormAlert, HelpLink } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [
    { title: "Reset your password | SchoolPulseOS" },
    { name: "description", content: "Get a secure link to reset your SchoolPulseOS password." },
    { property: "og:title", content: "Reset your password | SchoolPulseOS" },
    { property: "og:description", content: "Get a secure link to reset your password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!z.string().email().safeParse(email).success) { setError("Enter the email address on your account"); return; }
    setError(null);
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthLayout>
      <p className="text-sm font-semibold text-brand">Account recovery</p>
      <h2 className="mt-3 text-3xl font-bold">Forgot your password?</h2>
      <p className="mt-3 text-sm text-muted-foreground">Enter your account email and we'll send a secure reset link.</p>
      {sent ? (
        <div className="mt-8 space-y-5">
          <FormAlert tone="success">If an account exists for that email, a reset link is on its way. It expires in one hour.</FormAlert>
          <Button asChild variant="outline" className="h-12 w-full"><Link to="/sign-in">Back to sign in</Link></Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          <Field id="email" label="Email" error={error ?? undefined}>
            <Input id="email" name="email" type="email" autoComplete="email" className="h-12 bg-card" aria-invalid={!!error || undefined} aria-describedby={error ? "email-error" : undefined} />
          </Field>
          <Button type="submit" disabled={busy} className="h-12 w-full bg-brand text-brand-foreground hover:bg-brand/90">{busy ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}</Button>
          <p className="text-center text-sm"><Link to="/sign-in" className="font-semibold text-brand hover:underline">Back to sign in</Link></p>
        </form>
      )}
      <HelpLink />
    </AuthLayout>
  );
}
