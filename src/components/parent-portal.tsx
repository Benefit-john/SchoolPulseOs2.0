import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Camera,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Home,
  LogOut,
  Megaphone,
  Moon,
  Receipt,
  Settings,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { useBackgroundMusic } from "@/components/background-music";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CameraFeed } from "@/components/camera-feed";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  getParentPaystackPaymentMethods,
  getParentPaystackPaymentStatus,
  initializePaystackTransaction,
} from "@/lib/paystack.functions";
import { downloadPaymentReceipt } from "@/lib/payment-receipt";
import { formatNaira } from "@/lib/format";
import { feeInvoiceErrorMessage } from "@/lib/fee-invoice-errors";
import { useTheme } from "@/components/theme-provider";
import type { SchoolWorkspace } from "@/lib/school-store";
import {
  ACTIVE_WORKSPACE_CHANGED,
  getActiveWorkspaceId,
  rememberActiveWorkspace,
  selectActiveWorkspace,
} from "@/lib/workspace-selection";

type ParentRow = {
  [key: string]: unknown;
  id?: string;
  school_id?: string;
  full_name?: string | null;
  student_code?: string;
  class_name?: string | null;
  balance?: number | string | null;
  schools?: { name?: string | null; timezone?: string | null } | null;
  student_id?: string;
  status?: string | null;
  recorded_on?: string;
  recorded_at?: string;
  gate?: string | null;
  term?: string;
  subject?: string;
  score?: number | null;
  grade?: string | null;
  published_at?: string | null;
  title?: string;
  due_at?: string | null;
  amount?: number | string | null;
  method?: string | null;
  paystack_reference?: string | null;
  invoice_id?: string;
  installment_id?: string;
  created_at?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  teacher?: string | null;
  body?: string | null;
  subject_line?: string;
  read_at?: string | null;
  allowed_installment_counts?: number[];
  chosen_installment_count?: number | null;
  paid_amount?: number | string | null;
  sequence?: number;
  student_name_snapshot?: string | null;
  fee_invoice_items?: ParentRow[];
  fee_installments?: ParentRow[];
  paid_at?: string | null;
  name?: string | null;
  location?: string | null;
  stream_url?: string | null;
  cctv_cameras?: ParentRow;
  enabled?: boolean;
};

export type ParentSection = "attendance" | "learning" | "fees" | "timetable" | "news" | "cctv";

const paymentMethodHelp: Record<string, string> = {
  Card: "Enter card details securely on Paystack",
  "Bank transfer": "Receive Paystack transfer instructions",
  "Connect to bank": "Redirect to your bank securely",
  USSD: "Use your bank’s USSD code",
  "Mobile money": "Pay from a supported mobile wallet",
  "QR code": "Scan a Paystack payment QR code",
};

const db = () =>
  supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

type ParentData = {
  schoolId: string;
  schoolName: string;
  workspaces: SchoolWorkspace[];
  students: ParentRow[];
  attendance: ParentRow[];
  results: ParentRow[];
  assignments: ParentRow[];
  invoices: ParentRow[];
  invoiceError: string | null;
  payments: ParentRow[];
  announcements: ParentRow[];
  timetable: ParentRow[];
  messages: ParentRow[];
  authorizedCameras: ParentRow[];
  loading: boolean;
  error: string | null;
};

const emptyData: ParentData = {
  schoolId: "",
  schoolName: "School workspace",
  workspaces: [],
  students: [],
  attendance: [],
  results: [],
  assignments: [],
  invoices: [],
  invoiceError: null,
  payments: [],
  announcements: [],
  timetable: [],
  messages: [],
  authorizedCameras: [],
  loading: true,
  error: null,
};

