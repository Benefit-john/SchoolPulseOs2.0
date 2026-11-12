import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BookOpen,
  Bus,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LogOut,
  MessageSquare,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  Users,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { roleDescriptions, roleHome, roleLabels, type AppRole } from "@/lib/auth-client";
import {
  ACTIVE_WORKSPACE_CHANGED,
  getActiveWorkspaceId,
  rememberActiveWorkspace,
  selectActiveWorkspace,
} from "@/lib/workspace-selection";

const portals: Record<AppRole, { title: string; intro: string; icon: typeof ShieldCheck }> = {
  admin: {
    title: "Admin workspace",
    intro: "Configure the school and oversee every operational area.",
    icon: ShieldCheck,
  },
  principal: {
    title: "Principal oversight",
    intro: "See the school clearly without entering billing, CCTV, or system settings.",
    icon: GraduationCap,
  },
  teacher: {
    title: "Teacher workspace",
    intro: "Run your classroom register, academic work, timetable, and messages.",
    icon: BookOpen,
  },
  bursar: {
    title: "Bursar workspace",
    intro: "Keep fees, balances, receipts, and payment follow-up accurate.",
    icon: Wallet,
  },
  security: {
    title: "Security workspace",
    intro: "Protect the gate with visitor, activity, and authorized camera visibility.",
    icon: Camera,
  },
  parent: { title: "Parent portal", intro: "Stay close to your child’s school life.", icon: Users },
  student: {
    title: "Student portal",
    intro: "Keep your learning, schedule, and school account in one place.",
    icon: GraduationCap,
  },
  librarian: {
    title: "Librarian portal",
    intro: "Library workflows are ready for a future module connection.",
    icon: BookOpen,
  },
  nurse: {
    title: "Nurse portal",
    intro:
      "Health workflows are intentionally kept separate until the secure health module is enabled.",
    icon: Stethoscope,
  },
  driver: {
    title: "Driver portal",
    intro: "Your assigned route will appear when a GPS provider is connected.",
    icon: Bus,
  },
  staff: {
    title: "Staff workspace",
    intro: "School updates and account information for your role.",
    icon: Users,
  },
};

const portalNavigation: Record<AppRole, { label: string; href: string }[]> = {
  admin: [
    { label: "Dashboard", href: "/" },
    { label: "Students", href: "/students" },
    { label: "Attendance", href: "/attendance" },
    { label: "Staff", href: "/staff" },
    { label: "Reports", href: "/reports" },
    { label: "Visitors", href: "/visitors" },
    { label: "CCTV", href: "/cctv" },
    { label: "Payments", href: "/pay" },
    { label: "Invite staff", href: "/admin/users" },
    { label: "Bus routes", href: "/bus-tracking" },
    { label: "Notifications", href: "/notifications" },
  ],
  principal: [
    { label: "Overview", href: "/portal/principal" },
    { label: "Students", href: "/students" },
    { label: "Staff", href: "/staff" },
    { label: "Reports", href: "/reports" },
    { label: "Assistant", href: "/assist" },
  ],
  teacher: [
    { label: "Overview", href: "/portal/teacher" },
    { label: "Attendance", href: "/attendance" },
    { label: "Students", href: "/students" },
    { label: "Results", href: "/teacher/results" },
    { label: "Reports", href: "/reports" },
    { label: "Assistant", href: "/assist" },
  ],
  bursar: [
    { label: "Overview", href: "/portal/bursar" },
    { label: "Alerts", href: "/notifications" },
  ],
  security: [
    { label: "Overview", href: "/portal/security" },
    { label: "Visitors", href: "/visitors" },
    { label: "CCTV", href: "/cctv" },
    { label: "Activity", href: "/portal/security#activity" },
  ],
  parent: [],
  student: [
    { label: "Overview", href: "/portal/student" },
    { label: "Attendance", href: "/portal/student#attendance" },
    { label: "Learning", href: "/portal/student#learning" },
    { label: "Fees", href: "/portal/student#fees" },
    { label: "Timetable", href: "/portal/student#timetable" },
  ],
  librarian: [{ label: "Overview", href: "/portal/librarian" }],
  nurse: [{ label: "Overview", href: "/portal/nurse" }],
  driver: [
    { label: "Overview", href: "/portal/driver" },
    { label: "Bus routes", href: "/bus-tracking" },
  ],
  staff: [{ label: "Overview", href: "/portal/staff" }],
};

