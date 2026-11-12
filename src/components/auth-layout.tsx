import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import campusImage from "@/assets/sign-in-campus.jpg";
import schoolLogo from "@/assets/school-logo-transparent.png";
import { useTheme } from "@/components/theme-provider";

type PortalKey = "all" | "admin" | "parent" | "student" | "teacher" | "staff";
type PortalCopy = Record<
  PortalKey,
  { eyebrow: string; title: string; detail: string; features: string[] }
>;
const portalCopy: PortalCopy = {
  all: {
    eyebrow: "School operations",
    title: "School operations, in one place.",
    detail:
      "Record attendance, manage fees, share updates with families, and review school activity.",
    features: [
      "Attendance and student records",
      "Fees and payment records",
      "Updates for families",
    ],
  },
  admin: {
    eyebrow: "Admin workspace",
    title: "Run the school day from one workspace.",
    detail: "Review attendance, fees, staff activity, and family communication.",
    features: [
      "Attendance and student records",
      "Fees and payment records",
      "Staff and family updates",
    ],
  },
  parent: {
    eyebrow: "Parent portal",
    title: "Your child's school updates, in one place.",
    detail: "Check attendance, results, fees, timetables, and messages shared by the school.",
    features: ["Attendance and results", "Fees and timetables", "Messages from school"],
  },
  student: {
    eyebrow: "Student portal",
    title: "Keep track of your school day.",
    detail: "View your attendance, results, assignments, timetable, and fee information.",
    features: ["Attendance and results", "Assignments and timetable", "Fee information"],
  },
  teacher: {
    eyebrow: "Teacher workspace",
    title: "Class records within reach.",
    detail: "Manage registers, results, assignments, timetables, and student support.",
    features: ["Registers and results", "Assignments and timetables", "Student support"],
  },
  staff: {
    eyebrow: "Operations workspace",
    title: "Keep school operations organised.",
    detail: "Review visitor activity, gate records, staff operations, and safety events.",
    features: ["Visitor records", "Gate activity", "Safety events"],
  },
};

export function AuthLayout({
  children,
  compact = false,
  portal = "all",
}: {
  children: ReactNode;
  compact?: boolean;
  portal?: PortalKey;
}) {
  const copy = portalCopy[portal];
  if (compact) {
    return (
      <main className="auth-stage auth-stage-compact school-doodle-background grid min-h-screen place-items-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md">
          <header className="mb-6 flex items-center justify-between">
            <AuthBrand compact />
            <ThemeToggle />
          </header>
          <div className="auth-panel max-h-[calc(100vh-9rem)] overflow-y-auto p-1 sm:p-2">
            {children}
          </div>
          <AuthFooter />
        </div>
      </main>
    );
  }
  return (
    <main className="auth-stage auth-stage-wide grid min-h-screen min-w-0 grid-cols-1 overflow-x-hidden lg:grid-cols-[minmax(0,1fr)_minmax(27rem,.78fr)]">
      <img className="auth-background-image" src={campusImage} alt="" aria-hidden="true" />
      <section className="auth-summary relative z-10 flex min-w-0 flex-col justify-between gap-12 px-6 py-7 sm:px-10 sm:py-10 lg:min-h-screen lg:px-14 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <AuthBrand inverse />
          <ThemeToggle />
        </header>
        <div className="auth-summary-copy max-w-2xl">
          <p className="text-sm font-semibold">{copy.eyebrow}</p>
          <h1 className="mt-5 max-w-xl font-serif text-4xl leading-tight sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 opacity-85">{copy.detail}</p>
          <ul className="mt-8 max-w-xl border-t border-current/20">
            {copy.features.map((feature) => (
              <li key={feature} className="border-b border-current/20 py-3 text-sm">
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">Access is provided by your school.</p>
      </section>
      <section className="auth-form-area school-doodle-background relative z-10 flex min-w-0 items-center justify-center px-4 py-8 sm:px-10 lg:min-h-screen">
        <div className="w-full max-w-lg">
          <div className="auth-panel max-h-[calc(100vh-9rem)] overflow-y-auto p-1 sm:p-2">
            {children}
          </div>
          <AuthFooter />
        </div>
      </section>
    </main>
  );
}
function AuthBrand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <Link
      to="/sign-in"
      className={`auth-brand flex min-h-11 min-w-0 items-center gap-3 ${compact ? "justify-center" : ""} ${inverse ? "auth-brand-inverse" : ""}`}
    >
      <span className="grid size-11 shrink-0 place-items-center">
        <img
          src={schoolLogo}
          alt=""
          aria-hidden="true"
          className={`auth-brand-logo max-h-full max-w-full object-contain ${inverse ? "auth-brand-logo-inverse" : ""}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">SchoolPulseOS</span>
        <span className="block text-xs opacity-70">School operations</span>
      </span>
    </Link>
  );
}
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-current/25 bg-transparent text-current transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
function AuthFooter() {
  return (
    <nav aria-label="Legal information" className="mt-4 flex flex-wrap justify-center gap-x-2">
      <Link
        to="/privacy"
        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Privacy Policy
      </Link>
      <Link
        to="/terms"
        className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Terms and Conditions
      </Link>
    </nav>
  );
}

export function AuthSwitch({
  label,
  action,
  to,
}: {
  label: string;
  action: string;
  to: "/sign-in" | "/sign-up";
}) {
  return (
    <p className="mt-5 text-center text-sm text-muted-foreground">
      {label}{" "}
      <Link to={to} className="font-medium text-foreground underline underline-offset-4">
        {action}
      </Link>
    </p>
  );
}
