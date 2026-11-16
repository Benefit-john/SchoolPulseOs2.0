import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSchoolLocalDate } from "@/lib/school-date";

const input = z.object({
  schoolId: z.string().uuid(),
  studentCode: z.string().min(2).max(50),
  status: z.enum(["present", "absent", "late", "checked_out"]),
  gate: z.string().max(80).optional(),
  eventType: z.enum(["check-in", "check-out", "attendance-update"]),
});
const db = () => supabaseAdmin as any;
const DEFAULT_SCHOOL_TIMEZONE = "Africa/Lagos";

async function getSchoolTimezone(schoolId: string): Promise<string> {
  const { data: school, error } = await db()
    .from("schools")
    .select("timezone")
    .eq("id", schoolId)
    .maybeSingle();
  if (error || !school) {
    throw new Error("Could not determine the school timezone.");
  }
  return school.timezone || DEFAULT_SCHOOL_TIMEZONE;
}

type DeliveryResult = { sent: boolean; id?: string; error?: string };
async function sendEmail(to: string, subject: string, body: string): Promise<DeliveryResult> {
  const key = process.env["SENDGRID_API_KEY"];
  const from = process.env["SENDGRID_FROM_EMAIL"];
  if (!key || !from) return { sent: false, error: "SendGrid is not configured" };
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });
  return response.ok ? { sent: true } : { sent: false, error: await response.text() };
}
async function sendSms(to: string, body: string): Promise<DeliveryResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];
  if (!sid || !token || !from) return { sent: false, error: "Twilio is not configured" };
  const encoded = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encoded,
  });
  const payload = (await response.json()) as { sid?: string; message?: string };
  return response.ok
    ? payload.sid
      ? { sent: true, id: payload.sid }
      : { sent: true }
    : { sent: false, error: payload.message ?? "Twilio request failed" };
}

export const recordAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => input.parse(value))
  .handler(async ({ data, context }) => {
    const workspace = context.supabase as any;
    const { data: member } = await workspace
      .from("school_memberships")
      .select("role")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member || !["admin", "teacher"].includes(member.role))
      throw new Error("Only admins and teachers can record attendance.");
    const timeZone = await getSchoolTimezone(data.schoolId);
    const admin = db();
    const { data: student, error: studentError } = await admin
      .from("students")
      .select("id,full_name,class_name,guardian_name,guardian_email,guardian_phone")
      .eq("school_id", data.schoolId)
      .eq("student_code", data.studentCode)
      .single();
    if (studentError || !student) throw new Error("Student not found in this school workspace.");
    const { error } = await admin.from("attendance_records").upsert(
      {
        school_id: data.schoolId,
        student_id: student.id,
        status: data.status,
        recorded_by: context.userId,
        gate: data.gate ?? null,
        recorded_on: getSchoolLocalDate(new Date(), timeZone),
      },
      { onConflict: "school_id,student_id,recorded_on" },
    );
    if (error) throw new Error(error.message);
    const label =
      data.eventType === "check-in"
        ? "checked in"
        : data.eventType === "check-out"
          ? "checked out"
          : `marked ${data.status.replace("_", " ")}`;
    await admin.from("activity_events").insert({
      school_id: data.schoolId,
      actor_id: context.userId,
      event_type: data.eventType,
      message: `${student.full_name} ${label}${data.gate ? ` at ${data.gate}` : ""}`,
      tone: data.status === "absent" ? "warning" : "info",
    });
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("check_in_email,check_in_sms,attendance_email,attendance_sms")
      .eq("school_id", data.schoolId)
      .maybeSingle();
    const body = `Hello ${student.guardian_name ?? "Guardian"}, ${student.full_name} (${student.class_name ?? "student"}) was ${label} at your school.`;
    const rows: any[] = [];
    if (data.eventType !== "attendance-update" && prefs?.check_in_email && student.guardian_email)
      rows.push({
        school_id: data.schoolId,
        student_id: student.id,
        channel: "email",
        event_type: data.eventType,
        recipient: student.guardian_email,
        subject: `School attendance update for ${student.full_name}`,
        body,
      });
    if (data.eventType !== "attendance-update" && prefs?.check_in_sms && student.guardian_phone)
      rows.push({
        school_id: data.schoolId,
        student_id: student.id,
        channel: "sms",
        event_type: data.eventType,
        recipient: student.guardian_phone,
        body,
      });
    if (data.eventType === "attendance-update" && prefs?.attendance_email && student.guardian_email)
      rows.push({
        school_id: data.schoolId,
        student_id: student.id,
        channel: "email",
        event_type: data.eventType,
        recipient: student.guardian_email,
        subject: `Attendance update for ${student.full_name}`,
        body,
      });
    if (data.eventType === "attendance-update" && prefs?.attendance_sms && student.guardian_phone)
      rows.push({
        school_id: data.schoolId,
        student_id: student.id,
        channel: "sms",
        event_type: data.eventType,
        recipient: student.guardian_phone,
        body,
      });
    if (rows.length) {
      const { data: inserted } = await admin
        .from("notification_outbox")
        .insert(rows)
        .select("id,channel,recipient,subject,body");
      for (const item of inserted ?? []) {
        const result =
          item.channel === "email"
            ? await sendEmail(item.recipient, item.subject ?? "School attendance update", item.body)
            : await sendSms(item.recipient, item.body);
        await admin
          .from("notification_outbox")
          .update({
            status: result.sent ? "sent" : "failed",
            provider_message_id: result.id ?? null,
            error_message: result.error ?? null,
            attempts: 1,
            sent_at: result.sent ? new Date().toISOString() : null,
          })
          .eq("id", item.id);
      }
    }
    return { ok: true as const };
  });