export function ParentPortalLayout({ user, children }: { user: User; children: ReactNode }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    await navigate({ to: "/sign-in", search: { reason: "signed-out" }, replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:sticky md:top-0 md:flex md:h-screen">
        <Link to="/parent" className="flex h-[76px] items-center gap-3 border-b border-border px-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Users className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">SchoolPulse</span>
            <span className="mt-1 block text-xs text-muted-foreground">Parent portal</span>
          </span>
        </Link>
        <nav aria-label="Parent navigation" className="flex-1 space-y-1 px-3 py-5">
          <ParentNavLink to="/parent" icon={Home}>
            Family overview
          </ParentNavLink>
          <ParentNavLink section="attendance" icon={CheckCircle2}>
            Attendance
          </ParentNavLink>
          <ParentNavLink section="learning" icon={BookOpen}>
            Learning
          </ParentNavLink>
          <ParentNavLink section="fees" icon={CreditCard}>
            Fees
          </ParentNavLink>
          <ParentNavLink section="timetable" icon={CalendarDays}>
            Timetable
          </ParentNavLink>
          <ParentNavLink section="news" icon={Megaphone}>
            School news
          </ParentNavLink>
          <ParentNavLink section="cctv" icon={Camera}>
            CCTV access
          </ParentNavLink>
          <ParentNavLink to="/parent/settings" icon={Settings}>
            My settings
          </ParentNavLink>
        </nav>
        <div className="border-t border-border p-4">
          <p className="truncate text-xs text-muted-foreground" title={user.email ?? undefined}>
            {user.email}
          </p>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start gap-2 px-2"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex min-h-[64px] items-center justify-between gap-3 px-4 sm:px-7">
            <Link to="/parent" className="flex items-center gap-2 text-sm font-semibold md:hidden">
              <Users className="size-5 text-primary" />
              Parent portal
            </Link>
            <span className="hidden truncate text-sm font-medium text-muted-foreground md:block">
              {user.email}
            </span>
            <div className="flex items-center gap-2">
              <Link
                to="/parent/settings"
                aria-label="Settings"
                className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings className="size-4" />
              </Link>
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </div>
          <nav
            aria-label="Parent navigation"
            className="flex gap-1 overflow-x-auto border-t border-border px-3 py-2 md:hidden"
          >
            <Link
              to="/parent"
              className="shrink-0 rounded-md px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Overview
            </Link>
            <ParentMobileLink section="attendance">Attendance</ParentMobileLink>
            <ParentMobileLink section="learning">Learning</ParentMobileLink>
            <ParentMobileLink section="fees">Fees</ParentMobileLink>
            <ParentMobileLink section="timetable">Timetable</ParentMobileLink>
            <ParentMobileLink section="news">News</ParentMobileLink>
            <ParentMobileLink section="cctv">CCTV</ParentMobileLink>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-7 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function ParentNavLink({
  to,
  section,
  icon: Icon,
  children,
}: {
  to?: "/parent" | "/parent/settings";
  section?: ParentSection;
  icon: typeof Home;
  children: ReactNode;
}) {
  const className =
    "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  if (section) {
    return (
      <Link to="/parent/$section" params={{ section }} className={className}>
        <Icon className="size-4" />
        {children}
      </Link>
    );
  }
  return (
    <Link to={to ?? "/parent"} className={className}>
      <Icon className="size-4" />
      {children}
    </Link>
  );
}

function ParentMobileLink({ section, children }: { section: ParentSection; children: ReactNode }) {
  return (
    <Link
      to="/parent/$section"
      params={{ section }}
      className="shrink-0 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
    >
      {children}
    </Link>
  );
}

export function ParentPortalDashboard({
  user,
  view = "overview",
}: {
  user: User;
  view?: ParentSection | "overview";
}) {
  const [data, setData] = useState<ParentData>(emptyData);
  const [selectedId, setSelectedId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    "Card" | "Bank transfer" | "Connect to bank" | "USSD" | "Mobile money" | "QR code"
  >("Card");
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("");
  const [paymentInstallmentCount, setPaymentInstallmentCount] = useState(1);
  const [paymentInstallmentSequence, setPaymentInstallmentSequence] = useState(1);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [checkoutReference, setCheckoutReference] = useState("");
  const [returnReference, setReturnReference] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState("");
  const initializePayment = useServerFn(initializePaystackTransaction);
  const getPaymentMethods = useServerFn(getParentPaystackPaymentMethods);
  const getPaymentStatus = useServerFn(getParentPaystackPaymentStatus);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>([
    "Card",
    "Bank transfer",
    "Connect to bank",
    "USSD",
    "Mobile money",
    "QR code",
  ]);
  const [paymentLinksEnabled, setPaymentLinksEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setData({ ...emptyData, loading: true });
      const links = await db().from("guardian_links").select("student_id").eq("parent_id", user.id);
      if (links.error) throw links.error;
      const studentIds = (links.data ?? []).map((row: { student_id: string }) => row.student_id);
      if (!studentIds.length) {
        if (active) setData({ ...emptyData, loading: false, error: null });
        return;
      }

      const studentsResult = await db()
        .from("students")
        .select("id,school_id,full_name,student_code,class_name,balance,schools(name,timezone)")
        .in("id", studentIds)
        .eq("active", true)
        .order("full_name");
      if (studentsResult.error) throw studentsResult.error;
      const allStudents = (studentsResult.data ?? []) as ParentRow[];
      const workspaces = Array.from(
        new Map(
          allStudents
            .filter((student) => student.school_id && student.schools?.name)
            .map((student) => [
              student.school_id as string,
              {
                id: student.school_id as string,
                name: student.schools?.name as string,
                timezone: (student.schools?.timezone as string | undefined) || "Africa/Lagos",
              },
            ]),
        ).values(),
      );
      const schoolId =
        workspaces.find((workspace) => workspace.id === getActiveWorkspaceId())?.id ??
        workspaces[0]?.id;
      if (!schoolId) {
        if (active) {
          setData({
            ...emptyData,
            students: allStudents,
            loading: false,
            error: "No school workspace is linked to your children.",
          });
        }
        return;
      }
      if (getActiveWorkspaceId() !== schoolId) rememberActiveWorkspace(schoolId);
      const students = allStudents.filter((student) => student.school_id === schoolId);
      const schoolStudentIds = students.map((student) => student.id).filter(Boolean) as string[];

      const [
        attendance,
        results,
        assignments,
        invoices,
        payments,
        announcements,
        timetable,
        messages,
        cameras,
      ] = await Promise.all([
        db()
          .from("attendance_records")
          .select("id,student_id,status,recorded_on,recorded_at,gate")
          .in("student_id", schoolStudentIds)
          .order("recorded_at", { ascending: false })
          .limit(40),
        db()
          .from("student_results")
          .select("id,student_id,term,subject,score,grade,published_at")
          .in("student_id", schoolStudentIds)
          .order("published_at", { ascending: false })
          .limit(40),
        db()
          .from("student_assignments")
          .select("id,student_id,class_name,title,description,due_at,status")
          .in("student_id", schoolStudentIds)
          .order("due_at", { ascending: true })
          .limit(40),
        db()
          .from("fee_invoices")
          .select(
            "id,school_id,student_id,student_name_snapshot,title,term,amount,currency,due_at,status,allowed_installment_counts,chosen_installment_count,fee_invoice_items(id,description,amount),fee_installments(id,sequence,amount,paid_amount,due_at,status)",
          )
          .in("student_id", schoolStudentIds)
          .order("due_at", { ascending: true }),
        db()
          .from("payments")
          .select(
            "id,student_id,invoice_id,installment_id,amount,method,status,created_at,paid_at,paystack_reference",
          )
          .in("student_id", schoolStudentIds)
          .order("created_at", { ascending: false })
          .limit(40),
        db()
          .from("school_announcements")
          .select("id,title,body,published_at")
          .eq("school_id", schoolId)
          .order("published_at", { ascending: false })
          .limit(8),
        db()
          .from("class_timetables")
          .select("class_name,day_of_week,start_time,end_time,subject,teacher")
          .eq("school_id", schoolId)
          .order("day_of_week")
          .order("start_time")
          .limit(40),
        db()
          .from("portal_messages")
          .select("id,subject,body,created_at,read_at")
          .eq("recipient_user_id", user.id)
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(10),
        db()
          .from("guardian_camera_access")
          .select("id,camera_id,student_id,cctv_cameras(id,name,location,status,stream_url)")
          .eq("enabled", true)
          .in("student_id", schoolStudentIds),
      ]);

      if (active) {
        setData({
          schoolId,
          schoolName: students[0]?.schools?.name ?? "School workspace",
          workspaces,
          students,
          attendance: (attendance.data ?? []) as ParentRow[],
          results: (results.data ?? []) as ParentRow[],
          assignments: (assignments.data ?? []) as ParentRow[],
          invoices: (invoices.data ?? []) as ParentRow[],
          invoiceError: invoices.error
            ? feeInvoiceErrorMessage(
                invoices.error,
                "Unable to load fee invoices right now. Please try again later.",
              )
            : null,
          payments: (payments.data ?? []) as ParentRow[],
          announcements: (announcements.data ?? []) as ParentRow[],
          timetable: (timetable.data ?? []) as ParentRow[],
          messages: (messages.data ?? []) as ParentRow[],
          authorizedCameras: (cameras.data ?? []) as ParentRow[],
          loading: false,
          error: null,
        });
        setSelectedId((current) =>
          students.some((student) => student.id === current) ? current : (students[0]?.id ?? ""),
        );
      }
    };

    void load().catch((error: unknown) => {
      if (active)
        setData({
          ...emptyData,
          loading: false,
          error: error instanceof Error ? error.message : "Could not load your family information.",
        });
    });
    return () => {
      active = false;
    };
  }, [user.id, refreshKey]);

  useEffect(() => {
    const refresh = () => {
      setData({ ...emptyData, loading: true, error: null });
      setRefreshKey((current) => current + 1);
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
    void getPaymentMethods({ data: undefined })
      .then((result) => {
        if (!active || !result.ok) return;
        setAvailablePaymentMethods(result.methods);
        setPaymentLinksEnabled(result.paymentLinksEnabled);
        if (!result.methods.includes(paymentMethod)) {
          setPaymentMethod(result.methods[0] ?? "Card");
        }
      })
      .catch(() => {
        if (active) setPaymentLinksEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [getPaymentMethods, paymentMethod]);

  const selected = data.students.find((student) => student.id === selectedId) ?? data.students[0];
  const changeWorkspace = (id: string) => {
    if (!data.workspaces.some((workspace) => workspace.id === id)) {
      throw new Error("You do not have access to that school workspace.");
    }
    selectActiveWorkspace(id);
  };
  const attendance = data.attendance.filter((item) => item.student_id === selected?.id);
  const results = data.results.filter((item) => item.student_id === selected?.id);
  const assignments = data.assignments.filter(
    (item) => !item.student_id || item.student_id === selected?.id,
  );
  const invoices = data.invoices;
  const authorizedCameras = data.authorizedCameras.filter(
    (access) => access.student_id === selected?.id,
  );
  const payments = data.payments.filter((item) => item.student_id === selected?.id);
  const familyOutstanding = data.students.reduce(
    (total, student) => total + Number(student.balance ?? 0),
    0,
  );
  const activeInvoice = invoices.find((item) => item.id === paymentInvoiceId);
  const activeInstallments = Array.isArray(activeInvoice?.fee_installments)
    ? activeInvoice.fee_installments
    : [];
  const activeInstallment = activeInstallments.find(
    (item) => Number(item.sequence) === paymentInstallmentSequence,
  );
  const activeInvoiceAmount = Number(activeInvoice?.amount ?? 0);
  const activeBaseAmount = Math.round((activeInvoiceAmount / paymentInstallmentCount) * 100) / 100;
  const paymentAmountDue = activeInstallment
    ? Number(activeInstallment.amount ?? 0) -
      Number(activeInstallment.paid_amount ?? 0) -
      data.payments
        .filter(
          (payment) =>
            payment.installment_id === activeInstallment.id && payment.status === "pending",
        )
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
    : paymentInstallmentSequence === paymentInstallmentCount
      ? activeInvoiceAmount - activeBaseAmount * (paymentInstallmentCount - 1)
      : activeBaseAmount;
  const balance = Number(selected?.balance ?? 0);
  const sectionTitle: Record<ParentSection | "overview", string> = {
    overview: "Family overview",
    attendance: "Attendance",
    learning: "Learning",
    fees: "Fees and payments",
    timetable: "Timetable",
    news: "School news",
    cctv: "Approved camera feeds",
  };

  const logParentCameraView = async (cameraId: string) => {
    if (!cameraId || !data.schoolId) return;
    const { data: current } = await supabase.auth.getUser();
    if (!current.user) return;
    await db().from("camera_view_events").insert({
      school_id: data.schoolId,
      camera_id: cameraId,
      viewer_id: current.user.id,
    });
  };

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get("reference");
    if (!reference) return;
    setReturnReference(reference);
    setPaymentNotice("Payment received by Paystack. Waiting for secure confirmation…");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!returnReference) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const checkStatus = async () => {
      try {
        const result = await getPaymentStatus({ data: { reference: returnReference } });
        if (!active) return;
        setPaymentNotice(result.message);
        if (result.ok && result.status === "paid") {
          setRefreshKey((value) => value + 1);
          setReturnReference("");
          return;
        }
        if (result.ok && result.status === "failed") {
          setRefreshKey((value) => value + 1);
          setReturnReference("");
          return;
        }
      } catch {
        if (!active) return;
        setPaymentNotice(
          "Payment is processing. We’ll update this page after gateway confirmation.",
        );
      }
      attempts += 1;
      if (attempts < 12) timeout = setTimeout(() => void checkStatus(), 5000);
    };
    void checkStatus();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [returnReference, getPaymentStatus]);

  const selectInvoicePlan = (invoice: ParentRow, installmentCount: number) => {
    const existingInstallments = Array.isArray(invoice.fee_installments)
      ? invoice.fee_installments
      : [];
    const existingPlan = Number(invoice.chosen_installment_count ?? 0);
    const nextInstallment =
      existingPlan === installmentCount
        ? existingInstallments.find((item) => item.status !== "paid")
        : undefined;
    const installmentSequence = Number(nextInstallment?.sequence ?? 1);
    setPaymentInvoiceId(String(invoice.id ?? ""));
    setPaymentInstallmentCount(installmentCount);
    setPaymentInstallmentSequence(installmentSequence);
    setCheckoutUrl("");
    setCheckoutReference("");
    setPaymentNotice("");
  };

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeInvoice || !paymentInvoiceId || paymentAmountDue < 100) {
      setPaymentNotice(
        "The selected installment has no payable amount. Refresh the invoice schedule.",
      );
      return;
    }
    setPaymentBusy(true);
    setPaymentNotice("");
    try {
      const result = await initializePayment({
        data: {
          invoiceId: paymentInvoiceId,
          studentId: String(activeInvoice.student_id),
          installmentCount: paymentInstallmentCount,
          installmentSequence: paymentInstallmentSequence,
          method: paymentMethod,
        },
      });
      if (!result.ok) {
        setPaymentNotice(result.message);
        return;
      }
      setCheckoutUrl(result.authorizationUrl);
      setCheckoutReference(result.reference);
      setPaymentNotice(`Secure checkout created for ${formatNaira(result.amount)}.`);
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : "Could not create a payment link.");
    } finally {
      setPaymentBusy(false);
    }
  };

  if (data.loading)
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Loading your family dashboard…
      </div>
    );
  if (data.error)
    return (
      <section className="hairline-card border-danger/30 p-6">
        <h1 className="text-xl font-semibold">Family information is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{data.error}</p>
      </section>
    );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {data.schoolName}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{sectionTitle[view]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A clear view of your child’s school day.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.workspaces.length > 1 ? (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              School
              <select
                aria-label="Select school workspace"
                value={data.schoolId}
                onChange={(event) => changeWorkspace(event.target.value)}
                className="h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {data.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {data.students.length > 1 ? (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Child
              <select
                aria-label="Choose a child"
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {data.students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {!selected ? (
        <section className="mt-7 border-y border-border py-10">
          <Users className="size-7 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">No child is linked to this account yet</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Contact your school office and share the email address used for this account so they can
            link your child.
          </p>
        </section>
      ) : (
        <>
          {view === "overview" ? (
            <>
              <section className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(230px,.6fr)]">
                <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Selected child
                  </p>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold">{selected.full_name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.class_name ?? "Class not assigned"} · ID {selected.student_code}
                      </p>
                    </div>
                    <span className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">
                      Balance ₦{balance.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-primary p-5 text-primary-foreground">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
                    Payment status
                  </p>
                  <p className="mt-3 text-2xl font-bold">
                    {balance > 0 ? "Balance due" : "Up to date"}
                  </p>
                  <p className="mt-1 text-sm opacity-80">
                    {balance > 0
                      ? `₦${balance.toLocaleString()} outstanding`
                      : "No outstanding balance recorded"}
                  </p>
                  <Link
                    to="/parent/$section"
                    params={{ section: "fees" }}
                    className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-background px-4 text-sm font-semibold text-foreground hover:bg-background/90"
                  >
                    <CreditCard className="size-4" />
                    Make payment
                  </Link>
                </div>
              </section>

              <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={CheckCircle2}
                  label="Attendance records"
                  value={String(attendance.length)}
                />
                <Metric icon={FileText} label="Published results" value={String(results.length)} />
                <Metric icon={BookOpen} label="Assignments" value={String(assignments.length)} />
                <Metric icon={CreditCard} label="Payments" value={String(payments.length)} />
              </section>
              <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(
                  [
                    ["attendance", "Attendance"],
                    ["learning", "Learning"],
                    ["fees", "Fees and payments"],
                    ["timetable", "Timetable"],
                    ["news", "School news"],
                    ["cctv", "Approved camera feeds"],
                  ] as const
                ).map(([section, label]) => (
                  <Link
                    key={section}
                    to="/parent/$section"
                    params={{ section }}
                    className="flex min-h-12 items-center justify-between border-b border-border px-1 text-sm font-medium hover:text-primary"
                  >
                    {label}
                    <span aria-hidden="true">›</span>
                  </Link>
                ))}
              </section>
              <section className="mt-7 border-t border-border pt-5">
                <div className="flex items-center gap-2">
                  <Camera className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Approved camera feeds</h2>
                </div>
                {authorizedCameras.length ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {authorizedCameras.slice(0, 4).map((access) => {
                      const camera = access.cctv_cameras as ParentRow | undefined;
                      if (!camera) return null;
                      return (
                        <CameraFeed
                          key={String(access.id)}
                          name={String(camera.name ?? "School camera")}
                          location={`${String(selected?.full_name ?? "Child")} · ${String(camera.location ?? "School")}`}
                          status={String(camera.status ?? "offline")}
                          streamUrl={
                            typeof camera.stream_url === "string" ? camera.stream_url : null
                          }
                          onView={() => void logParentCameraView(String(access["camera_id"] ?? ""))}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No camera feed has been approved for {selected?.full_name ?? "this child"}.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">Child: </span>
              <span className="font-medium">{selected.full_name}</span>
              <span className="text-muted-foreground">
                {" "}
                · {selected.class_name ?? "Class not assigned"}
              </span>
            </div>
          )}

          <div className="mt-7 grid gap-5 xl:grid-cols-2">
            {view === "attendance" ? (
              <section id="attendance" className="hairline-card scroll-mt-24 p-5">
                <SectionHeading icon={CheckCircle2} title="Attendance" />
                <Rows
                  rows={attendance.slice(0, 8).map((item) => ({
                    title: item.recorded_on,
                    detail: item.gate ?? "School register",
                    value: item.status,
                  }))}
                  empty="Attendance records will appear here."
                />
              </section>
            ) : null}
            {view === "learning" ? (
              <section id="learning" className="hairline-card scroll-mt-24 p-5">
                <SectionHeading icon={BookOpen} title="Learning" />
                <Rows
                  rows={results.slice(0, 5).map((item) => ({
                    title: item.subject,
                    detail: item.term,
                    value: item.grade ?? (item.score == null ? "Pending" : `${item.score}%`),
                  }))}
                  empty="Published results will appear here."
                />
                <div className="mt-5 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">Assignments</h3>
                  <Rows
                    rows={assignments.slice(0, 5).map((item) => ({
                      title: item.title,
                      detail: item.due_at
                        ? `Due ${new Date(item.due_at).toLocaleDateString()}`
                        : (item.class_name ?? "Class assignment"),
                      value: item.status,
                    }))}
                    empty="No assignments have been posted."
                  />
                </div>
              </section>
            ) : null}
            {view === "fees" ? (
              <section id="fees" className="hairline-card scroll-mt-24 overflow-hidden p-5">
                <SectionHeading icon={CreditCard} title="Fees and payments" />
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {view === "fees"
                        ? "Outstanding across linked children"
                        : "Outstanding balance"}
                    </p>
                    <p className="numeric mt-1 text-2xl font-semibold">
                      {formatNaira(view === "fees" ? familyOutstanding : balance)}
                    </p>
                  </div>
                  <Badge variant="outline">{balance > 0 ? "Payment due" : "Up to date"}</Badge>
                </div>
                {paymentNotice ? (
                  <p role="status" className="mt-3 text-sm text-muted-foreground">
                    {paymentNotice}
                  </p>
                ) : null}
                {checkoutUrl ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-border pb-4">
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Continue to secure payment
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(checkoutUrl)
                          .then(() => setPaymentNotice("Payment link copied."))
                          .catch(() =>
                            setPaymentNotice("Unable to copy payment link on this device."),
                          )
                      }
                    >
                      Copy payment link
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Reference: {checkoutReference}
                    </span>
                  </div>
                ) : null}
                {paymentLinksEnabled ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Your hosted Paystack checkout URL can be copied and shared with the payer. It
                    expires according to Paystack’s transaction rules.
                  </p>
                ) : null}
                <div className="divide-y divide-border">
                  {data.invoiceError ? (
                    <p role="alert" className="py-5 text-sm text-danger">
                      {data.invoiceError}
                    </p>
                  ) : null}
                  {invoices.map((invoice) => {
                    const invoiceInstallments = Array.isArray(invoice.fee_installments)
                      ? invoice.fee_installments
                      : [];
                    const invoiceItems = Array.isArray(invoice.fee_invoice_items)
                      ? invoice.fee_invoice_items
                      : [];
                    const amount = Number(invoice.amount ?? 0);
                    const paidAmount = invoiceInstallments.reduce(
                      (sum, installment) => sum + Number(installment.paid_amount ?? 0),
                      0,
                    );
                    const due = String(invoice.due_at ?? "");
                    const isOverdue =
                      invoice.status !== "paid" &&
                      Boolean(due) &&
                      new Date(`${due.slice(0, 10)}T23:59:59`) < new Date();
                    const status = isOverdue ? "overdue" : String(invoice.status ?? "unpaid");
                    const overdueDays = isOverdue
                      ? Math.max(
                          1,
                          Math.ceil(
                            (Date.now() - new Date(`${due.slice(0, 10)}T23:59:59`).getTime()) /
                              86_400_000,
                          ),
                        )
                      : 0;
                    const allowedCounts = Array.isArray(invoice.allowed_installment_counts)
                      ? invoice.allowed_installment_counts
                      : [];
                    const planStarted = data.payments.some(
                      (payment) =>
                        payment.invoice_id === invoice.id &&
                        (payment.status === "paid" || payment.status === "pending"),
                    );
                    const chosenCount = Number(invoice.chosen_installment_count ?? 0);
                    const isActive = paymentInvoiceId === invoice.id;
                    return (
                      <article key={String(invoice.id)} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-primary">
                              {invoice.student_name_snapshot ??
                                data.students.find((student) => student.id === invoice.student_id)
                                  ?.full_name ??
                                "Linked child"}
                            </p>
                            <h3 className="font-semibold">{invoice.title ?? "School fees"}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {invoice.term ?? "Current term"} · Due{" "}
                              {due ? new Date(due).toLocaleDateString() : "Date not set"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="numeric font-semibold">{formatNaira(amount)}</p>
                            <p className="text-xs text-muted-foreground">
                              Remaining {formatNaira(Math.max(0, amount - paidAmount))}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                status === "paid"
                                  ? "mt-1 border-success/40 text-success"
                                  : status === "overdue"
                                    ? "mt-1 border-danger/40 text-danger"
                                    : "mt-1 border-warning/40 text-warning"
                              }
                            >
                              {status === "overdue"
                                ? `Overdue · ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
                                : status}
                            </Badge>
                          </div>
                        </div>
                        {invoiceItems.length ? (
                          <div className="mt-3 divide-y divide-border border-y border-border">
                            {invoiceItems.map((item) => (
                              <div
                                key={String(item.id)}
                                className="flex justify-between gap-3 py-2 text-sm"
                              >
                                <span>{String(item["description"] ?? "Fee")}</span>
                                <span className="numeric font-medium">
                                  {formatNaira(Number(item.amount ?? 0))}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between gap-3 py-2 text-sm font-semibold">
                              <span>Invoice total</span>
                              <span className="numeric">{formatNaira(amount)}</span>
                            </div>
                          </div>
                        ) : null}
                        {invoice.status !== "paid" && invoice.status !== "cancelled" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(chosenCount ? [chosenCount] : [1, ...allowedCounts]).map((count) => (
                              <Button
                                key={count}
                                variant={
                                  isActive && paymentInstallmentCount === count
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                disabled={planStarted && count !== chosenCount}
                                onClick={() => selectInvoicePlan(invoice, count)}
                              >
                                {count === 1 ? "Pay in full" : `${count} installments`}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        {invoiceInstallments.length ? (
                          <div className="mt-3 divide-y divide-border border-y border-border">
                            {invoiceInstallments.map((installment) => {
                              const installmentStatus =
                                installment.status !== "paid" &&
                                new Date(`${String(installment.due_at).slice(0, 10)}T23:59:59`) <
                                  new Date()
                                  ? "overdue"
                                  : String(installment.status ?? "unpaid");
                              const remaining =
                                Number(installment.amount ?? 0) -
                                Number(installment.paid_amount ?? 0);
                              return (
                                <div
                                  key={String(installment.id)}
                                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                                >
                                  <span>
                                    Installment {installment.sequence} ·{" "}
                                    {formatNaira(Number(installment.amount ?? 0))} · Due{" "}
                                    {new Date(String(installment.due_at)).toLocaleDateString()}
                                  </span>
                                  <span className="flex items-center gap-2">
                                    <Badge variant="outline">{installmentStatus}</Badge>
                                    {installment.status !== "paid" && chosenCount > 1 ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setPaymentInvoiceId(String(invoice.id));
                                          setPaymentInstallmentCount(chosenCount);
                                          setPaymentInstallmentSequence(
                                            Number(installment.sequence),
                                          );
                                        }}
                                      >
                                        Pay this installment
                                      </Button>
                                    ) : null}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {isActive && invoice.status !== "paid" ? (
                          <form
                            onSubmit={(event) => void startPayment(event)}
                            className="mt-4 grid gap-3 border-t border-border pt-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">Choose amount</p>
                                <p className="text-xs text-muted-foreground">
                                  Selected amount: {formatNaira(Math.max(0, paymentAmountDue))}
                                </p>
                              </div>
                              <Badge variant="outline">Secure Paystack checkout</Badge>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {availablePaymentMethods.map((method) => (
                                <button
                                  key={method}
                                  type="button"
                                  onClick={() => setPaymentMethod(method as typeof paymentMethod)}
                                  className={`rounded-lg border p-3 text-left transition ${
                                    paymentMethod === method
                                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                                      : "border-border hover:border-primary/50"
                                  }`}
                                >
                                  <span className="block text-sm font-semibold">{method}</span>
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {paymentMethodHelp[method] ?? "Continue through Paystack"}
                                  </span>
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground">
                                Card details are entered only on Paystack’s secure hosted page;
                                SchoolPulse never stores them.
                              </p>
                              <Button
                                type="submit"
                                disabled={paymentBusy || paymentAmountDue < 100}
                              >
                                {paymentBusy ? "Opening secure checkout…" : "Make payment"}
                              </Button>
                            </div>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                  {invoices.length === 0 && !data.invoiceError ? (
                    <p className="py-5 text-sm text-muted-foreground">
                      No fee invoices are due for this child.
                    </p>
                  ) : null}
                </div>
                <div className="mt-6 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">Payment history and receipts</h3>
                  <div className="divide-y divide-border">
                    {data.payments.slice(0, 40).map((item) => {
                      const status = String(item.status ?? "pending").toLowerCase();
                      const reference = String(item.paystack_reference ?? item.id ?? "");
                      const dateValue = String(item.paid_at ?? item.created_at ?? "");
                      const date = dateValue
                        ? new Date(dateValue).toLocaleString()
                        : "Date unavailable";
                      const childName =
                        data.students.find((student) => student.id === item.student_id)
                          ?.full_name ?? "Linked child";
                      return (
                        <div
                          key={String(item.id ?? item.created_at)}
                          className="flex flex-wrap items-center gap-3 py-4"
                        >
                          <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
                            <Receipt className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {childName} · {formatNaira(Number(item.amount ?? 0))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.method ?? "Payment"} · {date}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              Reference: {reference || "Not available"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                status === "paid"
                                  ? "border-success/40 text-success"
                                  : status === "failed"
                                    ? "border-danger/40 text-danger"
                                    : "border-warning/40 text-warning"
                              }
                            >
                              {status}
                            </Badge>
                            {status === "paid" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Download payment receipt"
                                onClick={() =>
                                  downloadPaymentReceipt({
                                    student: childName,
                                    amount: Number(item.amount ?? 0),
                                    method: String(item.method ?? "Payment"),
                                    status: "Paid",
                                    date,
                                    reference,
                                  })
                                }
                              >
                                <Download className="size-4" />
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {data.payments.length === 0 ? (
                      <p className="py-5 text-sm text-muted-foreground">
                        No payment history is available.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
            {view === "timetable" ? (
              <section id="timetable" className="hairline-card scroll-mt-24 p-5">
                <SectionHeading icon={CalendarDays} title="Timetable" />
                <Rows
                  rows={data.timetable
                    .filter((item) => !item.class_name || item.class_name === selected.class_name)
                    .slice(0, 8)
                    .map((item) => ({
                      title: item.subject,
                      detail: `${item.day_of_week} · ${item.start_time}–${item.end_time}`,
                      value: item.teacher ?? "Class",
                    }))}
                  empty="The school has not published a timetable yet."
                />
              </section>
            ) : null}
            {view === "news" ? (
              <section id="news" className="hairline-card scroll-mt-24 p-5">
                <SectionHeading icon={Megaphone} title="School news and announcements" />
                <Rows
                  rows={data.announcements.slice(0, 6).map((item) => ({
                    title: item.title,
                    detail: item.body,
                    value: item.published_at
                      ? new Date(item.published_at).toLocaleDateString()
                      : "School",
                  }))}
                  empty="There are no new announcements."
                />
              </section>
            ) : null}
            {view === "cctv" ? (
              <section id="cctv" className="hairline-card scroll-mt-24 p-5">
                <SectionHeading icon={Camera} title="Approved camera feeds" />
                {authorizedCameras.length ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {authorizedCameras.map((access) => {
                      const camera = access.cctv_cameras as ParentRow | undefined;
                      if (!camera) return null;
                      return (
                        <CameraFeed
                          key={String(access.id)}
                          name={String(camera.name ?? "School camera")}
                          location={`${String(selected?.full_name ?? "Child")} · ${String(camera.location ?? "School")}`}
                          status={String(camera.status ?? "offline")}
                          streamUrl={
                            typeof camera.stream_url === "string" ? camera.stream_url : null
                          }
                          onView={() => void logParentCameraView(String(access["camera_id"] ?? ""))}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No camera feed has been approved for {selected?.full_name ?? "this child"}.
                  </p>
                )}
              </section>
            ) : null}
            {view === "overview" ? (
              <section className="hairline-card p-5">
                <SectionHeading icon={UserRound} title="Messages from school" />
                <Rows
                  rows={data.messages.slice(0, 6).map((item) => ({
                    title: item.subject,
                    detail: item.body,
                    value: item.read_at ? "Read" : "New",
                  }))}
                  empty="Messages from school will appear here."
                />
              </section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function ParentSettings({ user }: { user: User }) {
  const { theme, toggleTheme } = useTheme();
  const { enabled, isPlaying, setEnabled } = useBackgroundMusic();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void db()
      .from("profiles")
      .select("full_name,phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({
          data,
          error,
        }: {
          data: { full_name: string | null; phone: string | null } | null;
          error: { message: string } | null;
        }) => {
          if (!active) return;
          if (error) setNotice(error.message);
          setFullName(data?.full_name ?? "");
          setPhone(data?.phone ?? "");
        },
      );
    return () => {
      active = false;
    };
  }, [user.id]);

  const saveProfile = async () => {
    setSaving(true);
    setNotice("");
    const { error } = await db()
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName.trim() || null, phone: phone.trim() || null });
    setSaving(false);
    setNotice(error ? error.message : "Your contact details have been saved.");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Parent portal
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">My settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your own contact details and account preferences.
        </p>
      </div>
      <section className="hairline-card mt-7 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <UserRound className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-semibold">Contact details</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These details belong to your parent account.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="parent-name">Full name</Label>
            <Input
              id="parent-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent-phone">Phone number</Label>
            <Input
              id="parent-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
            />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="parent-email">Account email</Label>
          <Input id="parent-email" value={user.email ?? ""} readOnly disabled className="mt-2" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled={saving} onClick={() => void saveProfile()}>
            {saving ? "Saving…" : "Save contact details"}
          </Button>
          {notice ? (
            <p className="text-sm text-muted-foreground" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </section>
      <section className="hairline-card mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the theme used on this device.
          </p>
        </div>
        <Button variant="outline" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>
      </section>
      <section className="hairline-card mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="font-semibold">Background music</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {enabled
              ? isPlaying
                ? "Ambient music is playing on this device."
                : "Music will start after your next tap or key press."
              : "Background music is off."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Background music"
          aria-checked={enabled}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </section>
      <section className="hairline-card mt-5 p-5">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-semibold">Account security</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review active sessions or update your password.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/security">Manage sessions</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/forgot-password">Reset password</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-6">
        <Link to="/parent" className="text-sm font-medium text-primary hover:underline">
          Back to family overview
        </Link>
      </div>
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
      <Icon className="size-4 text-primary" />
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof BookOpen; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="size-4 text-primary" />
      {title}
    </h2>
  );
}

function Rows({
  rows,
  empty,
}: {
  rows: {
    title?: string | undefined;
    detail?: string | null | undefined;
    value?: string | null | undefined;
  }[];
  empty: string;
}) {
  if (!rows.length) return <p className="mt-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="mt-4 divide-y divide-border">
      {rows.map((row, index) => (
        <div
          key={`${row.title}-${index}`}
          className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.title ?? "School update"}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {row.detail ?? ""}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {row.value ?? "Not recorded"}
          </span>
        </div>
      ))}
    </div>
  );
}
