import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import { recordAttendance } from "@/lib/operations.functions";
import { getSchoolLocalDate } from "@/lib/school-date";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_WORKSPACE_CHANGED,
  ACTIVE_WORKSPACE_KEY,
  getActiveWorkspaceId,
  rememberActiveWorkspace,
  selectActiveWorkspace,
} from "@/lib/workspace-selection";

export type RecordedAttendanceStatus = "Present" | "Absent" | "Late" | "Checked out";
export type AttendanceStatus = RecordedAttendanceStatus | "Unmarked";
export type SchoolWorkspace = {
  id: string;
  name: string;
  timezone: string;
};
export type Student = {
  id: string;
  dbId: string;
  name: string;
  cls: string;
  guardian: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  status: AttendanceStatus;
  balance: number;
};
export type StaffMember = { id: string; name: string; role: string; dept: string; access: string };
export type Visitor = {
  id: string;
  name: string;
  purpose: string;
  host: string;
  time: string;
  status: "On campus" | "Checked out";
};
export type Activity = {
  id: string;
  time: string;
  text: string;
  tone: "success" | "info" | "warning" | "danger";
};
export type NotificationChannel = "Email" | "SMS";
export type NotificationRecord = {
  id: string;
  channel: NotificationChannel;
  event: string;
  recipient: string;
  student: string;
  subject: string;
  body: string;
  createdAt: string;
  status: "Queued" | "Sending" | "Sent" | "Failed";
};
export type NotificationSettings = {
  checkInEmail: boolean;
  checkInSms: boolean;
  attendanceEmail: boolean;
  attendanceSms: boolean;
  feeDueEmail: boolean;
  feeDueSms: boolean;
};
export type Payment = {
  id: string;
  student: string;
  amount: number;
  method: string;
  date: string;
  status: "Paid" | "Pending" | "Failed" | "Refunded";
  paystackReference: string | null;
};
export type SchoolState = {
  school:
    | (SchoolWorkspace & {
        slug: string;
        logoPath: string | null;
        logoUrl: string | null;
      })
    | null;
  workspaces: SchoolWorkspace[];
  profile: {
    name: string;
    phone: string | null;
    avatarPath: string | null;
    avatarUrl: string | null;
  } | null;
  students: Student[];
  staff: StaffMember[];
  visitors: Visitor[];
  activity: Activity[];
  notifications: number;
  revenueToday: number;
  payments: Payment[];
  notificationLog: NotificationRecord[];
  notificationSettings: NotificationSettings;
  loading: boolean;
  error: string | null;
};

