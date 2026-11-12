import { Link } from "@tanstack/react-router";
import { KeyRound, Moon, Settings, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useBackgroundMusic } from "@/components/background-music";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { roleLabels, type AppRole } from "@/lib/auth-client";

const roleSettingsCopy: Record<AppRole, string> = {
  admin: "Your personal profile and school workspace controls.",
  principal: "Your contact information and read-only school access.",
  teacher: "Your contact information for classroom and family communication.",
  bursar: "Your contact information for fee and payment operations.",
  security: "Your contact information for visitor and gate operations.",
  parent: "Your family account and personal preferences.",
  student: "Your student account and personal preferences.",
  librarian: "Your account preferences for library work.",
  nurse: "Your account preferences for health services.",
  driver: "Your account preferences for assigned routes.",
  staff: "Your account information for school staff.",
};

export function RolePortalSettings({ role, user }: { role: AppRole; user: User }) {
  const { theme, toggleTheme } = useTheme();
  const { enabled, isPlaying, setEnabled } = useBackgroundMusic();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase
      .from("profiles")
      .select("full_name,phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({
          data,
          error,
        }: {
          data: { full_name: string | null; phone: string | null } | null;
          error: { message: string } | null;
        }) => {
          if (!active) return;
          if (error) setNotice(error.message);
          setName(data?.full_name ?? "");
          setPhone(data?.phone ?? "");
        },
      );
    return () => {
      active = false;
    };
  }, [user.id]);

  const save = async () => {
    setSaving(true);
    setNotice("");
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, full_name: name.trim() || null, phone: phone.trim() || null });
    setSaving(false);
    setNotice(error ? error.message : "Profile saved.");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-7 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {roleLabels[role]} portal
            </p>
            <h1 className="mt-2 text-3xl font-bold">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">{roleSettingsCopy[role]}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/portal/$role" params={{ role }}>
              <Settings className="size-4" />
              Back to portal
            </Link>
          </Button>
        </header>
        <section className="hairline-card mt-6 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Personal details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only your own account contact details are editable here.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-name">Full name</Label>
              <Input
                id="role-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-phone">Phone number</Label>
              <Input
                id="role-phone"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <Label htmlFor="role-email">Account email</Label>
            <Input id="role-email" className="mt-2" value={user.email ?? ""} disabled readOnly />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
            {notice ? (
              <p role="status" className="text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}
          </div>
        </section>
        <section className="hairline-card mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Theme preference for this device.</p>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
        </section>
        <section className="hairline-card mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Background music</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {enabled
                ? isPlaying
                  ? "Ambient music is playing on this device."
                  : "Music will start after your next tap or key press."
                : "Background music is off."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Background music"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full ${enabled ? "bg-primary" : "bg-muted"}`}
          >
            <span
              className={`size-5 rounded-full bg-white shadow ${enabled ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </section>
        <section className="hairline-card mt-4 p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Account security</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage your password and active sessions.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/security">Manage sessions</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/forgot-password">Reset password</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}