const bulkInput = z.object({
  schoolId: z.string().uuid(),
  studentCodes: z.array(z.string().min(2).max(50)).min(1).max(500),
  status: z.enum(["present", "absent", "late", "checked_out"]),
  gate: z.string().max(80).optional(),
});

export const recordBulkAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => bulkInput.parse(value))
  .handler(async ({ data, context }) => {
    const workspace = context.supabase as any;
    const { data: membership } = await workspace
      .from("school_memberships")
      .select("role")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership || !["admin", "teacher"].includes(membership.role))
      throw new Error("Only admins and teachers can record bulk attendance.");
    const timeZone = await getSchoolTimezone(data.schoolId);
    const admin = db();
    const { data: students, error: studentError } = await admin
      .from("students")
      .select("id,student_code,full_name")
      .eq("school_id", data.schoolId)
      .in("student_code", data.studentCodes);
    if (studentError) throw new Error(studentError.message);
    const today = getSchoolLocalDate(new Date(), timeZone);
    const rows = (students ?? []).map((student: any) => ({
      school_id: data.schoolId,
      student_id: student.id,
      status: data.status,
      recorded_by: context.userId,
      gate: data.gate ?? null,
      recorded_on: today,
    }));
    if (!rows.length) throw new Error("No matching students were found in this school workspace.");
    const { error } = await admin
      .from("attendance_records")
      .upsert(rows, { onConflict: "school_id,student_id,recorded_on" });
    if (error) throw new Error(error.message);
    await admin.from("activity_events").insert({
      school_id: data.schoolId,
      actor_id: context.userId,
      event_type: "bulk-attendance-update",
      action: "attendance.bulk_update",
      target_type: "attendance_records",
      message: `${rows.length} students marked ${data.status.replace("_", " ")}`,
      tone: data.status === "absent" ? "warning" : "info",
      metadata: { count: rows.length, status: data.status, date: today },
    });
    return { ok: true as const, count: rows.length };
  });

