import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordAttendance } from "@/lib/operations.functions";
import { getSchoolLocalDate } from "@/lib/school-date";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_WORKSPACE_CHANGED,
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

export function useSchoolStore() {
  const [state, setState] = useState<SchoolState>(emptyState);
  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (generation !== loadGeneration.current) return;
    if (userError || !userResult.user) {
      setState({
        ...emptyState,
        loading: false,
        error: "Please sign in to access a school workspace.",
      });
      return;
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
    if (generation !== loadGeneration.current) return;
    if (membershipResult.error || !membershipResult.data?.length) {
      setState({
        ...emptyState,
        loading: false,
        error: "Your account is not assigned to a school workspace yet.",
      });
      return;
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
      return;
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
      return;
    }

    const [logoResult, avatarResult] = await Promise.all([
      school.logo_path
        ? supabase.storage.from("school-assets").createSignedUrl(school.logo_path, 3600)
        : Promise.resolve({ data: null, error: null }),
      profileResult.data?.avatar_path
        ? supabase.storage
            .from("school-assets")
            .createSignedUrl(profileResult.data.avatar_path, 3600)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (generation !== loadGeneration.current) return;
    const [
      studentsResult,
      attendanceResult,
      staffResult,
      visitorsResult,
      activityResult,
      notificationResult,
      preferenceResult,
      paymentsResult,
    ] = await Promise.all([
      db()
        .from("students")
        .select(
          "id,student_code,full_name,class_name,guardian_name,guardian_email,guardian_phone,balance",
        )
        .eq("school_id", selectedWorkspace.id)
        .eq("active", true)
        .order("full_name"),
      db()
        .from("attendance_records")
        .select("student_id,status")
        .eq("school_id", selectedWorkspace.id)
        .eq("recorded_on", getSchoolLocalDate(new Date(), selectedWorkspace.timezone)),
      db()
        .from("staff_directory")
        .select("id,full_name,role_title,department,access_label")
        .eq("school_id", selectedWorkspace.id)
        .eq("active", true)
        .order("full_name"),
      db()
        .from("visitors")
        .select("id,full_name,purpose,host,checked_in_at,checked_out_at")
        .eq("school_id", selectedWorkspace.id)
        .order("checked_in_at", { ascending: false })
        .limit(100),
      db()
        .from("activity_events")
        .select("id,message,tone,created_at")
        .eq("school_id", selectedWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(30),
      db()
        .from("notification_outbox")
        .select(
          "id,channel,event_type,recipient,subject,body,status,created_at,students(full_name)",
        )
        .eq("school_id", selectedWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(50),
      db()
        .from("notification_preferences")
        .select(
          "check_in_email,check_in_sms,attendance_email,attendance_sms,fee_due_email,fee_due_sms",
        )
        .eq("school_id", selectedWorkspace.id)
        .maybeSingle(),
      db()
        .from("payments")
        .select("id,amount,method,status,created_at,paystack_reference,students(full_name)")
        .eq("school_id", selectedWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (generation !== loadGeneration.current) return;
    const queryError = [
      studentsResult,
      attendanceResult,
      staffResult,
      visitorsResult,
      activityResult,
      notificationResult,
      preferenceResult,
      paymentsResult,
    ].find((result) => result.error)?.error;
    if (queryError) {
      console.error("Could not load school workspace data", queryError);
      setState({
        ...emptyState,
        loading: false,
        error: "Could not load school workspace data. Check your connection and permissions.",
      });
      return;
    }

    const schoolDate = getSchoolLocalDate(new Date(), selectedWorkspace.timezone);
    const attendance = new Map(
      (attendanceResult.data ?? []).map((row: any) => [
        row.student_id,
        statusMap[row.status] ?? "Unmarked",
      ]),
    );
    const students = (studentsResult.data ?? []).map((row: any) => ({
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
    setState({
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        timezone: selectedWorkspace.timezone,
        logoPath: school.logo_path ?? null,
        logoUrl: logoResult.data?.signedUrl ?? null,
      },
      workspaces,
      profile: profileResult.data
        ? {
            name: profileResult.data.full_name ?? userResult.user.email ?? "Signed-in user",
            phone: profileResult.data.phone ?? null,
            avatarPath: profileResult.data.avatar_path ?? null,
            avatarUrl: avatarResult.data?.signedUrl ?? null,
          }
        : {
            name: userResult.user.email ?? "Signed-in user",
            phone: null,
            avatarPath: null,
            avatarUrl: null,
          },
      students,
      staff: (staffResult.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.full_name,
        role: row.role_title,
        dept: row.department ?? "",
        access: row.access_label,
      })),
      visitors: (visitorsResult.data ?? []).map((row: any) => ({
        id: row.id,
        name: row.full_name,
        purpose: row.purpose,
        host: row.host,
        time: formatTime(row.checked_in_at, selectedWorkspace.timezone),
        status: row.checked_out_at ? "Checked out" : "On campus",
      })),
      activity: (activityResult.data ?? []).map((row: any) => ({
        id: row.id,
        time: formatTime(row.created_at, selectedWorkspace.timezone),
        text: row.message,
        tone: eventTone(row.tone),
      })),
      notifications: notificationResult.data?.length ?? 0,
      revenueToday: (paymentsResult.data ?? [])
        .filter(
          (row: any) =>
            row.status === "paid" &&
            getSchoolLocalDate(new Date(row.created_at), selectedWorkspace.timezone) === schoolDate,
        )
        .reduce((sum: number, row: any) => sum + Number(row.amount), 0),
      payments: (paymentsResult.data ?? []).map((row: any) => ({
        id: row.id,
        student: row.students?.full_name ?? "Student",
        amount: Number(row.amount),
        method: row.method,
        date: formatTime(row.created_at, selectedWorkspace.timezone),
        paystackReference: row.paystack_reference ?? null,
        status:
          row.status === "paid"
            ? "Paid"
            : row.status === "failed"
              ? "Failed"
              : row.status === "refunded"
                ? "Refunded"
                : "Pending",
      })),
      notificationLog: (notificationResult.data ?? []).map((row: any) => ({
        id: row.id,
        channel: row.channel === "sms" ? "SMS" : "Email",
        event: row.event_type,
        recipient: row.recipient,
        student: row.students?.full_name ?? "Student",
        subject: row.subject ?? "",
        body: row.body,
        createdAt: row.created_at,
        status:
          row.status === "sent"
            ? "Sent"
            : row.status === "failed"
              ? "Failed"
              : row.status === "sending"
                ? "Sending"
                : "Queued",
      })),
      notificationSettings: preferenceResult.data
        ? {
            checkInEmail: preferenceResult.data.check_in_email,
            checkInSms: preferenceResult.data.check_in_sms,
            attendanceEmail: preferenceResult.data.attendance_email,
            attendanceSms: preferenceResult.data.attendance_sms,
            feeDueEmail: preferenceResult.data.fee_due_email ?? true,
            feeDueSms: preferenceResult.data.fee_due_sms ?? true,
          }
        : emptySettings,
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    const reload = () => {
      setState({ ...emptyState, loading: true, error: null });
      void load();
    };
    void load();
    window.addEventListener(ACTIVE_WORKSPACE_CHANGED, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(ACTIVE_WORKSPACE_CHANGED, reload);
      window.removeEventListener("storage", reload);
    };
  }, [load]);

  const schoolId = state.school?.id;
  const recordAttendanceServer = useServerFn(recordAttendance);
  const changeWorkspace = useCallback(
    (id: string) => {
      if (!state.workspaces.some((workspace) => workspace.id === id)) {
        throw new Error("You do not have access to that school workspace.");
      }
      selectActiveWorkspace(id);
    },
    [state.workspaces],
  );
  const recordActivity = async (
    message: string,
    tone: Activity["tone"] = "info",
    action = "school.operation",
    targetType?: string,
    targetId?: string,
  ) => {
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
  };
  const addStudent = async (input: {
    name: string;
    id: string;
    cls: string;
    guardian: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => {
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
    await load();
    return { registrationCode, expiresAt: registrationCodeExpiresAt };
  };
  const setAttendance = async (
    studentCode: string,
    status: RecordedAttendanceStatus,
    gate?: string,
    eventType = "attendance-update",
  ) => {
    if (!schoolId) throw new Error("No school workspace selected");
    const value =
      status === "Present"
        ? "present"
        : status === "Absent"
          ? "absent"
          : status === "Late"
            ? "late"
            : "checked_out";
    await recordAttendanceServer({
      data: {
        schoolId,
        studentCode,
        status: value,
        gate,
        eventType: eventType as "check-in" | "check-out" | "attendance-update",
      },
    });
    await load();
  };
  const scanStudent = async (studentCode: string) => {
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
  };
  const registerVisitor = async (input: { name: string; purpose: string; host: string }) => {
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
    await load();
  };
  const addStaff = async (input: {
    name: string;
    role: string;
    dept: string;
    email?: string;
    phone?: string;
  }) => {
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
    await load();
  };
  const checkoutVisitor = async (id: string) => {
    if (!schoolId) throw new Error("No school workspace selected");
    const { error } = await db()
      .from("visitors")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", schoolId);
    if (error) throw error;
    await recordActivity("Visitor checked out", "info");
    await load();
  };
  const updateNotificationSettings = async (settings: NotificationSettings) => {
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
    await load();
  };
  const stats = useMemo(
    () => ({
      present: state.students.filter((student) => student.status === "Present").length,
      absent: state.students.filter((student) => student.status === "Absent").length,
      late: state.students.filter((student) => student.status === "Late").length,
      checkedOut: state.students.filter((student) => student.status === "Checked out").length,
      unmarked: state.students.filter((student) => student.status === "Unmarked").length,
      roll: state.students.length,
    }),
    [state.students],
  );
  return {
    state,
    stats,
    loading: state.loading,
    refresh: load,
    changeWorkspace,
    addStudent,
    setAttendance,
    scanStudent,
    registerVisitor,
    checkoutVisitor,
    addStaff,
    updateNotificationSettings,
  };
}