const db = () => supabase as any;
export const Route = createFileRoute("/_authenticated/portal/$role")({
  beforeLoad: async ({ params }) => {
    if (!(params.role in portals)) throw notFound();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/sign-in" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const assignedRoles = (roles ?? []).map((row: { role: string }) => row.role as AppRole);
    if (!assignedRoles.includes(params.role as AppRole)) {
      if (assignedRoles[0]) throw redirect(roleHome(assignedRoles[0]));
      throw redirect({ to: "/welcome" });
    }
    if (params.role === "parent") throw redirect({ to: "/parent" });
    return {
      user: data.user,
      roles: assignedRoles,
    };
  },
  head: ({ params }) => {
    const title = portals[params.role as AppRole]?.title ?? "Portal";
    return {
      meta: [{ title: `${title} | SchoolPulseOS` }, { name: "description", content: title }],
    };
  },
  component: Portal,
});

type PortalData = {
  school: any | null;
  workspaces: { id: string; name: string }[];
  students: any[];
  attendance: any[];
  staff: any[];
  results: any[];
  assignments: any[];
  payments: any[];
  announcements: any[];
  timetable: any[];
  messages: any[];
  visitors: any[];
  activity: any[];
  cameras: any[];
  routes: any[];
  loading: boolean;
  error: string | null;
};
const emptyData: PortalData = {
  school: null,
  workspaces: [],
  students: [],
  attendance: [],
  staff: [],
  results: [],
  assignments: [],
  payments: [],
  announcements: [],
  timetable: [],
  messages: [],
  visitors: [],
  activity: [],
  cameras: [],
  routes: [],
  loading: true,
  error: null,
};

