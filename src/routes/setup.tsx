import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthLayout } from "@/components/auth-layout";
import { Field, FormAlert, PasswordInput, StrengthMeter } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { adminExists } from "@/lib/auth.functions";
import { passwordStrength } from "@/lib/auth-client";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [
    { title: "School setup | SchoolPulseOS" },
    { name: "description", content: "One-time setup to create the first school administrator." },
    { property: "og:title", content: "School setup | SchoolPulseOS" },
    { property: "og:description", content: "One-time setup for the first school administrator." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: SetupPage,
});

function SetupPage() {
  const check = useServerFn(adminExists);
  const { data, isLoading } = useQuery({ queryKey: ["admin-exists"], queryFn: () => check() });
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const fullName = String(fd.get("fullName") ?? "").trim();
    if (fullName.length < 2 || !z.string().email().safeParse(email).success) return setMsg({ tone: "error", text: "Enter your name and a valid email." });
    if (passwordStrength(password).score < 3 || password.length < 8) return setMsg({ tone: "error", text: "Choose a stronger password." });
    if (password !== fd.get("confirm")) return setMsg({ tone: "error", text: "Passwords don't match." });
    setBusy(true);
    const { data: res, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/welcome`, data: { intended_role: "admin", full_name: fullName } } });
    setBusy(false);
    if (error || res.user?.identities?.length === 0) return setMsg({ tone: "error", text: error?.message ?? "An account with this email already exists." });
    setMsg({ tone: "success", text: `Verification link sent to ${email}. Open it to finish creating the administrator account.` });
  }

  return (
    <AuthLayout>
      <p className="text-sm font-semibold text-brand">One-time school setup</p>
      <h2 className="mt-3 text-3xl font-bold">Create the first administrator</h2>
      {isLoading ? <Loader2 className="mt-8 size-5 animate-spin" /> : data?.exists ? (
        <div className="mt-8 space-y-4">
          <FormAlert tone="info">This school already has an administrator. New admin accounts can only be added by an existing admin.</FormAlert>
          <Button asChild className="h-12 w-full bg-brand text-brand-foreground"><Link to="/sign-in">Go to sign in</Link></Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <Field id="fullName" label="Full name"><Input id="fullName" name="fullName" className="h-12 bg-card" /></Field>
          <Field id="email" label="Work email"><Input id="email" name="email" type="email" className="h-12 bg-card" /></Field>
          <Field id="password" label="Password"><PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          <StrengthMeter password={password} />
          <Field id="confirm" label="Confirm password"><PasswordInput id="confirm" name="confirm" autoComplete="new-password" /></Field>
          <Button type="submit" disabled={busy} className="h-12 w-full bg-brand text-brand-foreground hover:bg-brand/90">{busy ? <Loader2 className="size-4 animate-spin" /> : "Create administrator"}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
