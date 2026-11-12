import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { School } from "lucide-react";

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-foreground"
          >
            <School aria-hidden="true" className="size-5 text-primary" />
            SchoolPulseOS
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign in
          </Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold text-primary">SchoolPulseOS / Legal</p>
        <h1 className="mt-3 font-serif text-4xl font-medium leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{summary}</p>
        <p className="mt-5 text-sm text-muted-foreground">Last updated November 2, 2026</p>
        <div className="legal-content mt-10 space-y-8">{children}</div>
      </article>
      <footer className="border-t border-border">
        <nav
          aria-label="Legal information"
          className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center gap-x-6 px-5 sm:px-8"
        >
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Terms and Conditions
          </Link>
        </nav>
      </footer>
    </main>
  );
}