function Portal() {
  const { role } = Route.useParams();
  const activeRole = role as AppRole;
  const { user, roles } = Route.useRouteContext();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const portal = portals[activeRole];
  const [data, setData] = useState<PortalData>(emptyData);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const Icon = portal.icon;

  useEffect(() => {
    const refresh = () => {
      setData({ ...emptyData, loading: true, error: null });
      setWorkspaceRevision((current) => current + 1);
    };
    window.addEventListener(ACTIVE_WORKSPACE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ACTIVE_WORKSPACE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const membershipResult = await db()
        .from("school_memberships")
        .select("school_id,role,schools(id,name,slug,logo_path)")
        .eq("user_id", user.id)
        .order("created_at");
      if (membershipResult.error) {
        if (active) {
          setData({
            ...emptyData,
            loading: false,
            error: "Could not load your school workspace. Check your connection and try again.",
          });
        }
        return;
      }
      const memberships = membershipResult.data ?? [];
      const roleMemberships = memberships.filter(
        (membership: any) => membership.role === activeRole,
      );
      let linkedStudents: any[] = [];
      if (activeRole === "parent") {
        const result = await db()
          .from("guardian_links")
          .select("student_id")
          .eq("parent_id", user.id);
        if (result.error) throw result.error;
        const ids = (result.data ?? []).map((row: any) => row.student_id);
        if (ids.length) {
          const students = await db()
            .from("students")
            .select("id,school_id,full_name,schools(id,name,slug,logo_path)")
            .in("id", ids)
            .eq("active", true);
          if (students.error) throw students.error;
          linkedStudents = students.data ?? [];
        }
      } else if (activeRole === "student") {
        const result = await db()
          .from("student_accounts")
          .select("student_id")
          .eq("user_id", user.id);
        if (result.error) throw result.error;
        const ids = (result.data ?? []).map((row: any) => row.student_id);
        if (ids.length) {
          const students = await db()
            .from("students")
            .select("id,school_id,full_name,schools(id,name,slug,logo_path)")
            .in("id", ids)
            .eq("active", true);
          if (students.error) throw students.error;
          linkedStudents = students.data ?? [];
        }
      }
      const workspaceRows = ["parent", "student"].includes(activeRole)
        ? linkedStudents.map((student) => ({
            id: student.school_id,
            school: student.schools,
          }))
        : roleMemberships.map((membership: any) => ({
            id: membership.school_id,
            school: membership.schools,
          }));
      const workspaces = new Map<string, { id: string; name: string; school: any }>();
      for (const { id, school } of workspaceRows) {
        if (id && school) workspaces.set(id, { id, name: school.name, school });
      }
      const availableWorkspaces = Array.from(workspaces.values());
      const selectedWorkspace =
        availableWorkspaces.find((workspace) => workspace.id === getActiveWorkspaceId()) ??
        availableWorkspaces[0];
      const schoolId = selectedWorkspace?.id;
      const studentIds = linkedStudents
        .filter((student) => student.school_id === schoolId)
        .map((student) => student.id);
      if (!schoolId) {
        if (active)
          setData({
            ...emptyData,
            loading: false,
            error: "Your account is not assigned to a school workspace yet.",
          });
        return;
      }
      if (getActiveWorkspaceId() !== schoolId) rememberActiveWorkspace(schoolId);
      const selectedMembership = roleMemberships.find(
        (membership: any) => membership.school_id === schoolId,
      );
      const school = selectedMembership?.schools ?? selectedWorkspace?.school ?? null;

      const allSchool = ["admin", "principal", "teacher", "bursar"].includes(activeRole);
      const academicRole = ["admin", "teacher"].includes(activeRole);
      const oversightRole = ["admin", "principal"].includes(activeRole);
      const gateRole = ["admin", "security"].includes(activeRole);
      const paymentRole = ["admin", "bursar"].includes(activeRole);
      const query = (table: string, columns: string) => {
        const base = db().from(table).select(columns);
        return studentIds.length
          ? base.in("student_id", studentIds)
          : base.eq("school_id", schoolId);
      };
      const studentQuery = studentIds.length
        ? db()
            .from("students")
            .select("id,school_id,full_name,student_code,class_name,balance")
            .in("id", studentIds)
            .eq("school_id", schoolId)
            .eq("active", true)
        : db()
            .from("students")
            .select("id,school_id,full_name,student_code,class_name,balance")
            .eq("school_id", schoolId)
            .eq("active", true)
            .order("full_name");
      const [
        studentsResult,
        attendanceResult,
        staffResult,
        resultResult,
        assignmentResult,
        paymentResult,
        announcementResult,
        timetableResult,
        messageResult,
        visitorResult,
        activityResult,
        cameraResult,
        routeResult,
      ] = await Promise.all([
        studentQuery,
        allSchool || studentIds.length
          ? query("attendance_records", "student_id,status,recorded_on,recorded_at,gate")
              .order("recorded_at", { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] }),
        oversightRole
          ? db()
              .from("staff_directory")
              .select("id,full_name,role_title,department,access_label")
              .eq("school_id", schoolId)
              .eq("active", true)
              .order("full_name")
          : Promise.resolve({ data: [] }),
        academicRole || studentIds.length
          ? query("student_results", "id,student_id,term,subject,score,grade,published_at")
              .order("published_at", { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] }),
        academicRole || studentIds.length
          ? query("student_assignments", "id,student_id,class_name,title,description,due_at,status")
              .order("due_at", { ascending: true })
              .limit(60)
          : Promise.resolve({ data: [] }),
        paymentRole || studentIds.length
          ? query("payments", "id,student_id,amount,method,status,created_at,paystack_reference")
              .order("created_at", { ascending: false })
              .limit(60)
          : Promise.resolve({ data: [] }),
        db()
          .from("school_announcements")
          .select("id,title,body,published_at")
          .eq("school_id", schoolId)
          .order("published_at", { ascending: false })
          .limit(10),
        allSchool || studentIds.length
          ? db()
              .from("class_timetables")
              .select("class_name,day_of_week,start_time,end_time,subject,teacher")
              .eq("school_id", schoolId)
              .order("day_of_week")
              .order("start_time")
              .limit(60)
          : Promise.resolve({ data: [] }),
        db()
          .from("portal_messages")
          .select("id,subject,body,created_at,read_at")
          .eq("recipient_user_id", user.id)
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(20),
        gateRole
          ? db()
              .from("visitors")
              .select("id,full_name,purpose,host,checked_in_at,checked_out_at")
              .eq("school_id", schoolId)
              .order("checked_in_at", { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [] }),
        gateRole
          ? db()
              .from("activity_events")
              .select("id,event_type,message,tone,created_at")
              .eq("school_id", schoolId)
              .order("created_at", { ascending: false })
              .limit(40)
          : Promise.resolve({ data: [] }),
        gateRole
          ? db()
              .from("cctv_cameras")
              .select("id,name,location,status,stream_url")
              .eq("school_id", schoolId)
              .order("name")
          : Promise.resolve({ data: [] }),
        activeRole === "driver" || activeRole === "admin"
          ? db()
              .from("bus_routes")
              .select("id,name,vehicle_label,provider,status,last_seen_at,stops")
              .eq("school_id", schoolId)
              .order("name")
          : Promise.resolve({ data: [] }),
      ]);
      const queryError = [
        studentsResult,
        attendanceResult,
        staffResult,
        resultResult,
        assignmentResult,
        paymentResult,
        announcementResult,
        timetableResult,
        messageResult,
        visitorResult,
        activityResult,
        cameraResult,
        routeResult,
      ].find((result) => result.error)?.error;
      if (queryError) {
        if (active) {
          setData({
            ...emptyData,
            loading: false,
            error: "Could not load all portal information. Check your connection and try again.",
          });
        }
        return;
      }
      if (active) {
        const students = studentsResult.data ?? [];
        setData({
          school,
          workspaces: availableWorkspaces.map(({ id, name }) => ({ id, name })),
          students,
          attendance: attendanceResult.data ?? [],
          staff: staffResult.data ?? [],
          results: resultResult.data ?? [],
          assignments: assignmentResult.data ?? [],
          payments: paymentResult.data ?? [],
          announcements: announcementResult.data ?? [],
          timetable: timetableResult.data ?? [],
          messages: messageResult.data ?? [],
          visitors: visitorResult.data ?? [],
          activity: activityResult.data ?? [],
          cameras: cameraResult.data ?? [],
          routes: routeResult.data ?? [],
          loading: false,
          error: null,
        });
        setSelectedId((current) => current ?? students[0]?.id ?? null);
      }
    })().catch(
      (error) =>
        active &&
        setData({
          ...emptyData,
          loading: false,
          error: error instanceof Error ? error.message : "Could not load portal data",
        }),
    );
    return () => {
      active = false;
    };
  }, [activeRole, user.id, workspaceRevision]);

  const selected = data.students.find((student) => student.id === selectedId) ?? data.students[0];
  const childAttendance = useMemo(
    () => data.attendance.filter((item) => item.student_id === selected?.id),
    [data.attendance, selected?.id],
  );
  const childResults = data.results.filter((item) => item.student_id === selected?.id);
  const childAssignments = data.assignments.filter(
    (item) => !item.student_id || item.student_id === selected?.id,
  );
  const childPayments = data.payments.filter((item) => item.student_id === selected?.id);
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/sign-in", search: { reason: "signed-out" }, replace: true });
  };

  if (location.pathname.endsWith("/settings")) return <Outlet />;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">SchoolPulseOS · {roleLabels[activeRole]}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.workspaces.length > 1 ? (
              <select
                aria-label="Select school workspace"
                value={data.school?.id ?? ""}
                onChange={(event) => {
                  if (data.workspaces.some((workspace) => workspace.id === event.target.value)) {
                    selectActiveWorkspace(event.target.value);
                  }
                }}
                className="h-9 max-w-48 rounded-lg border border-border bg-background px-3 text-sm"
              >
                {data.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            ) : null}
            {roles.length > 1 ? (
              <select
                aria-label="Switch portal"
                value={activeRole}
                onChange={(event) =>
                  navigate({ to: "/portal/$role", params: { role: event.target.value as AppRole } })
                }
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              >
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {roleLabels[item]}
                  </option>
                ))}
              </select>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link to="/portal/$role/settings" params={{ role: activeRole }}>
                <UserRound className="size-4" /> Settings
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="size-4" /> Log out
            </Button>
          </div>
        </div>
        <nav
          aria-label={`${roleLabels[activeRole]} navigation`}
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:px-5"
        >
          {portalNavigation[activeRole].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {portal.title}
            </p>
            <h1 className="mt-2 max-w-4xl text-3xl font-bold tracking-tight">{portal.intro}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {roleDescriptions[activeRole]}
            </p>
          </div>
          {activeRole === "parent" && data.students.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {data.students.map((student) => (
                <Button
                  key={student.id}
                  size="sm"
                  variant={selected?.id === student.id ? "default" : "outline"}
                  onClick={() => setSelectedId(student.id)}
                >
                  {student.full_name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        {data.loading ? (
          <div
            className="clay-skeleton hairline-card mt-8 min-h-32 p-8 text-sm text-muted-foreground"
            role="status"
            aria-label="Loading your role-scoped workspace"
          >
            Loading your role-scoped workspace…
          </div>
        ) : data.error ? (
          <div className="hairline-card mt-8 border-warning/40 bg-warning/5 p-6 text-sm text-warning">
            {data.error}
          </div>
        ) : (
          <RoleView
            role={activeRole}
            data={data}
            selected={selected}
            childAttendance={childAttendance}
            childResults={childResults}
            childAssignments={childAssignments}
            childPayments={childPayments}
          />
        )}
      </section>
    </main>
  );
}

function RoleView({
  role,
  data,
  selected,
  childAttendance,
  childResults,
  childAssignments,
  childPayments,
}: {
  role: AppRole;
  data: PortalData;
  selected?: any;
  childAttendance: any[];
  childResults: any[];
  childAssignments: any[];
  childPayments: any[];
}) {
  if (role === "parent" || role === "student")
    return (
      <PersonalView
        role={role}
        data={data}
        selected={selected}
        attendance={childAttendance}
        results={childResults}
        assignments={childAssignments}
        payments={childPayments}
      />
    );
  if (role === "admin" || role === "principal") return <OverviewView role={role} data={data} />;
  if (role === "teacher") return <TeacherView data={data} />;
  if (role === "bursar") return <BursarView data={data} />;
  if (role === "security") return <SecurityView data={data} />;
  if (role === "driver") return <DriverView data={data} />;
  return <CapabilityView role={role} messages={data.messages} />;
}

function PersonalView({
  role,
  data,
  selected,
  attendance,
  results,
  assignments,
  payments,
}: {
  role: "parent" | "student";
  data: PortalData;
  selected?: any;
  attendance: any[];
  results: any[];
  assignments: any[];
  payments: any[];
}) {
  return (
    <>
      <PersonalSummary role={role} data={data} selected={selected} />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CheckCircle2} label="Attendance records" value={String(attendance.length)} />
        <Metric icon={FileText} label="Results" value={String(results.length)} />
        <Metric
          icon={CreditCard}
          label="Payment status"
          value={
            Number(selected?.balance ?? 0) > 0
              ? "Due"
              : payments.some((item) => item.status === "pending")
                ? "Pending"
                : "No balance due"
          }
        />
        <Metric icon={ClipboardList} label="Assignments" value={String(assignments.length)} />
      </div>
      {selected ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Selected {role === "parent" ? "child" : "student"}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{selected.full_name}</h2>
              <p className="text-sm text-muted-foreground">
                {selected.student_code} · {selected.class_name ?? "Class not assigned"}
              </p>
            </div>
            <Badge variant="outline">
              Balance ₦{Number(selected.balance ?? 0).toLocaleString()}
            </Badge>
          </div>
        </div>
      ) : null}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          id="attendance"
          icon={BookOpen}
          title="Attendance"
          rows={attendance.slice(0, 8).map((item) => ({
            label: item.recorded_on,
            detail: item.gate ?? "School register",
            value: item.status,
          }))}
          empty="No attendance records have been published yet."
        />
        <RowsPanel
          id="learning"
          icon={FileText}
          title="Results"
          rows={results.slice(0, 8).map((item) => ({
            label: item.subject,
            detail: item.term,
            value: item.grade ?? (item.score == null ? "Pending" : `${item.score}%`),
          }))}
          empty="Results will appear here when the school publishes them."
        />
        <RowsPanel
          id="assignments"
          icon={ClipboardList}
          title="Assignments"
          rows={assignments.slice(0, 8).map((item) => ({
            label: item.title,
            detail: item.due_at
              ? `Due ${new Date(item.due_at).toLocaleDateString()}`
              : "No due date",
            value: item.status,
          }))}
          empty="No assignments have been posted."
        />
        {role === "student" ? (
          <HomeworkPanel
            schoolId={data.school?.id}
            studentId={selected?.id}
            assignments={assignments}
          />
        ) : null}
        <RowsPanel
          id="timetable"
          icon={CalendarDays}
          title="Timetable"
          rows={data.timetable
            .filter((item) => item.class_name === selected?.class_name)
            .slice(0, 8)
            .map((item) => ({
              label: item.subject,
              detail: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][item.day_of_week]} · ${item.start_time}–${item.end_time}`,
              value: item.teacher ?? "",
            }))}
          empty="The timetable has not been published yet."
        />
        <TextPanel
          icon={Megaphone}
          title="Announcements"
          items={data.announcements.slice(0, 5).map((item) => `${item.title}: ${item.body}`)}
          empty="No announcements have been published."
        />
        <RowsPanel
          id="fees"
          icon={CreditCard}
          title="Fees and payments"
          rows={payments.slice(0, 8).map((item) => ({
            label: `₦${Number(item.amount).toLocaleString()}`,
            detail: `${item.method} · ${new Date(item.created_at).toLocaleDateString()}`,
            value: item.status,
          }))}
          empty="No payments have been recorded."
        />
      </div>
    </>
  );
}

function PersonalSummary({
  role,
  data,
  selected,
}: {
  role: "parent" | "student";
  data: PortalData;
  selected?: any;
}) {
  const hasBalance = Number(selected?.balance ?? 0) > 0;
  const label = role === "parent" ? "Family dashboard" : "My learning dashboard";
  return (
    <section className="mt-6 overflow-hidden rounded-md border border-primary/15 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{label}</p>
          <h2 className="mt-2 text-2xl font-bold">
            {selected
              ? `Good to see you, ${role === "parent" ? "family" : selected.full_name.split(" ")[0]}.`
              : "Your school information, in one place."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {selected
              ? `${selected.full_name} · ${selected.class_name ?? "Class not assigned"} · Student ID ${selected.student_code}`
              : role === "parent"
                ? "Once the school links your child to this account, attendance, results, fees, timetable, assignments, and messages will appear here."
                : "Your personal attendance, results, assignments, timetable, announcements, and payment status will appear here."}
          </p>
        </div>
        {selected ? (
          <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
            {hasBalance
              ? `Balance ₦${Number(selected.balance).toLocaleString()}`
              : "No balance due"}
          </Badge>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href="#attendance">View attendance</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="#learning">View results</a>
        </Button>
      </div>
      {!selected ? (
        <p className="mt-4 rounded-xl bg-background/70 p-3 text-xs text-muted-foreground">
          Need help linking your account? Contact the school office and provide the email used for
          this portal.
        </p>
      ) : null}
    </section>
  );
}
function OverviewView({ role, data }: { role: "admin" | "principal"; data: PortalData }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Active students" value={String(data.students.length)} />
        <Metric
          icon={CheckCircle2}
          label="Attendance records"
          value={String(data.attendance.length)}
        />
        <Metric icon={Users} label="Staff directory" value={String(data.staff.length)} />
        <Metric icon={Megaphone} label="Announcements" value={String(data.announcements.length)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          icon={Users}
          title="Students"
          rows={data.students.slice(0, 10).map((item) => ({
            label: item.full_name,
            detail: `${item.student_code} · ${item.class_name ?? "Unassigned"}`,
            value:
              role === "admin"
                ? `₦${Number(item.balance ?? 0).toLocaleString()}`
                : (item.class_name ?? "Enrolled"),
          }))}
          empty="No students are available."
        />
        <RowsPanel
          icon={CheckCircle2}
          title="Attendance overview"
          rows={data.attendance.slice(0, 10).map((item) => ({
            label: item.recorded_on,
            detail: item.gate ?? "Register",
            value: item.status,
          }))}
          empty="No attendance records are available."
        />
        <RowsPanel
          icon={Users}
          title="Staff oversight"
          rows={data.staff.slice(0, 10).map((item) => ({
            label: item.full_name,
            detail: item.department ?? "School team",
            value: item.role_title,
          }))}
          empty="No staff records are available."
        />
        <TextPanel
          icon={Megaphone}
          title="Announcements"
          items={data.announcements.slice(0, 5).map((item) => `${item.title}: ${item.body}`)}
          empty="No announcements have been published."
        />
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        {role === "principal"
          ? "Principal access is read-only oversight. Billing, CCTV, security settings, and system administration remain restricted."
          : "Admin access includes full school setup, role management, announcements, storage assets, and operational oversight."}
      </p>
    </>
  );
}
function TeacherView({ data }: { data: PortalData }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CheckCircle2}
          label="Register records"
          value={String(data.attendance.length)}
        />
        <Metric icon={FileText} label="Results" value={String(data.results.length)} />
        <Metric icon={ClipboardList} label="Assignments" value={String(data.assignments.length)} />
        <Metric icon={MessageSquare} label="Messages" value={String(data.messages.length)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          icon={CheckCircle2}
          title="Attendance marking"
          rows={data.attendance.slice(0, 10).map((item) => ({
            label: item.recorded_on,
            detail: item.gate ?? "Class register",
            value: item.status,
          }))}
          empty="No attendance records yet."
        />
        <RowsPanel
          icon={FileText}
          title="Results entry"
          rows={data.results.slice(0, 10).map((item) => ({
            label: item.subject,
            detail: item.term,
            value: item.grade ?? "Draft",
          }))}
          empty="No results have been entered."
        />
        <RowsPanel
          icon={ClipboardList}
          title="Assignments"
          rows={data.assignments.slice(0, 10).map((item) => ({
            label: item.title,
            detail: item.class_name ?? "Class assignment",
            value: item.status,
          }))}
          empty="No assignments have been posted."
        />
        <RowsPanel
          icon={CalendarDays}
          title="Timetable"
          rows={data.timetable.slice(0, 10).map((item) => ({
            label: item.subject,
            detail: `${item.start_time}–${item.end_time}`,
            value: item.teacher ?? "Owner",
          }))}
          empty="No timetable has been published."
        />
      </div>
      <QuickLinks
        links={[
          ["/attendance", "Open attendance"],
          ["/teacher/results", "Enter results"],
        ]}
      />
    </>
  );
}
function BursarView({ data }: { data: PortalData }) {
  const total = data.payments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Wallet} label="Transactions" value={String(data.payments.length)} />
        <Metric icon={CreditCard} label="Recorded value" value={`₦${total.toLocaleString()}`} />
        <Metric
          icon={CheckCircle2}
          label="Paid"
          value={String(data.payments.filter((item) => item.status === "paid").length)}
        />
        <Metric
          icon={Activity}
          label="Outstanding students"
          value={String(data.students.filter((item) => Number(item.balance) > 0).length)}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          icon={CreditCard}
          title="Payment history"
          rows={data.payments.slice(0, 12).map((item) => ({
            label: `₦${Number(item.amount).toLocaleString()}`,
            detail: `${item.method} · ${new Date(item.created_at).toLocaleDateString()}`,
            value: item.status,
          }))}
          empty="No payment history is available."
        />
        <RowsPanel
          icon={Wallet}
          title="Outstanding balances"
          rows={data.students
            .filter((item) => Number(item.balance) > 0)
            .slice(0, 12)
            .map((item) => ({
              label: item.full_name,
              detail: item.student_code,
              value: `₦${Number(item.balance).toLocaleString()}`,
            }))}
          empty="No outstanding balances are recorded."
        />
      </div>
      <QuickLinks links={[["/notifications", "Review receipts and alerts"]]} />
    </>
  );
}
function SecurityView({ data }: { data: PortalData }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ShieldCheck} label="Visitors today" value={String(data.visitors.length)} />
        <Metric icon={Activity} label="Activity events" value={String(data.activity.length)} />
        <Metric icon={Camera} label="Cameras" value={String(data.cameras.length)} />
        <Metric
          icon={CheckCircle2}
          label="On campus"
          value={String(data.visitors.filter((item) => !item.checked_out_at).length)}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          icon={UserRound}
          title="Visitor desk"
          rows={data.visitors.slice(0, 10).map((item) => ({
            label: item.full_name,
            detail: `${item.purpose} · ${item.host}`,
            value: item.checked_out_at ? "Checked out" : "On campus",
          }))}
          empty="No visitor records are available."
        />
        <RowsPanel
          id="activity"
          icon={Activity}
          title="Activity log"
          rows={data.activity.slice(0, 10).map((item) => ({
            label: item.event_type,
            detail: item.message,
            value: new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          }))}
          empty="No activity events are available."
        />
        <RowsPanel
          icon={Camera}
          title="CCTV access"
          rows={data.cameras.map((item) => ({
            label: item.name,
            detail: item.location,
            value: item.status,
          }))}
          empty="No camera integration has been configured."
        />
      </div>
      <QuickLinks
        links={[
          ["/visitors", "Open visitor desk"],
          ["/cctv", "Open CCTV"],
          ["/portal/security#activity", "Review activity"],
        ]}
      />
    </>
  );
}
function DriverView({ data }: { data: PortalData }) {
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Metric icon={Bus} label="Assigned routes" value={String(data.routes.length)} />
        <Metric
          icon={Wrench}
          label="GPS connection"
          value={data.routes.some((item) => item.status === "active") ? "Active" : "Not connected"}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <RowsPanel
          icon={Bus}
          title="Assigned route visibility"
          rows={data.routes.map((item) => ({
            label: item.name,
            detail: `${item.vehicle_label ?? "Vehicle pending"} · ${item.provider ?? "No GPS provider"}`,
            value: item.status,
          }))}
          empty="No assigned route is available yet."
        />
        <InfoPanel
          icon={Bus}
          title="Live tracking is not connected"
          text="The Driver portal is ready for an assigned-route integration. A GPS or route provider must be connected before location, stops, or ETA data is displayed."
        />
      </div>
    </>
  );
}
function CapabilityView({
  role,
  messages,
}: {
  role: "librarian" | "nurse" | "staff";
  messages: any[];
}) {
  const isNurse = role === "nurse";
  const isStaff = role === "staff";
  return (
    <>
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
        <InfoPanel
          icon={isNurse ? Stethoscope : BookOpen}
          title={
            isNurse
              ? "Health records are not enabled"
              : isStaff
                ? "Staff tools are not enabled"
                : "Library module is not enabled"
          }
          text={
            isNurse
              ? "A secure health_records module with separate strict RLS is required before clinical or wellbeing data can appear here. No sensitive health data is exposed in this portal."
              : isStaff
                ? "This legacy staff role has limited access. Ask a school administrator to assign a specific role for attendance, finance, visitor, or academic tools."
                : "A library_items and loans module is required before catalog, loans, or returns can appear here. This role currently retains messaging access only."
          }
        />
        <TextPanel
          icon={MessageSquare}
          title="Messages"
          items={messages.slice(0, 8).map((item) => `${item.subject}: ${item.body}`)}
          empty="No messages yet."
        />
      </div>
    </>
  );
}
function QuickLinks({ links }: { links: [string, string][] }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <Button key={href} asChild variant="outline">
          <a href={href}>{label}</a>
        </Button>
      ))}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="hairline-card p-4">
      <Icon className="size-5 text-primary" />
      <p className="mt-3 text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
function RowsPanel({
  id,
  icon: Icon,
  title,
  rows,
  empty,
}: {
  id?: string;
  icon: typeof BookOpen;
  title: string;
  rows: { label: string; detail: string; value: string }[];
  empty: string;
}) {
  return (
    <section id={id} className="hairline-card scroll-mt-24 p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      <div className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <div
            key={`${row.label}-${index}`}
            className="flex items-center gap-3 rounded-lg bg-muted/50 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.label}</p>
              <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <Badge variant="outline">{row.value}</Badge>
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      </div>
    </section>
  );
}
function TextPanel({
  icon: Icon,
  title,
  items,
  empty,
}: {
  icon: typeof BookOpen;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section className="hairline-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <p key={`${item}-${index}`} className="text-sm leading-6 text-muted-foreground">
            {item}
          </p>
        ))}
        {!items.length ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      </div>
    </section>
  );
}
function InfoPanel({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof BookOpen;
  title: string;
  text: string;
}) {
  return (
    <section className="hairline-card p-6">
      <Icon className="size-6 text-primary" />
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{text}</p>
    </section>
  );
}

function HomeworkPanel({
  schoolId,
  studentId,
  assignments,
}: {
  schoolId?: string;
  studentId?: string;
  assignments: any[];
}) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!schoolId || !studentId || !assignmentId || !body.trim()) {
      setNotice("Choose an assignment and add your work before submitting.");
      return;
    }
    setBusy(true);
    setNotice("");
    const { data: user } = await supabase.auth.getUser();
    const { error } = await db().from("homework_submissions").upsert(
      {
        school_id: schoolId,
        assignment_id: assignmentId,
        student_id: studentId,
        submitted_by: user.user?.id,
        body: body.trim(),
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "assignment_id,student_id" },
    );
    setBusy(false);
    setNotice(error ? error.message : "Homework submitted successfully.");
    if (!error) setBody("");
  };
  return (
    <section className="hairline-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <ClipboardList className="size-4 text-primary" /> Submit homework
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Your submission is visible to the assigned teacher after you send it.
      </p>
      <div className="mt-4 grid gap-3">
        <select
          aria-label="Assignment to submit"
          value={assignmentId}
          onChange={(event) => setAssignmentId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.title}
            </option>
          ))}
        </select>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Paste your answer or submission notes"
          rows={4}
        />
        <Button className="w-fit" disabled={busy} onClick={() => void submit()}>
          {busy ? "Submitting…" : "Submit work"}
        </Button>
        {notice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
