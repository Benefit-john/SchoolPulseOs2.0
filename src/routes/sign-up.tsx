import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthLayout, AuthSwitch } from "@/components/auth-layout";
import { Field, FormAlert, HelpLink, PasswordInput, StrengthMeter } from "@/components/auth-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { validateRegistration } from "@/lib/auth.functions";
import { passwordStrength } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-up")({
  head: () => ({
    meta: [
      { title: "Create account | SchoolPulseOS" },
      {
        name: "description",
        content: "Parents and students can create a verified SchoolPulseOS school account.",
      },
      { property: "og:title", content: "Create account | SchoolPulseOS" },
      { property: "og:description", content: "Verified accounts for parents and students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SignUpPage,
});

type Kind = "parent" | "student";

const base = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => !v || /^\+?[\d\s-]{7,20}$/.test(v), "Enter a valid phone number"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(72)
    .refine(
      (v) => passwordStrength(v).score >= 3,
      "Choose a stronger password (see the tips below)",
    ),
  confirm: z.string(),
  studentCode: z.string().trim().min(3, "Enter the student ID").max(40),
  dateOfBirth: z.string().max(10).optional(),
  registrationCode: z.string().trim().max(40).optional(),
  terms: z.literal(true, { message: "Please accept the terms and privacy policy" }),
});

const parentSchema = base.extend({
  fullName: z.string().trim().min(2, "Enter your full name").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,20}$/, "Enter a valid phone number"),
  relationship: z.string().min(1, "Choose your relationship"),
});

