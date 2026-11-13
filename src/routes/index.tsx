import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  Cake,
  CheckCircle2,
  Clock3,
  CreditCard,
  DoorOpen,
  FileCheck2,
  LogOut,
  ScanLine,
  Users,
  Wallet,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { formatCount, formatNaira } from "@/lib/format";
import { requireRoles } from "@/lib/route-guards";
import { useSchoolStore } from "@/lib/school-store";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin"]),
  component: Dashboard,
});

function greeting(timeZone?: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="hairline-card min-w-0 p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="display-title text-base">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Dashboard() {
  const { state, stats } = useSchoolStore();
  const attention = state.students.filter(
    (student) => student.status === "Absent" || student.status === "Late",
  );

  if (state.loading) {
    return (
      <AppShell title="Loading workspace" subtitle="Connecting to your school data">
        <div className="hairline-card p-8 text-sm text-muted-foreground">Loading tenant data…</div>
      </AppShell>
    );
  }
  if (state.error) {
    return (
      <AppShell title="Workspace unavailable" subtitle="Your account needs a school assignment">
        <div className="hairline-card border-danger/30 bg-danger/5 p-6 text-sm text-danger">
          {state.error}
        </div>
      </AppShell>
    );
  }

  const timeZone = state.school?.timezone;
  const schoolName = state.school?.name ?? "School workspace";
  return (
    <AppShell
      title={greeting(timeZone)}
      subtitle={`${new Date().toLocaleDateString([], {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })} · ${schoolName}`}
      actions={
        <Button asChild size="sm" className="gap-2">
          <Link to="/scanner">
            <ScanLine className="size-4" /> Open scanner
          </Link>
        </Button>
      }
    >
      {attention.length ? (
        <section className="hairline-card flex min-w-0 flex-wrap items-center gap-4 border-danger/30 bg-danger/5 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{attention.length} students need attention</p>
            <p className="text-sm text-muted-foreground">
              Late arrivals and confirmed absences for today.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/attendance">Review attendance</Link>
          </Button>
        </section>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Present today"
          value={formatCount(stats.present)}
          icon={CheckCircle2}
          hero
        />
        <KpiCard label="Absent" value={formatCount(stats.absent)} icon={DoorOpen} />
        <KpiCard label="Late arrivals" value={formatCount(stats.late)} icon={Clock3} />
        <KpiCard label="Not yet marked" value={formatCount(stats.unmarked)} icon={FileCheck2} />
        <KpiCard label="Checked out" value={formatCount(stats.checkedOut)} icon={LogOut} />
        <KpiCard
          label="Students on roll"
          value={formatCount(stats.roll)}
          icon={Users}
          hint="active"
        />
        <KpiCard
          label="Notifications queued"
          value={formatCount(state.notifications)}
          icon={CheckCircle2}
        />
        <KpiCard label="Revenue today" value={formatNaira(state.revenueToday)} icon={Wallet} />
        <KpiCard
          label="Outstanding balances"
          value={formatNaira(state.students.reduce((sum, student) => sum + student.balance, 0))}
          icon={CreditCard}
        />
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Birthday list" description="Student birthdays require date-of-birth records">
          <div className="flex min-h-24 items-center gap-3 rounded-lg bg-muted/50 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/20 text-gold">
              <Cake className="size-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              Birthday automation will appear once student records include dates of birth.
            </p>
          </div>
        </Panel>
        <Panel
          title="Live activity"
          description="Most recent school operations"
          action={
            <Link to="/notifications" className="text-xs font-semibold text-primary">
              Notification log <ArrowUpRight className="ml-1 inline size-3" />
            </Link>
          }
        >
          <ul className="space-y-4">
            {state.activity.slice(0, 5).map((activity) => (
              <li key={activity.id} className="flex gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    activity.tone === "success"
                      ? "bg-success"
                      : activity.tone === "warning"
                        ? "bg-warning"
                        : "bg-info"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{activity.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{activity.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Needs attention" description="Records that may need a follow-up">
          <div className="space-y-3">
            {attention.slice(0, 4).map((student) => (
              <div
                key={student.id}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full ${
                    student.status === "Late"
                      ? "bg-warning/15 text-warning"
                      : "bg-danger/10 text-danger"
                  }`}
                >
                  <AlertTriangle className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{student.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.cls} · {student.status}
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/attendance">Review</Link>
                </Button>
              </div>
            ))}
            {attention.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups right now.</p>
            ) : null}
          </div>
        </Panel>
        <Panel title="Attendance summary" description="Today’s live register">
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success"
              style={{
                width: `${stats.roll ? Math.round((stats.present / stats.roll) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span>
              <span className="mr-2 inline-block size-2 rounded-full bg-success" />
              Present {stats.present}
            </span>
            <span>
              <span className="mr-2 inline-block size-2 rounded-full bg-warning" />
              Late {stats.late}
            </span>
            <span>
              <span className="mr-2 inline-block size-2 rounded-full bg-danger" />
              Absent {stats.absent}
            </span>
            <span>
              <span className="mr-2 inline-block size-2 rounded-full bg-muted-foreground" />
              Unmarked {stats.unmarked}
            </span>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
