import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { FormAlert, HelpLink } from "@/components/auth-kit";
import { supabase } from "@/integrations/supabase/client";
import { completeRegistration } from "@/lib/auth.functions";
import { roleHome, type AppRole } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({ meta: [
    { title: "Setting up your account | SchoolPulseOS" },
    { name: "description", content: "Finishing your SchoolPulseOS account setup." },
    { property: "og:title", content: "Setting up your account | SchoolPulseOS" },
    { property: "og:description", content: "Finishing your account setup." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  const complete = useServerFn(completeRegistration);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await complete();
      if (!res.roles.length) { setError(res.error ?? "Your account is waiting for a role."); return; }
      const { data: profile } = await supabase.from("profiles").select("onboarded").maybeSingle();
      if (!profile?.onboarded) navigate({ to: "/onboarding", replace: true });
      else navigate({ ...roleHome(res.roles[0] as AppRole), replace: true });
    })().catch(() => setError("Something went wrong finishing your setup. Please refresh."));
  }, [complete, navigate]);

  return (
    <AuthLayout compact>
      <section className="hairline-card bg-card p-8 text-center">
        {error ? <FormAlert>{error}</FormAlert> : <><Loader2 className="mx-auto size-6 animate-spin text-primary" /><p className="mt-4 text-sm text-muted-foreground">Finishing your account setup…</p></>}
        <HelpLink />
      </section>
    </AuthLayout>
  );
}