function SignUpPage() {
  const validate = useServerFn(validateRegistration);
  const [kind, setKind] = useState<Kind>("parent");
  const [password, setPassword] = useState("");
  const [relationship, setRelationship] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const raw = {
      fullName: fd.get("fullName") ?? "",
      email: fd.get("email"),
      phone: fd.get("phone") ?? "",
      password,
      confirm: fd.get("confirm"),
      studentCode: fd.get("studentCode"),
      dateOfBirth: (fd.get("dateOfBirth") as string) || undefined,
      registrationCode: (fd.get("registrationCode") as string) || undefined,
      relationship,
      terms,
    };
    const parsed = (kind === "parent" ? parentSchema : base).safeParse(raw);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (raw.password !== raw.confirm) errs["confirm"] = "Passwords don't match";
    if (!raw.dateOfBirth && !raw.registrationCode)
      errs["registrationCode"] = "Enter the date of birth or the school registration code";
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;

    setBusy(true);
    try {
      const d = parsed.data as z.infer<typeof parentSchema>;
      const check = await validate({
        data: {
          role: kind,
          studentCode: d.studentCode,
          dateOfBirth: d.dateOfBirth,
          registrationCode: d.registrationCode,
        },
      });
      if (!check.ok) {
        setFormError(check.message);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: d.email,
        password: d.password,
        options: {
          emailRedirectTo: `${window.location.origin}/welcome`,
          data: {
            intended_role: kind,
            full_name: d.fullName || undefined,
            phone: d.phone || undefined,
            student_code: d.studentCode,
            date_of_birth: d.dateOfBirth,
            registration_code: d.registrationCode,
            relationship: kind === "parent" ? d.relationship : undefined,
          },
        },
      });
      if (error) {
        setFormError(
          error.message.toLowerCase().includes("registered")
            ? "An account with this email already exists. Sign in instead, or use “Forgot password?” to recover it."
            : error.message,
        );
        return;
      }
      if (data.user && data.user.identities?.length === 0) {
        setFormError(
          "An account with this email already exists. Sign in instead, or use “Forgot password?” to recover it.",
        );
        return;
      }
      setSentTo(d.email);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout compact portal={kind}>
        <section className="glass-inner-card p-7 text-center sm:p-9">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-bold">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-semibold text-foreground">{sentTo}</span>. Open it to verify your{" "}
            {kind === "parent" ? "account and complete the student link" : "student account"}.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full"
            disabled={resendBusy}
            onClick={async () => {
              setResendBusy(true);
              setFormError(null);
              try {
                const { error } = await supabase.auth.resend({
                  type: "signup",
                  email: sentTo,
                  options: { emailRedirectTo: `${window.location.origin}/welcome` },
                });
                setFormError(
                  error
                    ? "We couldn't resend the verification email. Try again shortly."
                    : "Verification email sent again.",
                );
              } catch {
                setFormError(
                  "We couldn't reach the email service. Check your connection and try again.",
                );
              } finally {
                setResendBusy(false);
              }
            }}
          >
            {resendBusy ? <Loader2 className="size-4 animate-spin" /> : "Resend email"}
          </Button>
          {formError ? (
            <p className="mt-3 text-xs text-muted-foreground" role="status" aria-live="polite">
              {formError}
            </p>
          ) : null}
          <AuthSwitch label="Already verified?" action="Sign in" to="/sign-in" />
        </section>
      </AuthLayout>
    );
  }

  const inputCls = "glass-input h-11";
  const aria = (k: string) => ({
    "aria-invalid": !!errors[k] || undefined,
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
  });

  return (
    <AuthLayout compact portal={kind}>
      <section className="glass-inner-card p-6 sm:p-9">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Create your {kind === "parent" ? "parent" : "student"} account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {kind === "parent"
              ? "Connect to your child’s verified school record."
              : "Connect to your verified student school record."}
          </p>
        </div>
        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as Kind);
            setErrors({});
            setFormError(null);
          }}
          className="mt-6"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="parent">Parent / Guardian</TabsTrigger>
            <TabsTrigger value="student">Student</TabsTrigger>
          </TabsList>
        </Tabs>
        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          {formError ? <FormAlert>{formError}</FormAlert> : null}
          {kind === "parent" ? (
            <Field id="fullName" label="Full name" error={errors["fullName"]}>
              <Input
                id="fullName"
                name="fullName"
                autoComplete="name"
                placeholder="Adaeze Nwosu"
                className={inputCls}
                {...aria("fullName")}
              />
            </Field>
          ) : null}
          <Field id="email" label="Email" error={errors["email"]}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              className={inputCls}
              {...aria("email")}
            />
          </Field>
          <Field
            id="phone"
            label={kind === "parent" ? "Phone number" : "Phone number (optional)"}
            error={errors["phone"]}
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+234 803 000 0000"
              className={inputCls}
              {...aria("phone")}
            />
          </Field>
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {kind === "parent" ? "Your child" : "Your school details"}
            </p>
            <Field id="studentCode" label="Student ID" error={errors["studentCode"]}>
              <Input
                id="studentCode"
                name="studentCode"
                placeholder="CL-2026-001"
                className={inputCls}
                {...aria("studentCode")}
              />
            </Field>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <Field id="dateOfBirth" label="Date of birth">
                <Input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  className={`${inputCls} min-w-0 w-full`}
                />
              </Field>
              <Field
                id="registrationCode"
                label="or registration code"
                error={errors["registrationCode"]}
              >
                <Input
                  id="registrationCode"
                  name="registrationCode"
                  placeholder="From the school"
                  className={`${inputCls} min-w-0 w-full`}
                  {...aria("registrationCode")}
                />
              </Field>
            </div>
            {kind === "parent" ? (
              <Field
                id="relationship"
                label="Relationship to student"
                error={errors["relationship"]}
              >
                <Select value={relationship} onValueChange={setRelationship}>
                  <SelectTrigger id="relationship" className={inputCls} {...aria("relationship")}>
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Mother", "Father", "Guardian", "Grandparent", "Other relative"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
          <Field id="password" label="Password" error={errors["password"]}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              invalid={!!errors["password"]}
              className="h-11"
            />
          </Field>
          <StrengthMeter password={password} />
          <Field id="confirm" label="Confirm password" error={errors["confirm"]}>
            <PasswordInput
              id="confirm"
              name="confirm"
              autoComplete="new-password"
              invalid={!!errors["confirm"]}
              className="h-11"
            />
          </Field>
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                className="mt-0.5"
                aria-invalid={!!errors["terms"] || undefined}
              />
              <div className="text-sm leading-snug">
                <Label htmlFor="terms" className="font-normal">
                  I agree to the school's
                </Label>{" "}
                <Link to="/terms" className="underline underline-offset-4">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline underline-offset-4">
                  Privacy Policy
                </Link>
                .
              </div>
            </div>
            {errors["terms"] ? (
              <p id="terms-error" role="alert" className="text-xs font-medium text-destructive">
                {errors["terms"]}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="auth-primary-button h-11 w-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Teacher or staff member? Your school admin will send you an invitation.{" "}
          <Link to="/setup" className="underline">
            School setup
          </Link>
        </p>
        <AuthSwitch label="Already have an account?" action="Sign in" to="/sign-in" />
        <HelpLink />
      </section>
    </AuthLayout>
  );
}
