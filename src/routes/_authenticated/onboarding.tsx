import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { Field, FormAlert } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { roleHome, type AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [
    { title: "Complete your profile | SchoolPulseOS" },
    { name: "description", content: "Add your details and profile photo." },
    { property: "og:title", content: "Complete your profile | SchoolPulseOS" },
    { property: "og:description", content: "Add your details and profile photo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Onboarding,
});

function Onboarding() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle().then(({ data }) => {
      setFullName(data?.full_name ?? "");
      setPhone(data?.phone ?? "");
    });
  }, [user.id]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setError("Use a JPG, PNG or WebP image.");
    if (f.size > 5 * 1024 * 1024) return setError("Photo must be smaller than 5 MB.");
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) return setError("Enter your full name.");
    if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) return setError("Enter a valid phone number.");
    setBusy(true);
    let avatar_path: string | undefined;
    if (file) {
      const path = `${user.id}/avatar-${Date.now()}.${file.type.split("/")[1]}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) { setBusy(false); return setError("Photo upload failed. Try again."); }
      avatar_path = path;
    }
    const { error: err } = await supabase.from("profiles").upsert({ id: user.id, full_name: fullName.trim(), phone: phone.replace(/[^\d+]/g, "") || null, onboarded: true, ...(avatar_path ? { avatar_path } : {}) });
    if (err) { setBusy(false); return setError(err.code === "23505" ? "That phone number is already used by another account." : "Could not save your profile."); }
    const { data: roles } = await supabase.from("user_roles").select("role");
    navigate({ ...roleHome(roles?.[0]?.role as AppRole | undefined), replace: true });
  }

  return (
    <AuthLayout compact>
      <section className="hairline-card bg-card p-7 sm:p-9">
        <h1 className="text-2xl font-bold">Complete your profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">This helps the school recognise you.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="flex items-center gap-4">
            <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary">
              {preview ? <img src={preview} alt="Profile preview" className="size-full object-cover" /> : <Camera className="size-7" />}
            </span>
            <label className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent focus-within:outline-2 focus-within:outline-ring">
              Upload photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
          </div>
          <Field id="fullName" label="Full name"><Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11" /></Field>
          <Field id="phone" label="Phone number"><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" /></Field>
          <Button type="submit" disabled={busy} className="h-11 w-full bg-brand text-brand-foreground hover:bg-brand/90">{busy ? <Loader2 className="size-4 animate-spin" /> : "Save and continue"}</Button>
        </form>
      </section>
    </AuthLayout>
  );
}
