import { useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountEmailForm() {
  const [currentEmail, setCurrentEmail] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const value = data.user?.email ?? "";
      setCurrentEmail(value);
      setEmail(value);
    });
  }, []);

  async function updateEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || nextEmail === currentEmail) {
      setNotice("Enter a new email address to continue.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.updateUser({ email: nextEmail });
    setBusy(false);
    setNotice(
      error
        ? error.message
        : "Confirmation links were sent. Confirm the new address before using it to sign in.",
    );
  }

  return (
    <section className="hairline-card p-5 sm:p-6">
      <div className="flex gap-3">
        <Mail className="mt-0.5 size-5 text-primary" />
        <div>
          <h2 className="font-semibold">Login email</h2>
          <p className="text-sm text-muted-foreground">
            Change the email used for administrator sign-in. Supabase will require confirmation.
          </p>
        </div>
      </div>
      <form
        onSubmit={updateEmail}
        className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="account-email">Email address</Label>
          <Input
            id="account-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@school.example"
          />
          <p className="text-xs text-muted-foreground">Current: {currentEmail || "Loading…"}</p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Update login email"}
        </Button>
      </form>
      {notice ? (
        <p className="mt-3 text-sm text-primary" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
