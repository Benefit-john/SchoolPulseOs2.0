import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { requireRoles } from "@/lib/route-guards";
import type { AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/security")({
  beforeLoad: () =>
    requireRoles([
      "admin",
      "principal",
      "teacher",
      "bursar",
      "security",
      "parent",
      "student",
      "librarian",
      "nurse",
      "driver",
      "staff",
    ]),
  head: () => ({
    meta: [
      { title: "Account security | SchoolPulseOS" },
      { name: "description", content: "Manage your SchoolPulseOS password and account sessions." },
    ],
  }),
  component: SecurityPage,
});
function SecurityPage() {
  const { roles } = Route.useRouteContext();
  const activeRole = roles[0] as AppRole | undefined;
  const dashboardHref =
    activeRole === "admin"
      ? "/"
      : activeRole === "parent"
        ? "/parent"
        : activeRole
          ? `/portal/${activeRole}`
          : "/welcome";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    if (password.length < 8) return setNotice("Use at least 8 characters for your new password.");
    if (password !== confirm) return setNotice("The passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setNotice(error ? error.message : "Password updated successfully.");
    if (!error) {
      setPassword("");
      setConfirm("");
    }
  }
  async function signOutEverywhere() {
    setBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    setBusy(false);
    setNotice(error ? error.message : "All other sessions have been signed out.");
  }
  return (
    <AppShell
      title="Account security"
      subtitle="Keep your sign-in and active sessions under control"
    >
      <div className="mb-2">
        <Button asChild variant="outline" size="sm">
          <a href={dashboardHref}>
            <ArrowLeft className="size-4" /> Dashboard
          </a>
        </Button>
      </div>
      <div className="grid max-w-3xl gap-5">
        <section className="hairline-card p-5 sm:p-6">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Change password</h2>
              <p className="text-sm text-muted-foreground">
                Choose a new password for this school account.
              </p>
            </div>
          </div>
          <form onSubmit={updatePassword} className="mt-5 grid gap-4 sm:max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              Update password
            </Button>
          </form>
        </section>
        <section className="hairline-card p-5 sm:p-6">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Active sessions</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Sign out other browsers if you no longer recognise a session. You can sign back in
                normally on any trusted device.
              </p>
            </div>
          </div>
          <Button
            className="mt-5"
            variant="outline"
            disabled={busy}
            onClick={() => void signOutEverywhere()}
          >
            Sign out other sessions
          </Button>
        </section>
        {notice ? (
          <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
