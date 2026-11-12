import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { Field, FormAlert } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteStaffMember } from "@/lib/auth.functions";
import { roleLabels, type AppRole } from "@/lib/auth-client";
import { requireRoles } from "@/lib/route-guards";

export const Route = createFileRoute("/_authenticated/admin/users")({
  beforeLoad: () => requireRoles(["admin"]),
  head: () => ({
    meta: [
      { title: "Invite school team members | SchoolPulseOS" },
      {
        name: "description",
        content: "Admins assign least-privilege roles to school team members.",
      },
      { property: "og:title", content: "Invite school team members | SchoolPulseOS" },
      { property: "og:description", content: "Admins assign least-privilege school roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  const invite = useServerFn(inviteStaffMember);
  const [role, setRole] = useState<Exclude<AppRole, "admin" | "parent" | "student">>("teacher");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = z
      .object({ fullName: z.string().trim().min(2), email: z.string().trim().email() })
      .safeParse({ fullName: fd.get("fullName"), email: fd.get("email") });
    if (!parsed.success) return setMsg({ tone: "error", text: "Enter a name and a valid email." });
    setBusy(true);
    try {
      const res = await invite({ data: { ...parsed.data, role, origin: window.location.origin } });
      setMsg({ tone: res.ok ? "success" : "error", text: res.message });
      if (res.ok) form.reset();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : "Invite failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Invite school team members"
      subtitle="Assign the narrowest role needed for each new account."
    >
      <section className="hairline-card max-w-xl p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {msg ? <FormAlert tone={msg.tone}>{msg.text}</FormAlert> : null}
          <Field id="fullName" label="Full name">
            <Input id="fullName" name="fullName" className="h-11" />
          </Field>
          <Field id="email" label="Email">
            <Input id="email" name="email" type="email" className="h-11" />
          </Field>
          <Field id="role" label="Role">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Exclude<AppRole, "admin" | "parent" | "student">)}
            >
              <SelectTrigger id="role" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "principal",
                    "teacher",
                    "bursar",
                    "security",
                    "librarian",
                    "nurse",
                    "driver",
                    "staff",
                  ] as const
                ).map((item) => (
                  <SelectItem key={item} value={item}>
                    {roleLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Send invitation"}
          </Button>
        </form>
      </section>
    </AppShell>
  );
}
