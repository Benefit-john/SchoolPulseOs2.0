import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building2,
  ImagePlus,
  KeyRound,
  Moon,
  Music2,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolStore } from "@/lib/school-store";
import { useTheme } from "@/components/theme-provider";
import { useBackgroundMusic } from "@/components/background-music";
import type { AppRole } from "@/lib/auth-client";
import { AccountEmailForm } from "@/components/account-email-form";
import { updateSchoolBranding } from "@/lib/operations.functions";
export const Route = createFileRoute("/profile")({
  ssr: false,
  beforeLoad: async () => {
    const { data: result, error: authError } = await supabase.auth.getUser();
    if (authError || !result.user) throw redirect({ to: "/sign-in" });
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", result.user.id);
    if (error) throw error;
    const roles = (data ?? []).map((item) => item.role as AppRole);
    if (roles.includes("admin")) return;
    const role = roles[0];
    if (role === "parent") throw redirect({ to: "/parent/settings" });
    if (role) throw redirect({ to: "/portal/$role/settings", params: { role } });
    throw redirect({ to: "/welcome" });
  },
  component: ProfilePage,
});
function ProfilePage() {
  const { state, refresh } = useSchoolStore();
  const { theme, toggleTheme } = useTheme();
  const { enabled: musicEnabled, setEnabled: setMusicEnabled } = useBackgroundMusic();
  const saveBranding = useServerFn(updateSchoolBranding);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [notice, setNotice] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [savingSchoolName, setSavingSchoolName] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: userResult } = await supabase.auth.getUser();
      if (!userResult.user || !state.school?.id) {
        if (active) setIsAdmin(false);
        return;
      }
      const { data: membership } = await supabase
        .from("school_memberships")
        .select("role")
        .eq("school_id", state.school.id)
        .eq("user_id", userResult.user.id)
        .maybeSingle();
      if (active) setIsAdmin(membership?.role === "admin");
    })();
    return () => {
      active = false;
    };
  }, [state.school?.id]);
  useEffect(() => {
    setFullName(state.profile?.name ?? "");
    setPhone(state.profile?.phone ?? "");
    setSchoolName(state.school?.name ?? "");
    setPhoto(state.profile?.avatarUrl ?? null);
  }, [state.profile, state.school]);
  const upload = async (file: File, kind: "avatar" | "logo") => {
    if (!state.school) return;
    const user = await supabase.auth.getUser();
    if (!user.data.user) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path =
      kind === "avatar"
        ? `${state.school.id}/avatars/${user.data.user.id}.${ext}`
        : `${state.school.id}/logos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("school-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setNotice(error.message);
      return;
    }
    if (kind === "avatar") {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.data.user.id,
        full_name: fullName || null,
        phone: phone || null,
        avatar_path: path,
      });
      if (profileError) {
        setNotice(profileError.message);
        return;
      }
    } else {
      try {
        await saveBranding({ data: { schoolId: state.school.id, logoPath: path } });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not update the school logo.");
        return;
      }
    }
    await refresh();
    setNotice(`${kind === "avatar" ? "Profile picture" : "School logo"} updated.`);
  };
  const saveProfile = async () => {
    const user = await supabase.auth.getUser();
    if (!user.data.user) return;
    const { error } = await supabase.from("profiles").upsert({
      id: user.data.user.id,
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
    });
    if (error) setNotice(error.message);
    else {
      await refresh();
      setNotice("Profile details saved.");
    }
  };
  const saveSchoolName = async () => {
    if (!state.school || !isAdmin) return;
    const name = schoolName.trim();
    if (name.length < 2) {
      setNotice("Enter a school name with at least two characters.");
      return;
    }
    setSavingSchoolName(true);
    try {
      const updatedSchool = await saveBranding({ data: { schoolId: state.school.id, name } });
      await refresh();
      setSchoolName(updatedSchool.name);
      setNotice("School name saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the school name.");
    } finally {
      setSavingSchoolName(false);
    }
  };
  const choose = (event: React.ChangeEvent<HTMLInputElement>, kind: "avatar" | "logo") => {
    const file = event.target.files?.[0];
    if (file) void upload(file, kind);
  };
  return (
    <AppShell
      title="Settings"
      subtitle="Manage your profile, school branding, appearance, music, and security"
    >
      <div className="mb-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hairline-card p-6 text-center">
          <span className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full border-4 border-muted bg-primary/20 text-xl font-bold text-primary">
            {photo ? (
              <img src={photo} alt="Profile" className="size-full object-cover" />
            ) : (
              <UserRound className="size-8" />
            )}
          </span>
          <h2 className="mt-4 font-semibold">{fullName || "Signed-in user"}</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">Account profile</p>
          <span className="mt-2 inline-flex rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            Workspace member
          </span>
          <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />{" "}
            {state.school?.name ?? "School workspace"}
          </p>
        </aside>
        <div className="space-y-5">
          <section className="hairline-card p-5 sm:p-6">
            <div className="flex gap-3">
              <UserRound className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Personal details</h2>
                <p className="text-sm text-muted-foreground">
                  Your contact details are stored in your authenticated profile.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Label>Profile photo</Label>
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-4">
                <span className="grid size-12 place-items-center overflow-hidden rounded-full bg-muted">
                  {photo ? (
                    <img src={photo} alt="Selected profile" className="size-full object-cover" />
                  ) : (
                    <UserRound className="size-5 text-muted-foreground" />
                  )}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => choose(e, "avatar")}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="size-4" /> Upload picture
                </Button>
                {photo ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                    <Trash2 className="size-4" /> Remove preview
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Images are stored in the school’s private asset bucket.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => void saveProfile()}>Save profile</Button>
            </div>
          </section>
          <section className="hairline-card p-5 sm:p-6">
            <div className="flex gap-3">
              <Building2 className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-semibold">School branding</h2>
                <p className="text-sm text-muted-foreground">
                  Only administrators can change the school name and logo.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="school-name">School name</Label>
                <Input
                  id="school-name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  disabled={!state.school || !isAdmin}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveSchoolName()}
                  disabled={!state.school || !isAdmin || savingSchoolName || !schoolName.trim()}
                >
                  {savingSchoolName ? "Saving…" : "Save school name"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => choose(e, "logo")}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoRef.current?.click()}
                  disabled={!state.school || !isAdmin}
                >
                  <ImagePlus className="size-4" /> Upload school logo
                </Button>
                <span className="text-xs text-muted-foreground">PNG, JPG, or WebP</span>
              </div>
            </div>
          </section>
          <section className="hairline-card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="font-semibold">Appearance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your choice applies across Settings, login, portals, and the dashboard on this
                device.
              </p>
            </div>
            <Button variant="ghost" onClick={toggleTheme}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Button>
          </section>
          <section className="hairline-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div className="flex gap-3">
              <Music2 className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Background music</h2>
                <p className="text-sm text-muted-foreground">
                  Play a soft ambient loop across login and school pages.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={musicEnabled}
              onClick={() => setMusicEnabled(!musicEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${musicEnabled ? "bg-primary" : "bg-muted"}`}
            >
              <span
                className={`size-5 rounded-full bg-white shadow transition-transform ${musicEnabled ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </section>
          <AccountEmailForm />
          <section className="hairline-card p-5 sm:p-6">
            <div className="flex gap-3">
              <KeyRound className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-semibold">Security</h2>
                <p className="text-sm text-muted-foreground">
                  Manage your password and active account sessions.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/security">Open security</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/forgot-password">Reset password</Link>
              </Button>
            </div>
          </section>
          {notice ? (
            <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