const feeReminderInput = z.object({
  schoolId: z.string().uuid(),
  daysBefore: z.number().int().min(1).max(30).default(3),
});
export const sendFeeDueReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => feeReminderInput.parse(value))
  .handler(async ({ data, context }) => {
    const workspace = context.supabase as any;
    const { data: membership } = await workspace
      .from("school_memberships")
      .select("role")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership || !["admin", "bursar"].includes(membership.role))
      throw new Error("Only admins and bursars can send fee reminders.");
    const admin = db();
    const horizon = new Date(Date.now() + data.daysBefore * 86_400_000).toISOString();
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("fee_due_email,fee_due_sms")
      .eq("school_id", data.schoolId)
      .maybeSingle();
    const { data: students, error } = await admin
      .from("students")
      .select("id,full_name,guardian_name,guardian_email,guardian_phone,balance,fee_due_at")
      .eq("school_id", data.schoolId)
      .eq("active", true)
      .gt("balance", 0)
      .not("fee_due_at", "is", null)
      .lte("fee_due_at", horizon)
      .gte("fee_due_at", new Date().toISOString());
    if (error) throw new Error(error.message);
    const rows: any[] = [];
    for (const student of students ?? []) {
      const due = new Date(student.fee_due_at).toLocaleDateString();
      const body = `Hello ${student.guardian_name ?? "Guardian"}, fees of ₦${Number(student.balance).toLocaleString()} for ${student.full_name} are due on ${due}. Please make a payment before the due date.`;
      if (prefs?.fee_due_email !== false && student.guardian_email)
        rows.push({
          school_id: data.schoolId,
          student_id: student.id,
          channel: "email",
          event_type: "fee-due-reminder",
          recipient: student.guardian_email,
          subject: `Fees due soon for ${student.full_name}`,
          body,
        });
      if (prefs?.fee_due_sms !== false && student.guardian_phone)
        rows.push({
          school_id: data.schoolId,
          student_id: student.id,
          channel: "sms",
          event_type: "fee-due-reminder",
          recipient: student.guardian_phone,
          body,
        });
    }
    const { data: inserted } = rows.length
      ? await admin
          .from("notification_outbox")
          .insert(rows)
          .select("id,channel,recipient,subject,body")
      : { data: [] };
    let sent = 0;
    for (const item of inserted ?? []) {
      const result =
        item.channel === "email"
          ? await sendEmail(item.recipient, item.subject ?? "Fee due reminder", item.body)
          : await sendSms(item.recipient, item.body);
      await admin
        .from("notification_outbox")
        .update({
          status: result.sent ? "sent" : "failed",
          provider_message_id: result.id ?? null,
          error_message: result.error ?? null,
          attempts: 1,
          sent_at: result.sent ? new Date().toISOString() : null,
        })
        .eq("id", item.id);
      if (result.sent) sent += 1;
    }
    await admin.from("activity_events").insert({
      school_id: data.schoolId,
      actor_id: context.userId,
      event_type: "fee-due-reminder",
      action: "fees.send_due_reminders",
      message: `Fee reminders processed for ${students?.length ?? 0} students`,
      tone: "info",
      metadata: { studentCount: students?.length ?? 0, messageCount: rows.length, sent },
    });
    return { ok: true as const, students: students?.length ?? 0, queued: rows.length, sent };
  });

const schoolBrandingInput = z
  .object({
    schoolId: z.string().uuid(),
    name: z.string().trim().min(2).max(120).optional(),
    logoPath: z.string().trim().min(1).max(512).optional(),
  })
  .refine((value) => value.name !== undefined || value.logoPath !== undefined);

export const updateSchoolBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => schoolBrandingInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("school_memberships")
      .select("role")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError || membership?.role !== "admin") {
      throw new Error("Only an administrator of this school can update its branding.");
    }
    if (data.logoPath && !data.logoPath.startsWith(`${data.schoolId}/logos/`)) {
      throw new Error("The logo path does not belong to this school.");
    }

    const update: Record<string, string> = {};
    if (data.name !== undefined) update["name"] = data.name;
    if (data.logoPath !== undefined) update["logo_path"] = data.logoPath;
    const { data: school, error } = await db()
      .from("schools")
      .update(update)
      .eq("id", data.schoolId)
      .select("id,name,logo_path")
      .maybeSingle();
    if (error?.code === "42501") {
      throw new Error(
        "The database is blocking school branding updates. Apply the school-branding migration and try again.",
      );
    }
    if (error) {
      throw new Error(
        "The school branding update failed. Check the school database schema and try again.",
      );
    }
    if (!school) {
      throw new Error("No school workspace was found for this admin account.");
    }
    return { name: school.name as string, logoPath: school.logo_path as string | null };
  });
