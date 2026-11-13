import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Bot,
  Bus,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  ScanLine,
  Settings,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import schoolLogo from "@/assets/school-logo-transparent.png";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolStore } from "@/lib/school-store";
import { useTheme } from "@/components/theme-provider";
import type { AppRole } from "@/lib/auth-client";
import { getCachedRoles, getUserRoles } from "@/lib/route-guards";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; roles: AppRole[] };
const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] }],
  },
  {
    title: "Guardian",
    items: [
      { to: "/attendance", label: "Attendance", icon: BookOpen, roles: ["admin", "teacher"] },
      { to: "/students", label: "Students", icon: Users, roles: ["admin", "principal", "teacher"] },
      { to: "/scanner", label: "Scan ID", icon: ScanLine, roles: ["admin", "teacher"] },
      {
        to: "/reports",
        label: "Reports",
        icon: FileBarChart,
        roles: ["admin", "principal", "teacher"],
      },
      {
        to: "/teacher/results",
        label: "Results",
        icon: GraduationCap,
        roles: ["admin", "teacher"],
      },
    ],
  },
  {
    title: "Modules",
    items: [
      { to: "/cctv", label: "CCTV", icon: ShieldCheck, roles: ["admin", "security"] },
      {
        to: "/connect",
        label: "Connect",
        icon: MessageSquare,
        roles: ["admin", "principal", "teacher"],
      },
      { to: "/pay", label: "Payments", icon: CreditCard, roles: ["admin"] },
      { to: "/fees", label: "Fee invoices", icon: FileText, roles: ["admin", "bursar"] },
      { to: "/staff", label: "Staff", icon: UsersRound, roles: ["admin", "principal"] },
      { to: "/visitors", label: "Visitors", icon: UserCheck, roles: ["admin", "security"] },
      { to: "/bus-tracking", label: "Bus Tracking", icon: Bus, roles: ["admin", "driver"] },
      { to: "/notifications", label: "Notifications", icon: Bell, roles: ["admin", "bursar"] },
      { to: "/assist", label: "Assistant", icon: Bot, roles: ["admin", "principal", "teacher"] },
    ],
  },
];
function Avatar({ url, name }: { url?: string | null | undefined; name?: string | undefined }) {
  const initials = (name ?? "User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
      {url ? <img src={url} alt="Profile" className="size-full object-cover" /> : initials}
    </span>
  );
}
function relativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  return mins < 1 ? "Just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const { state: workspace, changeWorkspace } = useSchoolStore();
  const { theme, toggleTheme } = useTheme();
  const notificationLog: NonNullable<typeof workspace.notificationLog> =
    workspace.notificationLog ?? [];
  const previousNotificationCount = useRef(workspace.notifications);
  const [bellWiggling, setBellWiggling] = useState(false);
  useEffect(() => {
    if (workspace.notifications > previousNotificationCount.current) setBellWiggling(true);
    previousNotificationCount.current = workspace.notifications;
  }, [workspace.notifications]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    const openButton = openMenuRef.current;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    closeMenuRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      openButton?.focus();
    };
  }, [sidebarOpen]);
  useEffect(() => {
    let active = true;
    const cached = getCachedRoles();
    if (cached.length > 0) {
      setRoles(cached);
      return;
    }
    void getUserRoles().then((r) => {
      if (active) setRoles(r);
    });
    return () => {
      active = false;
    };
  }, []);
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.some((role) => roles.includes(role))),
    }))
    .filter((section) => section.items.length > 0);
  const settingsRole =
    roles.find((role) => location.pathname.startsWith(`/portal/${role}`)) ?? roles[0];
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", replace: true });
  };
  const sidebar = (
    <>
      <div className="flex h-[76px] items-center gap-3 border-b border-shell-border px-5">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden bg-transparent">
          <img
            src={workspace.school?.logoUrl ?? schoolLogo}
            alt={`${workspace.school?.name ?? "School"} logo`}
            className="size-full object-contain"
          />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-tight">SchoolPulseOS</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-shell-muted">
            {workspace.school?.name ?? "School workspace"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          ref={closeMenuRef}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.22em] text-shell-muted">
              {section.title}
            </p>
            <nav className="space-y-1">
              {section.items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={label}
                  to={to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex min-h-10 items-center gap-3 rounded-lg border-l-2 px-3 text-[13px] transition-transform ${location.pathname === to ? "border-primary bg-shell-hover font-semibold text-brand" : "border-transparent text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"}`}
                  aria-current={location.pathname === to ? "page" : undefined}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-shell-border p-3">
        <RoleSettingsLink
          role={settingsRole}
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 rounded-lg bg-shell-hover px-3 py-3 hover:bg-accent"
        >
          <Avatar url={workspace.profile?.avatarUrl} name={workspace.profile?.name} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">
              {workspace.profile?.name ?? "Signed-in user"}
            </p>
            <p className="text-xs text-shell-muted">Workspace member</p>
          </div>
          <ChevronDown className="ml-auto size-4 text-shell-muted" />
        </RoleSettingsLink>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-shell-muted hover:bg-shell-hover hover:text-shell-foreground"
          onClick={signOut}
        >
          <LogOut className="size-4" /> Logout
        </Button>
      </div>
    </>
  );
  return (
    <div className="school-doodle-background flex min-h-screen bg-background text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[246px] shrink-0 flex-col border-r border-shell-border bg-shell text-shell-foreground lg:flex">
        {sidebar}
      </aside>
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-overlay lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside
        ref={drawerRef}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(286px,88vw)] flex-col border-r border-shell-border bg-shell text-shell-foreground transition-transform lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen || undefined}
        aria-label={sidebarOpen ? "School navigation" : undefined}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex min-h-[76px] w-full max-w-[1344px] items-center justify-between gap-4 px-3 sm:gap-6 sm:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                aria-label="Open menu"
                onClick={() => setSidebarOpen(true)}
                ref={openMenuRef}
              >
                <Menu className="size-5" />
              </Button>
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:inline">
                  School
                </span>
                <ChevronDown className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
                <span className="truncate text-sm font-semibold">
                  {workspace.school?.name ?? "Current school"}
                </span>
                {workspace.workspaces.length > 1 ? (
                  <select
                    aria-label="Select school workspace"
                    value={workspace.school?.id ?? ""}
                    onChange={(event) => changeWorkspace(event.target.value)}
                    className="h-9 max-w-40 shrink-0 rounded-md border border-input bg-background px-2 text-xs sm:max-w-56 sm:text-sm"
                  >
                    {workspace.workspaces.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <span className="hidden shrink-0 border-l border-border pl-3 text-xs text-muted-foreground xl:inline">
                  {new Date().toLocaleDateString([], {
                    timeZone: workspace.school?.timezone,
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
            <div className="relative flex shrink-0 items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={toggleTheme}
                className="hidden sm:inline-flex"
              >
                {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
              </Button>
              {roles.some((role) => role === "admin" || role === "bursar") ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => setNotificationsOpen((value) => !value)}
                  className="relative"
                >
                  <Bell
                    className={`size-5 ${bellWiggling ? "clay-wiggle" : ""}`}
                    onAnimationEnd={() => setBellWiggling(false)}
                  />
                  {workspace.notifications > 0 ? (
                    <span className="clay-pop absolute right-1 top-1 grid min-w-3.5 place-items-center rounded-full bg-danger px-1 text-[8px] font-bold text-white">
                      {workspace.notifications > 9 ? "9+" : workspace.notifications}
                    </span>
                  ) : null}
                </Button>
              ) : null}
              <RoleSettingsLink
                role={settingsRole}
                className="hidden items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent sm:flex"
              >
                <Avatar url={workspace.profile?.avatarUrl} name={workspace.profile?.name} />
                <div className="hidden leading-tight xl:block">
                  <p className="max-w-28 truncate text-sm font-semibold">
                    {workspace.profile?.name ?? "Signed-in user"}
                  </p>
                  <p className="text-xs text-muted-foreground">Member</p>
                </div>
              </RoleSettingsLink>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-11 sm:size-12"
                aria-label="Settings"
              >
                <RoleSettingsLink role={settingsRole}>
                  <Settings className="size-6" />
                </RoleSettingsLink>
              </Button>
              {notificationsOpen ? (
                <div className="clay-pop absolute right-0 top-14 z-50 w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
                  <div className="flex items-center justify-between border-b border-border px-2 pb-3">
                    <div>
                      <p className="text-sm font-semibold">Notifications</p>
                      <p className="text-xs text-muted-foreground">Recent workspace activity</p>
                    </div>
                    {roles.includes("admin") || roles.includes("bursar") ? (
                      <Link
                        to="/notifications"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs font-semibold text-primary"
                      >
                        View all
                      </Link>
                    ) : (
                      <RoleSettingsLink
                        role={settingsRole}
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs font-semibold text-primary"
                      >
                        View all
                      </RoleSettingsLink>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto py-2">
                    {notificationLog.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-3 rounded-xl px-2 py-3 hover:bg-accent"
                      >
                        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <CheckCircle2 className="size-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium">{item.event}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {item.body}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {relativeTime(item.createdAt)} · {item.status}
                          </p>
                        </div>
                      </div>
                    ))}
                    {notificationLog.length === 0 ? (
                      <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                        No new notifications.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="app-shell-content flex-1 px-3 py-6 sm:px-8 sm:pt-7">
          <div className="mx-auto w-full max-w-[1280px] space-y-6">
            <div className="grid min-w-0 grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-primary">School workspace</span>
                <h1 className="display-title mt-3 text-2xl sm:text-3xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
              </div>
              {actions ? (
                <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2 sm:hidden">{actions}</div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-shell-border bg-shell pb-[env(safe-area-inset-bottom)] text-shell-foreground lg:hidden"
        aria-label="Primary navigation"
      >
        {visibleSections
          .flatMap((section) => section.items)
          .slice(0, 4)
          .map(({ to, label, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              aria-current={location.pathname === to ? "page" : undefined}
              className={`flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[10px] ${location.pathname === to ? "text-primary" : "text-shell-muted"}`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        <button
          type="button"
          className="flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[10px] text-shell-muted"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
          More
        </button>
      </nav>
    </div>
  );
}

function RoleSettingsLink({
  role,
  className,
  onClick,
  children,
}: {
  role: AppRole | undefined;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (role === "parent") {
    return (
      <Link to="/parent/settings" className={className} onClick={onClick}>
        {children}
      </Link>
    );
  }
  if (role && role !== "admin") {
    return (
      <Link
        to="/portal/$role/settings"
        params={{ role }}
        className={className}
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/profile" className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
