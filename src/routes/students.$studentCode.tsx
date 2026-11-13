import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, CalendarDays, CircleAlert, Percent, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requireRoles } from "@/lib/route-guards";
import { useSchoolStore, type AttendanceStatus } from "@/lib/school-store";

type AttendanceRecord = {
  gate: string | null;
  recorded_at: string;
  recorded_on: string;
  status: "present" | "absent" | "late" | "checked_out";
};

type Result = {
  grade: string | null;
  published_at: string;
  score: number | null;
  subject: string;
  term: string;
};

const db = () =>
  supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

const attendanceLabels: Record<AttendanceRecord["status"], AttendanceStatus> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  checked_out: "Checked out",
};

const tone: Record<AttendanceStatus, string> = {
  Present: "border-success/40 text-success",
  Absent: "border-danger/40 text-danger",
  Late: "border-warning/40 text-warning",
  "Checked out": "border-border text-muted-foreground",
  Unmarked: "border-border border-dashed text-muted-foreground",
};

export const Route = createFileRoute("/students/$studentCode")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "principal", "teacher"]),
  component: StudentPerformancePage,
});

function StudentPerformancePage() {
  const { studentCode } = Route.useParams();
  const { state } = useSchoolStore();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const student = state.students.find((item) => item.id === studentCode);

  useEffect(() => {
    let active = true;
    const schoolId = state.school?.id;
    const studentId = student?.dbId;
    if (!schoolId || !studentId) {
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoading(true);
      setError("");
      const [attendanceResult, resultsResult] = await Promise.all([
        db()
          .from("attendance_records")
          .select("status,recorded_on,recorded_at,gate")
          .eq("school_id", schoolId)
          .eq("student_id", studentId)
          .order("recorded_on", { ascending: false })
          .limit(60),
        db()
          .from("student_results")
          .select("subject,score,grade,term,published_at")
          .eq("school_id", schoolId)
          .eq("student_id", studentId)
          .order("published_at", { ascending: false })
          .limit(60),
      ]);
      if (!active) return;
      if (attendanceResult.error || resultsResult.error) {
        setError("Could not load this student’s performance. Please try again.");
        setAttendance([]);
        setResults([]);
      } else {
        setAttendance((attendanceResult.data ?? []) as AttendanceRecord[]);
        setResults((resultsResult.data ?? []) as Result[]);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [state.school?.id, student?.dbId]);

  const summary = useMemo(() => {
    const present = attendance.filter((record) => record.status === "present").length;
    const late = attendance.filter((record) => record.status === "late").length;
    const absent = attendance.filter((record) => record.status === "absent").length;
    const scored = results.filter((result) => result.score !== null);
    const average = scored.length
      ? scored.reduce((total, result) => total + Number(result.score), 0) / scored.length
      : null;
    return {
      absent,
      attendanceRate: attendance.length
        ? Math.round(((present + late) / attendance.length) * 100)
        : null,
      average,
      late,
    };
  }, [attendance, results]);

  if (!student) {
    return (
      <AppShell
        title="Student not found"
        subtitle="This student is not in the selected school workspace."
      >
        <Button asChild variant="outline">
          <Link to="/students">
            <ArrowLeft className="mr-2 size-4" /> Back to students
          </Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell title={student.name} subtitle={`${student.id} · ${student.cls}`}>
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/students">
            <ArrowLeft className="mr-2 size-4" /> All students
          </Link>
        </Button>

        <section className="hairline-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                Student performance
              </p>
              <h2 className="display-title mt-1 text-xl">{student.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Guardian: {student.guardian}</p>
            </div>
            <Badge variant="outline" className={tone[student.status]}>
              Today: {student.status}
            </Badge>
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            className="hairline-card flex items-center gap-3 border-danger/30 bg-danger/5 p-4 text-sm text-danger"
          >
            <CircleAlert className="size-5 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Percent}
            label="Attendance rate"
            value={summary.attendanceRate === null ? "—" : `${summary.attendanceRate}%`}
            hint="Recorded days"
          />
          <Metric
            icon={CalendarDays}
            label="Late arrivals"
            value={String(summary.late)}
            hint="Recorded days"
          />
          <Metric
            icon={CircleAlert}
            label="Absences"
            value={String(summary.absent)}
            hint="Recorded days"
          />
          <Metric
            icon={Trophy}
            label="Average score"
            value={summary.average === null ? "—" : `${Math.round(summary.average)}%`}
            hint={`${results.length} published results`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="hairline-card overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <h2 className="display-title text-base">Attendance performance</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Most recent 60 attendance records
              </p>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-muted-foreground">Loading attendance history…</p>
            ) : null}
            {!loading && !attendance.length ? (
              <p className="p-5 text-sm text-muted-foreground">No attendance records yet.</p>
            ) : null}
            {!loading && attendance.length ? (
              <div className="max-h-96 divide-y divide-border overflow-y-auto">
                {attendance.map((record) => {
                  const status = attendanceLabels[record.status];
                  return (
                    <div
                      key={`${record.recorded_on}-${record.recorded_at}`}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(`${record.recorded_on}T00:00:00`).toLocaleDateString()}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {record.gate ?? "School register"}
                        </p>
                      </div>
                      <Badge variant="outline" className={tone[status]}>
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="hairline-card overflow-hidden">
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-primary" />
                <h2 className="display-title text-base">Academic performance</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Published assessment results</p>
            </div>
            {loading ? (
              <p className="p-5 text-sm text-muted-foreground">Loading academic results…</p>
            ) : null}
            {!loading && !results.length ? (
              <p className="p-5 text-sm text-muted-foreground">No published results yet.</p>
            ) : null}
            {!loading && results.length ? (
              <div className="max-h-96 divide-y divide-border overflow-y-auto">
                {results.map((result) => (
                  <div
                    key={`${result.subject}-${result.term}-${result.published_at}`}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{result.subject}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {result.term} · Grade {result.grade ?? "—"}
                      </p>
                    </div>
                    <p className="numeric text-sm font-semibold">
                      {result.score === null ? "—" : `${result.score}%`}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Percent;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <section className="hairline-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="numeric mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}