type StoreSnapshot = {
  state: SchoolState;
  stats: {
    present: number;
    absent: number;
    late: number;
    checkedOut: number;
    unmarked: number;
    roll: number;
  };
  loading: boolean;
  refresh: () => Promise<void>;
  changeWorkspace: (id: string) => void;
  addStudent: (input: {
    name: string;
    id: string;
    cls: string;
    guardian: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => Promise<{ registrationCode: string; expiresAt: string }>;
  updateStudent: (input: {
    studentDbId: string;
    name: string;
    id: string;
    cls: string;
    guardian: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => Promise<void>;
  setAttendance: (
    studentCode: string,
    status: RecordedAttendanceStatus,
    gate?: string,
    eventType?: string,
  ) => Promise<void>;
  scanStudent: (studentCode: string) => Promise<void>;
  registerVisitor: (input: { name: string; purpose: string; host: string }) => Promise<void>;
  checkoutVisitor: (id: string) => Promise<void>;
  addStaff: (input: {
    name: string;
    role: string;
    dept: string;
    email?: string;
    phone?: string;
  }) => Promise<void>;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
};

const emptySettings: NotificationSettings = {
  checkInEmail: true,
  checkInSms: true,
  attendanceEmail: true,
  attendanceSms: true,
  feeDueEmail: true,
  feeDueSms: true,
};
const emptyState: SchoolState = {
  school: null,
  workspaces: [],
  profile: null,
  students: [],
  staff: [],
  visitors: [],
  activity: [],
  notifications: 0,
  revenueToday: 0,
  payments: [],
  notificationLog: [],
  notificationSettings: emptySettings,
  loading: true,
  error: null,
};
const statusMap: Record<string, RecordedAttendanceStatus> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  checked_out: "Checked out",
};
const db = () => supabase as any;
const DEFAULT_SCHOOL_TIMEZONE = "Africa/Lagos";

function formatTime(value: string, timeZone: string) {
  return new Date(value).toLocaleTimeString([], {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function eventTone(tone: string): Activity["tone"] {
  return tone === "success" || tone === "warning" || tone === "danger" ? tone : "info";
}

function computeStats(students: Student[]) {
  return {
    present: students.filter((s) => s.status === "Present").length,
    absent: students.filter((s) => s.status === "Absent").length,
    late: students.filter((s) => s.status === "Late").length,
    checkedOut: students.filter((s) => s.status === "Checked out").length,
    unmarked: students.filter((s) => s.status === "Unmarked").length,
    roll: students.length,
  };
}

type CoreData = {
  userId: string;
  userEmail: string;
  workspaces: SchoolWorkspace[];
  selectedWorkspace: SchoolWorkspace;
  school: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    logo_path: string | null;
  };
  profile: {
    full_name: string | null;
    phone: string | null;
    avatar_path: string | null;
  } | null;
};

function createSchoolStore() {
  let state: SchoolState = { ...emptyState };
  let currentSnapshot: StoreSnapshot | null = null;
  const listeners = new Set<() => void>();
  let loadGeneration = 0;
  let coreData: CoreData | null = null;

  function emit() {
    listeners.forEach((fn) => fn());
  }

  function buildSnapshot(): StoreSnapshot {
    return {
      state,
      stats: computeStats(state.students),
      loading: state.loading,
      refresh: load,
      changeWorkspace,
      addStudent,
      updateStudent,
      setAttendance,
      scanStudent,
      registerVisitor,
      checkoutVisitor,
      addStaff,
      updateNotificationSettings,
    };
  }

  function setState(next: SchoolState) {
    state = next;
    currentSnapshot = buildSnapshot();
    emit();
  }

  function patchState(patch: Partial<SchoolState>) {
    state = { ...state, ...patch };
    currentSnapshot = buildSnapshot();
    emit();
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSnapshot(): StoreSnapshot {
    if (!currentSnapshot) {
      currentSnapshot = buildSnapshot();
    }
    return currentSnapshot;
  }

  function getSchoolId() {
    return state.school?.id ?? null;
  }

  async function loadCore(): Promise<CoreData | null> {
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      setState({
        ...emptyState,
        loading: false,
        error: "Please sign in to access a school workspace.",
      });
      return null;
    }

    const [membershipResult, profileResult] = await Promise.all([
      db()
        .from("school_memberships")
        .select("school_id,role,schools(id,name,slug,logo_path,timezone)")
        .eq("user_id", userResult.user.id)
        .order("created_at"),
      db()
        .from("profiles")
        .select("full_name,phone,avatar_path")
        .eq("id", userResult.user.id)
        .maybeSingle(),
    ]);

    if (membershipResult.error || !membershipResult.data?.length) {
      setState({
        ...emptyState,
        loading: false,
        error: "Your account is not assigned to a school workspace yet.",
      });
      return null;
    }

    const workspaces: SchoolWorkspace[] = membershipResult.data.flatMap((membership: any) => {
      const school = membership.schools;
      return school
        ? [
            {
              id: school.id,
              name: school.name,
              timezone: school.timezone || DEFAULT_SCHOOL_TIMEZONE,
            },
          ]
        : [];
    });
    const selectedWorkspace =
      workspaces.find((workspace) => workspace.id === getActiveWorkspaceId()) ?? workspaces[0];
    if (!selectedWorkspace) {
      setState({
        ...emptyState,
        loading: false,
        error: "Your school workspace could not be loaded. Contact your school administrator.",
      });
      return null;
    }
    if (getActiveWorkspaceId() !== selectedWorkspace.id) {
      rememberActiveWorkspace(selectedWorkspace.id);
    }
    const membership = membershipResult.data.find(
      (row: any) => row.school_id === selectedWorkspace.id,
    );
    const school = membership?.schools;
    if (!school) {
      setState({
        ...emptyState,
        loading: false,
        error: "Your selected school workspace could not be loaded.",
      });
      return null;
    }

    return {
      userId: userResult.user.id,
      userEmail: userResult.user.email ?? "Signed-in user",
      workspaces,
      selectedWorkspace,
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        timezone: selectedWorkspace.timezone,
        logo_path: school.logo_path ?? null,
      },
      profile: profileResult.data ?? null,
    };
  }

  async function loadSignedUrls(core: CoreData) {
    const [logoResult, avatarResult] = await Promise.all([
      core.school.logo_path
        ? supabase.storage.from("school-assets").createSignedUrl(core.school.logo_path, 3600)
        : Promise.resolve({ data: null, error: null }),
      core.profile?.avatar_path
        ? supabase.storage
            .from("school-assets")
            .createSignedUrl(core.profile.avatar_path, 3600)
        : Promise.resolve({ data: null, error: null }),
    ]);

    patchState({
      school: {
        id: core.school.id,
        name: core.school.name,
        slug: core.school.slug,
        timezone: core.school.timezone,
        logoPath: core.school.logo_path,
        logoUrl: logoResult.data?.signedUrl ?? null,
      },
      workspaces: core.workspaces,
      profile: core.profile
        ? {
            name: core.profile.full_name ?? core.userEmail,
            phone: core.profile.phone ?? null,
            avatarPath: core.profile.avatar_path ?? null,
            avatarUrl: avatarResult.data?.signedUrl ?? null,
          }
        : {
            name: core.userEmail,
            phone: null,
            avatarPath: null,
            avatarUrl: null,
          },
    });
  }

  async function loadStudents(core: CoreData) {
    const [studentsResult, attendanceResult] = await Promise.all([
      db()
        .from("students")
        .select(
          "id,student_code,full_name,class_name,guardian_name,guardian_email,guardian_phone,balance",
        )
        .eq("school_id", core.selectedWorkspace.id)
        .eq("active", true)
        .order("full_name"),
      db()
        .from("attendance_records")
        .select("student_id,status")
        .eq("school_id", core.selectedWorkspace.id)
        .eq("recorded_on", getSchoolLocalDate(new Date(), core.selectedWorkspace.timezone)),
    ]);

    if (studentsResult.error || attendanceResult.error) {
      console.error("Could not load students", studentsResult.error ?? attendanceResult.error);
      return;
    }

    const attendance = new Map(
      (attendanceResult.data ?? []).map((row: any) => [
        row.student_id,
        statusMap[row.status] ?? "Unmarked",
      ]),
    );
    const students: Student[] = (studentsResult.data ?? []).map((row: any) => ({
      id: row.student_code,
      name: row.full_name,
      cls: row.class_name ?? "Unassigned",
      guardian: row.guardian_name ?? "Guardian not set",
      guardianEmail: row.guardian_email ?? null,
      guardianPhone: row.guardian_phone ?? null,
      status: attendance.get(row.id) ?? "Unmarked",
      balance: Number(row.balance ?? 0),
      dbId: row.id,
    }));

    patchState({ students });
  }

  async function loadStaff(core: CoreData) {
    const staffResult = await db()
      .from("staff_directory")
      .select("id,full_name,role_title,department,access_label")
      .eq("school_id", core.selectedWorkspace.id)
      .eq("active", true)
      .order("full_name");

    if (staffResult.error) {
      console.error("Could not load staff", staffResult.error);
      return;
    }

    patchState({
      staff: (staffResult.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.full_name,
        role: row.role_title,
        dept: row.department ?? "",
        access: row.access_label,
      })),
    });
  }

  async function loadVisitors(core: CoreData) {
    const visitorsResult = await db()
      .from("visitors")
      .select("id,full_name,purpose,host,checked_in_at,checked_out_at")
      .eq("school_id", core.selectedWorkspace.id)
      .order("checked_in_at", { ascending: false })
      .limit(100);

    if (visitorsResult.error) {
      console.error("Could not load visitors", visitorsResult.error);
      return;
    }

    patchState({
      visitors: (visitorsResult.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.full_name,
        purpose: row.purpose,
        host: row.host,
        time: formatTime(row.checked_in_at, core.selectedWorkspace.timezone),
        status: row.checked_out_at ? "Checked out" as const : "On campus" as const,
      })),
    });
  }

  async function loadActivity(core: CoreData) {
    const activityResult = await db()
      .from("activity_events")
      .select("id,message,tone,created_at")
      .eq("school_id", core.selectedWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (activityResult.error) {
      console.error("Could not load activity", activityResult.error);
      return;
    }

    patchState({
      activity: (activityResult.data ?? []).map((row: any) => ({
        id: row.id,
        time: formatTime(row.created_at, core.selectedWorkspace.timezone),
        text: row.message,
        tone: eventTone(row.tone),
      })),
    });
  }

  async function loadNotifications(core: CoreData) {
    const [notificationResult, preferenceResult] = await Promise.all([
      db()
        .from("notification_outbox")
        .select(
          "id,channel,event_type,recipient,subject,body,status,created_at,students(full_name)",
        )
        .eq("school_id", core.selectedWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db()
        .from("notification_preferences")
        .select(
          "check_in_email,check_in_sms,attendance_email,attendance_sms,fee_due_email,fee_due_sms",
        )
        .eq("school_id", core.selectedWorkspace.id)
        .maybeSingle(),
    ]);

    if (notificationResult.error) {
      console.error("Could not load notifications", notificationResult.error);
      return;
    }

    patchState({
      notifications: notificationResult.data?.length ?? 0,
      notificationLog: (notificationResult.data ?? []).map((row: any) => ({
        id: row.id,
        channel: row.channel === "sms" ? "SMS" as const : "Email" as const,
        event: row.event_type,
        recipient: row.recipient,
        student: row.students?.full_name ?? "Student",
        subject: row.subject ?? "",
        body: row.body,
        createdAt: row.created_at,
        status:
          row.status === "sent"
            ? "Sent" as const
            : row.status === "failed"
              ? "Failed" as const
              : row.status === "sending"
                ? "Sending" as const
                : "Queued" as const,
      })),
      notificationSettings: preferenceResult?.data
        ? {
            checkInEmail: preferenceResult.data.check_in_email,
            checkInSms: preferenceResult.data.check_in_sms,
            attendanceEmail: preferenceResult.data.attendance_email,
            attendanceSms: preferenceResult.data.attendance_sms,
            feeDueEmail: preferenceResult.data.fee_due_email ?? true,
            feeDueSms: preferenceResult.data.fee_due_sms ?? true,
          }
        : emptySettings,
    });
  }

  async function loadPayments(core: CoreData) {
    const paymentsResult = await db()
      .from("payments")
      .select("id,amount,method,status,created_at,paystack_reference,students(full_name)")
      .eq("school_id", core.selectedWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (paymentsResult.error) {
      console.error("Could not load payments", paymentsResult.error);
      return;
    }

    const schoolDate = getSchoolLocalDate(new Date(), core.selectedWorkspace.timezone);
    patchState({
      revenueToday: (paymentsResult.data ?? [])
        .filter(
          (row: any) =>
            row.status === "paid" &&
            getSchoolLocalDate(new Date(row.created_at), core.selectedWorkspace.timezone) ===
              schoolDate,
        )
        .reduce((sum: number, row: any) => sum + Number(row.amount), 0),
      payments: (paymentsResult.data ?? []).map((row: any) => ({
        id: row.id,
        student: row.students?.full_name ?? "Student",
        amount: Number(row.amount),
        method: row.method,
        date: formatTime(row.created_at, core.selectedWorkspace.timezone),
        paystackReference: row.paystack_reference ?? null,
        status:
          row.status === "paid"
            ? "Paid" as const
            : row.status === "failed"
              ? "Failed" as const
              : row.status === "refunded"
                ? "Refunded" as const
                : "Pending" as const,
      })),
    });
  }

  async function load() {
    const generation = ++loadGeneration;
    setState({ ...emptyState, loading: true, error: null });

    const core = await loadCore();
    if (generation !== loadGeneration) return;
    if (!core) return;
    coreData = core;

    patchState({
      school: {
        id: core.school.id,
        name: core.school.name,
        slug: core.school.slug,
        timezone: core.school.timezone,
        logoPath: core.school.logo_path,
        logoUrl: null,
      },
      workspaces: core.workspaces,
      profile: core.profile
        ? {
            name: core.profile.full_name ?? core.userEmail,
            phone: core.profile.phone ?? null,
            avatarPath: core.profile.avatar_path ?? null,
            avatarUrl: null,
          }
        : {
            name: core.userEmail,
            phone: null,
            avatarPath: null,
            avatarUrl: null,
          },
    });

    await Promise.all([
      loadSignedUrls(core),
      loadStudents(core),
      loadStaff(core),
      loadVisitors(core),
      loadActivity(core),
      loadNotifications(core),
      loadPayments(core),
    ]);

    if (generation !== loadGeneration) return;
    patchState({ loading: false });
  }

  async function recordActivity(
    message: string,
    tone: Activity["tone"] = "info",
    action = "school.operation",
    targetType?: string,
    targetId?: string,
  ) {
    const schoolId = getSchoolId();
    if (!schoolId) return;
    const { data: current } = await supabase.auth.getUser();
    const { error } = await db()
      .from("activity_events")
      .insert({
        school_id: schoolId,
        actor_id: current.user?.id ?? null,
        action,
        target_type: targetType ?? null,
        target_id: targetId ?? null,
        message,
        tone,
        metadata: {},
      });
    if (error) throw error;
  }

  function changeWorkspace(id: string) {
    if (!state.workspaces.some((workspace) => workspace.id === id)) {
      throw new Error("You do not have access to that school workspace.");
    }
    selectActiveWorkspace(id);
  }

  async function addStudent(input: {
    name: string;
    id: string;
    cls: string;
    guardian: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    const registrationCode = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const registrationCodeExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { error } = await db()
      .from("students")
      .insert({
        school_id: schoolId,
        full_name: input.name,
        student_code: input.id,
        class_name: input.cls,
        guardian_name: input.guardian,
        guardian_email: input.guardianEmail || null,
        guardian_phone: input.guardianPhone || null,
        registration_code: registrationCode,
        registration_code_expires_at: registrationCodeExpiresAt,
      });
    if (error) throw error;
    await recordActivity(`${input.name} was registered as a new student`, "info");

    patchState({
      students: [
        ...state.students,
        {
          id: input.id,
          dbId: "",
          name: input.name,
          cls: input.cls,
          guardian: input.guardian,
          guardianEmail: input.guardianEmail ?? null,
          guardianPhone: input.guardianPhone ?? null,
          status: "Unmarked",
          balance: 0,
        },
      ],
    });

    if (coreData) {
      loadStudents(coreData).catch(() => {});
    }

    return { registrationCode, expiresAt: registrationCodeExpiresAt };
  }

  async function updateStudent(input: {
    studentDbId: string;
    name: string;
    id: string;
    cls: string;
    guardian: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    if (!input.studentDbId) throw new Error("Student record is unavailable");

    const { error } = await db()
      .from("students")
      .update({
        full_name: input.name,
        student_code: input.id,
        class_name: input.cls,
        guardian_name: input.guardian,
        guardian_email: input.guardianEmail || null,
        guardian_phone: input.guardianPhone || null,
      })
      .eq("id", input.studentDbId)
      .eq("school_id", schoolId);
    if (error) throw error;

    await recordActivity(`${input.name}'s student profile was updated`, "info");
    patchState({
      students: state.students.map((student) =>
        student.dbId === input.studentDbId
          ? {
              ...student,
              id: input.id,
              name: input.name,
              cls: input.cls,
              guardian: input.guardian,
              guardianEmail: input.guardianEmail || null,
              guardianPhone: input.guardianPhone || null,
            }
          : student,
      ),
    });

    if (coreData) {
      loadStudents(coreData).catch(() => {});
    }
  }

  async function setAttendance(
    studentCode: string,
    status: RecordedAttendanceStatus,
    gate?: string,
    eventType = "attendance-update",
  ) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");

    const student = state.students.find((s) => s.id === studentCode);
    const previousStatus = student?.status;

    patchState({
      students: state.students.map((s) =>
        s.id === studentCode ? { ...s, status } : s,
      ),
    });
    const value =
      status === "Present"
        ? "present"
        : status === "Absent"
          ? "absent"
          : status === "Late"
            ? "late"
            : "checked_out";

    try {
      await (recordAttendance as any)({
        data: {
          schoolId,
          studentCode,
          status: value,
          gate,
          eventType: eventType as "check-in" | "check-out" | "attendance-update",
        },
      });

      if (coreData) {
        loadStudents(coreData).catch(() => {});
      }
    } catch (err) {
      patchState({
        students: state.students.map((s) =>
          s.id === studentCode ? { ...s, status: previousStatus ?? "Unmarked" } : s,
        ),
      });
      throw err;
    }
  }

  async function scanStudent(studentCode: string) {
    const student = state.students.find(
      (item) => item.id.toLowerCase() === studentCode.trim().toLowerCase(),
    );
    if (!student) throw new Error("Student not found");
    const next: RecordedAttendanceStatus =
      student.status === "Checked out" ||
      student.status === "Absent" ||
      student.status === "Unmarked"
        ? "Present"
        : "Checked out";
    await setAttendance(
      student.id,
      next,
      "Main Gate",
      next === "Present" ? "check-in" : "check-out",
    );
  }

  async function registerVisitor(input: { name: string; purpose: string; host: string }) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    const user = await supabase.auth.getUser();
    const { error } = await db().from("visitors").insert({
      school_id: schoolId,
      full_name: input.name,
      purpose: input.purpose,
      host: input.host,
      registered_by: user.data.user?.id,
    });
    if (error) throw error;
    await recordActivity(`${input.name} registered at reception`, "success");

    const tz = state.school?.timezone ?? DEFAULT_SCHOOL_TIMEZONE;
    patchState({
      visitors: [
        {
          id: crypto.randomUUID(),
          name: input.name,
          purpose: input.purpose,
          host: input.host,
          time: formatTime(new Date().toISOString(), tz),
          status: "On campus" as const,
        },
        ...state.visitors,
      ],
    });

    if (coreData) {
      loadVisitors(coreData).catch(() => {});
    }
  }

  async function addStaff(input: {
    name: string;
    role: string;
    dept: string;
    email?: string;
    phone?: string;
  }) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    const { error } = await db()
      .from("staff_directory")
      .insert({
        school_id: schoolId,
        full_name: input.name,
        role_title: input.role,
        department: input.dept,
        email: input.email || null,
        phone: input.phone || null,
      });
    if (error) throw error;
    await recordActivity(`${input.name} was added to the staff directory`, "info");

    patchState({
      staff: [
        ...state.staff,
        {
          id: crypto.randomUUID(),
          name: input.name,
          role: input.role,
          dept: input.dept,
          access: "",
        },
      ],
    });

    if (coreData) {
      loadStaff(coreData).catch(() => {});
    }
  }

  async function checkoutVisitor(id: string) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    const { error } = await db()
      .from("visitors")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", schoolId);
    if (error) throw error;
    await recordActivity("Visitor checked out", "info");

    patchState({
      visitors: state.visitors.map((v) =>
        v.id === id ? { ...v, status: "Checked out" as const } : v,
      ),
    });

    if (coreData) {
      loadVisitors(coreData).catch(() => {});
    }
  }

  async function updateNotificationSettings(settings: NotificationSettings) {
    const schoolId = getSchoolId();
    if (!schoolId) throw new Error("No school workspace selected");
    const { error } = await db().from("notification_preferences").upsert({
      school_id: schoolId,
      check_in_email: settings.checkInEmail,
      check_in_sms: settings.checkInSms,
      attendance_email: settings.attendanceEmail,
      attendance_sms: settings.attendanceSms,
      fee_due_email: settings.feeDueEmail,
      fee_due_sms: settings.feeDueSms,
    });
    if (error) throw error;

    patchState({ notificationSettings: settings });

    if (coreData) {
      loadNotifications(coreData).catch(() => {});
    }
  }

  function init() {
    if (typeof window === "undefined") return;
    const reload = () => {
      setState({ ...emptyState, loading: true, error: null });
      void load();
    };
    void load();

    window.addEventListener(ACTIVE_WORKSPACE_CHANGED, reload);
    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key === ACTIVE_WORKSPACE_KEY) {
        reload();
      }
    });
  }

  return {
    subscribe,
    getSnapshot,
    init,
  };
}

const store = createSchoolStore();
store.init();

const serverSnapshot: StoreSnapshot = {
  state: emptyState,
  stats: computeStats(emptyState.students),
  loading: true,
  refresh: async () => {},
  changeWorkspace: () => {},
  addStudent: async () => ({ registrationCode: "", expiresAt: "" }),
  updateStudent: async () => {},
  setAttendance: async () => {},
  scanStudent: async () => {},
  registerVisitor: async () => {},
  checkoutVisitor: async () => {},
  addStaff: async () => {},
  updateNotificationSettings: async () => {},
};

function getServerSnapshot(): StoreSnapshot {
  return serverSnapshot;
}

const SchoolStoreContext = createContext<typeof store>(store);

export function SchoolStoreProvider({ children }: { children: ReactNode }) {
  return createElement(SchoolStoreContext.Provider, { value: store }, children);
}

export function useSchoolStore(): StoreSnapshot {
  const ctx = useContext(SchoolStoreContext);
  return useSyncExternalStore(ctx.subscribe, ctx.getSnapshot, getServerSnapshot);
}
