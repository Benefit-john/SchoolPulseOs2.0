import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSchoolLocalDate } from "@/lib/school-date";
import { detectAssistantIntent } from "@/lib/assistant-intent";

const assistantRoles = ["admin", "principal", "teacher", "bursar", "security"] as const;
type AssistantRole = (typeof assistantRoles)[number];
type DbRow = Record<string, unknown>;
type DbResult = {
  data: DbRow[] | null;
  error: { message: string } | null;
  count?: number | null;
};
type DbQuery = PromiseLike<DbResult> & {
  select: (columns: string, options?: { count?: "exact"; head?: boolean }) => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  in: (column: string, values: unknown[]) => DbQuery;
  is: (column: string, value: null) => DbQuery;
  limit: (count: number) => DbQuery;
};
type AdminDatabase = { from: (table: string) => DbQuery };

const inputSchema = z.object({
  schoolId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12),
});

const adminDb = () => supabaseAdmin as unknown as AdminDatabase;

function isRole(value: string): value is AssistantRole {
  return assistantRoles.some((role) => role === value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getRows(query: DbQuery): Promise<DbRow[]> {
  const { data, error } = await query;
  if (error) {
    console.error("School assistant query failed", error.message);
    throw new Error("School data could not be loaded. Please try again.");
  }
  return data ?? [];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number): string {
  return `₦${formatNumber(value)}`;
}

export const askSchoolAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => inputSchema.parse(value))
  .handler(async ({ data, context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("school_memberships")
      .select("role")
      .eq("school_id", data.schoolId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (membershipError || !membership || !isRole(membership.role)) {
      return {
        ok: false as const,
        message: "You do not have assistant access to this school workspace.",
      };
    }

    const role = membership.role;
    const lastUserMessage = [...data.messages].reverse().find((message) => message.role === "user");
    if (!lastUserMessage) {
      return { ok: false as const, message: "Ask a question to get started." };
    }
    const previousMessages = data.messages.slice(0, -1);
    const previousUserMessage = [...previousMessages]
      .reverse()
      .find((message) => message.role === "user")?.content;
    const intent = detectAssistantIntent(lastUserMessage.content, previousUserMessage);
    if (!intent) {
      return {
        ok: true as const,
        answer:
          "I can look up attendance, students needing follow-up, outstanding fee balances, academic results, staff counts, and visitors on campus. Try asking a direct question, such as “Who was absent today?” or “Which students scored below 40% in Mathematics?”",
      };
    }

    const database = adminDb();
    const schoolRows = await getRows(
      database.from("schools").select("name,timezone").eq("id", data.schoolId).limit(1),
    );
    const school = schoolRows[0];
    if (!school) {
      return { ok: false as const, message: "The selected school workspace was not found." };
    }
    const schoolName = asString(school["name"]) || "School";
    const timezone = asString(school["timezone"]) || "Africa/Lagos";
    const today = getSchoolLocalDate(new Date(), timezone);

    if (intent.type === "greeting") {
      return {
        ok: true as const,
        answer: `Hello! I’m your ${schoolName} data assistant. I can look up current school records that your ${role} role is allowed to see. Ask me about attendance, fees, academic results, staff, or campus visitors.`,
      };
    }

    if (intent.type === "attendance-summary" || intent.type === "attendance-list") {
      if (!["admin", "principal", "teacher"].includes(role)) {
        return {
          ok: true as const,
          answer: "Your role does not have permission to view student attendance.",
        };
      }

      const [students, records] = await Promise.all([
        getRows(
          database
            .from("students")
            .select("id,full_name,class_name")
            .eq("school_id", data.schoolId)
            .eq("active", true)
            .limit(5000),
        ),
        getRows(
          database
            .from("attendance_records")
            .select("student_id,status")
            .eq("school_id", data.schoolId)
            .eq("recorded_on", today)
            .limit(5000),
        ),
      ]);
      const attendanceByStudent = new Map(
        records.map((row) => [asString(row["student_id"]), asString(row["status"])]),
      );
      const counts = { present: 0, absent: 0, late: 0, checked_out: 0, unmarked: 0 };
      for (const student of students) {
        const status = attendanceByStudent.get(asString(student["id"]));
        if (status === "present") counts.present += 1;
        else if (status === "absent") counts.absent += 1;
        else if (status === "late") counts.late += 1;
        else if (status === "checked_out") counts.checked_out += 1;
        else counts.unmarked += 1;
      }

      if (intent.type === "attendance-summary") {
        return {
          ok: true as const,
          answer: `For ${today} (${timezone}), ${students.length} active students are in ${schoolName}: ${counts.present} present, ${counts.absent} absent, ${counts.late} late, ${counts.checked_out} checked out, and ${counts.unmarked} not yet marked. ${
            students.length === 5000 || records.length === 5000
              ? "The query reached its 5,000-record safety limit, so these totals may be incomplete."
              : ""
          }`,
        };
      }

      const matching = students
        .filter((student) => {
          const studentStatus = attendanceByStudent.get(asString(student["id"]));
          if (intent.status === "unmarked") return !studentStatus;
          return studentStatus === intent.status;
        })
        .map((student) => ({
          name: asString(student["full_name"]),
          className: asString(student["class_name"]) || "Unassigned",
        }));
      const names = matching
        .slice(0, 30)
        .map((student) => `${student.name} (${student.className})`)
        .join(", ");
      const label = intent.status === "unmarked" ? "not marked yet" : intent.status;
      return {
        ok: true as const,
        answer:
          matching.length === 0
            ? `No students are ${label} in the ${today} register.`
            : `${matching.length}${matching.length > 30 ? "+" : ""} student(s) are ${label} in the ${today} register: ${names}${
                matching.length > 30 ? ". Showing the first 30." : "."
              }`,
      };
    }

    if (intent.type === "fee-summary" || intent.type === "fee-list") {
      if (!["admin", "bursar"].includes(role)) {
        return {
          ok: true as const,
          answer: "Your role does not have permission to view fee balances.",
        };
      }
      const rows = await getRows(
        database
          .from("students")
          .select("full_name,class_name,balance")
          .eq("school_id", data.schoolId)
          .eq("active", true)
          .limit(5000),
      );
      const debtors = rows
        .map((row) => ({
          name: asString(row["full_name"]),
          className: asString(row["class_name"]) || "Unassigned",
          balance: asNumber(row["balance"]) ?? 0,
        }))
        .filter((student) => student.balance > 0)
        .sort((a, b) => b.balance - a.balance);
      const total = debtors.reduce((sum, student) => sum + student.balance, 0);
      if (intent.type === "fee-summary") {
        return {
          ok: true as const,
          answer: `${debtors.length} active student(s) have outstanding balances, totalling ${formatMoney(total)}.${
            rows.length === 5000 ? " The query reached its 5,000-student safety limit." : ""
          }`,
        };
      }
      return {
        ok: true as const,
        answer:
          debtors.length === 0
            ? "There are no outstanding student balances in this school."
            : `Outstanding balances total ${formatMoney(total)}. Largest balances first: ${debtors
                .slice(0, 30)
                .map(
                  (student) =>
                    `${student.name} (${student.className}): ${formatMoney(student.balance)}`,
                )
                .join("; ")}${debtors.length > 30 ? "; showing the first 30." : "."}`,
      };
    }

    if (intent.type === "academic-summary" || intent.type === "academic-low-scores") {
      if (!["admin", "principal", "teacher"].includes(role)) {
        return {
          ok: true as const,
          answer: "Your role does not have permission to view academic results.",
        };
      }
      const rows = await getRows(
        database
          .from("student_results")
          .select("student_id,term,subject,score")
          .eq("school_id", data.schoolId)
          .limit(5000),
      );
      const results = rows
        .map((row) => ({
          studentId: asString(row["student_id"]),
          term: asString(row["term"]),
          subject: asString(row["subject"]),
          score: asNumber(row["score"]),
        }))
        .filter((row) => row.score !== null)
        .filter(
          (row) =>
            (!intent.term ||
              row.term.toLocaleLowerCase().includes(intent.term.toLocaleLowerCase())) &&
            (!intent.subject ||
              row.subject.toLocaleLowerCase().includes(intent.subject.toLocaleLowerCase())),
        );

      if (intent.type === "academic-summary") {
        if (!results.length) {
          return {
            ok: true as const,
            answer: "I couldn’t find published numeric results matching that term or subject.",
          };
        }
        const bySubject = new Map<string, { total: number; count: number }>();
        for (const result of results) {
          const current = bySubject.get(result.subject) ?? { total: 0, count: 0 };
          current.total += result.score!;
          current.count += 1;
          bySubject.set(result.subject, current);
        }
        const average = results.reduce((sum, result) => sum + result.score!, 0) / results.length;
        const summaries = [...bySubject.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([subject, values]) =>
              `${subject}: ${formatNumber(values.total / values.count)}% average (${values.count} result(s))`,
          );
        return {
          ok: true as const,
          answer: `Academic summary for ${intent.term || "all available terms"}: overall average ${formatNumber(average)}% across ${results.length} result(s). ${summaries.join("; ")}.${
            rows.length === 5000 ? " The query reached its 5,000-result safety limit." : ""
          }`,
        };
      }

      const matching = results.filter((result) => result.score! < intent.threshold);
      const studentIds = [...new Set(matching.map((result) => result.studentId))];
      const students = studentIds.length
        ? await getRows(
            database
              .from("students")
              .select("id,full_name,class_name")
              .eq("school_id", data.schoolId)
              .in("id", studentIds)
              .limit(5000),
          )
        : [];
      const byId = new Map(
        students.map((student) => [
          asString(student["id"]),
          {
            name: asString(student["full_name"]),
            className: asString(student["class_name"]) || "Unassigned",
          },
        ]),
      );
      const names = matching
        .slice(0, 30)
        .map((result) => {
          const student = byId.get(result.studentId);
          return `${student?.name ?? "Student"} (${student?.className ?? "Unassigned"}) — ${result.subject}, ${result.term}: ${formatNumber(result.score!)}%`;
        })
        .join("; ");
      return {
        ok: true as const,
        answer:
          matching.length === 0
            ? `No results below ${intent.threshold}% matched${
                intent.subject ? ` ${intent.subject}` : ""
              }${intent.term ? ` for ${intent.term}` : ""}.`
            : `${matching.length}${matching.length > 30 ? "+" : ""} result(s) below ${intent.threshold}%${
                intent.subject ? ` in ${intent.subject}` : ""
              }${intent.term ? ` for ${intent.term}` : ""}: ${names}${
                matching.length > 30 ? "; showing the first 30." : "."
              }`,
      };
    }

    if (intent.type === "staff-count") {
      if (!["admin", "principal"].includes(role)) {
        return {
          ok: true as const,
          answer: "Your role does not have permission to view staff-directory information.",
        };
      }
      const staff = await getRows(
        database
          .from("staff_directory")
          .select("role_title")
          .eq("school_id", data.schoolId)
          .eq("active", true)
          .limit(5000),
      );
      const matching = staff.filter(
        (row) => intent.staffKind === "all" || /\bteacher\b/i.test(asString(row["role_title"])),
      ).length;
      return {
        ok: true as const,
        answer: `${matching} active ${
          intent.staffKind === "teacher" ? "teacher(s)" : "staff member(s)"
        } are listed in the staff directory for ${schoolName}.${
          staff.length === 5000 ? " The query reached its 5,000-record safety limit." : ""
        }`,
      };
    }

    if (intent.type === "visitor-count") {
      if (!["admin", "security"].includes(role)) {
        return {
          ok: true as const,
          answer: "Your role does not have permission to view visitor records.",
        };
      }
      const { count, error } = await database
        .from("visitors")
        .select("id", { count: "exact", head: true })
        .eq("school_id", data.schoolId)
        .is("checked_out_at", null);
      if (error) {
        console.error("School assistant visitor count failed", error.message);
        throw new Error("Visitor information could not be loaded. Please try again.");
      }
      return {
        ok: true as const,
        answer: `${count ?? 0} visitor(s) are currently checked in at ${schoolName}.`,
      };
    }

    return { ok: true as const, answer: "I couldn’t match that to a school-data question." };
  });
