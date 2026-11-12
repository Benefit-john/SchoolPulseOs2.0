import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { Field, FormAlert, HelpLink, PasswordInput, StrengthMeter } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { passwordStrength } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Choose a new password | SchoolPulseOS" },
    { name: "description", content: "Set a new password for your SchoolPulseOS account." },
    { property: "og:title", content: "Choose a new password | SchoolPulseOS" },
    { property: "og:description", content: "Set a new password for your account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => setReady((r) => r || !!data.session || (window.location.hash.includes("type=") ? null : false)));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passwordStrength(password).score < 3 || password.length < 8) { setError("Choose a stronger password (see the tips below)."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", search: { reason: "reset" }, replace: true });
  }

  return (
    <AuthLayout>
      <p className="text-sm font-semibold text-brand">Account recovery</p>
      <h2 className="mt-3 text-3xl font-bold">Choose a new password</h2>
      {ready === false ? (
        <div className="mt-8"><FormAlert>This reset link is invalid or has expired. Request a new one from “Forgot password?”.</FormAlert></div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field id="password" label="New password"><PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <StrengthMeter password={password} />
          <Field id="confirm" label="Confirm new password"><PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button type="submit" disabled={busy || !ready} className="h-12 w-full bg-brand text-brand-foreground hover:bg-brand/90">{busy ? <Loader2 className="size-4 animate-spin" /> : "Save new password"}</Button>
        </form>
      )}
      <HelpLink />
    </AuthLayout>
  );
}
