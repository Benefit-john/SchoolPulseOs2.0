export type AppRole =
  | "admin"
  | "principal"
  | "teacher"
  | "bursar"
  | "security"
  | "parent"
  | "student"
  | "librarian"
  | "nurse"
  | "driver"
  | "staff";

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  principal: "Principal",
  teacher: "Teacher",
  bursar: "Bursar",
  security: "Security",
  parent: "Parent",
  student: "Student",
  librarian: "Librarian",
  nurse: "Nurse",
  driver: "Driver",
  staff: "Staff",
};

export const roleDescriptions: Record<AppRole, string> = {
  admin: "Full school setup, role management, data oversight, announcements, and assets.",
  principal: "Read-only oversight of students, attendance, staff, and school announcements.",
  teacher: "Attendance, results, assignments, timetable, and family communication.",
  bursar: "Fees, balances, payments, receipts, and installment follow-up.",
  security: "Visitors, activity log, and authorized CCTV monitoring.",
  parent: "Your child’s attendance, results, assignments, timetable, fees, and messages.",
  student: "Your attendance, results, assignments, timetable, announcements, and payment status.",
  librarian: "Library workflows are not enabled yet; messages remain available.",
  nurse: "Health workflows are not enabled yet; sensitive records are intentionally unavailable.",
  driver: "Assigned route visibility will activate when a GPS provider is connected.",
  staff: "School updates and account information for school staff.",
};

export function roleHome(role: AppRole | undefined) {
  if (role === "admin") return { to: "/" as const };
  if (role === "parent") return { to: "/parent" as const };
  if (role) return { to: "/portal/$role" as const, params: { role } };
  return { to: "/welcome" as const };
}

export const IDLE_LIMIT_MS = 30 * 60_000;
const EPHEMERAL_KEY = "sp-ephemeral-session";
const TAB_KEY = "sp-tab-alive";

/** "Remember me" off: end the session when the browser is closed. */
export function setRememberMe(remember: boolean) {
  if (remember) localStorage.removeItem(EPHEMERAL_KEY);
  else localStorage.setItem(EPHEMERAL_KEY, "1");
  sessionStorage.setItem(TAB_KEY, "1");
}

export function shouldEndEphemeralSession() {
  return localStorage.getItem(EPHEMERAL_KEY) === "1" && !sessionStorage.getItem(TAB_KEY);
}

export function passwordStrength(pw: string) {
  const checks = [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "Upper and lower case letters", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score, label: ["Too weak", "Weak", "Fair", "Good", "Strong"][score]! };
}
