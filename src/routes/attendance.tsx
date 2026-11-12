import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, ClipboardList, LogOut, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useSchoolStore,
  type AttendanceStatus,
  type RecordedAttendanceStatus,
} from "@/lib/school-store";
import { recordBulkAttendance } from "@/lib/operations.functions";
import { requireRoles } from "@/lib/route-guards";

export const Route = createFileRoute("/attendance")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "teacher"]),
  component: AttendancePage,
});
const statuses: RecordedAttendanceStatus[] = ["Present", "Absent", "Late", "Checked out"];
const apiStatus: Record<RecordedAttendanceStatus, "present" | "absent" | "late" | "checked_out"> = {
  Present: "present",
  Absent: "absent",
  Late: "late",
  "Checked out": "checked_out",
};
const tone: Record<AttendanceStatus, string> = {
  Present: "border-success/40 text-success clay-live",
  Absent: "border-danger/40 text-danger",
  Late: "border-warning/40 text-warning",
  "Checked out": "border-border text-muted-foreground",
  Unmarked: "border-border border-dashed text-muted-foreground",
};

function AttendancePage() {
  const { state, stats, setAttendance, refresh } = useSchoolStore();
  const bulk = useServerFn(recordBulkAttendance);
  const [error, setError] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");
  const [bulkStatus, setBulkStatus] = useState<RecordedAttendanceStatus>("Present");
  const [busy, setBusy] = useState(false);
  const classes = useMemo(
    () => Array.from(new Set(state.students.map((student) => student.cls))).sort(),
    [state.students],
  );
  const visible =
    selectedClass === "all"
      ? state.students
      : state.students.filter((student) => student.cls === selectedClass);
  const update = async (id: string, status: RecordedAttendanceStatus) => {
    setError("");
    try {
      await setAttendance(id, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update attendance");
    }
  };
  const markClass = async () => {
    if (!state.school || !visible.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await bulk({
        data: {
          schoolId: state.school.id,
          studentCodes: visible.map((student) => student.id),
          status: apiStatus[bulkStatus],
        },
      });
      setError(`${result.count} students marked ${bulkStatus.toLowerCase()}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the class");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppShell title="Attendance" subtitle="Today’s register across all classes">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Students present"
          value={String(stats.present)}
          icon={CheckCircle2}
          hint="Marked today"
        />
        <KpiCard
          label="Absent today"
          value={String(stats.absent)}
          icon={UserX}
          hint="Confirmed absent"
        />
        <KpiCard
          label="Late arrivals"
          value={String(stats.late)}
          icon={Clock3}
          hint="Marked today"
        />
        <KpiCard
          label="Checked out"
          value={String(stats.checkedOut)}
          icon={LogOut}
          hint="Marked today"
        />
        <KpiCard
          label="Unmarked"
          value={String(stats.unmarked)}
          icon={ClipboardList}
          hint="No record today"
        />
      </div>
      <section className="hairline-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display-title text-base">Bulk class entry</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mark an entire class in one action, then correct individual exceptions below.
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">
            <Users className="mr-1 size-3" /> {visible.length} students
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Class
            <select
              aria-label="Choose class"
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              className="h-10 min-w-44 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="all">All classes</option>
              {classes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Status
            <select
              aria-label="Bulk attendance status"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value as RecordedAttendanceStatus)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <Button disabled={busy || !visible.length} onClick={() => void markClass()}>
            {busy ? "Saving…" : `Mark ${selectedClass === "all" ? "all students" : selectedClass}`}
          </Button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {error}
          </p>
        ) : null}
      </section>
      <section className="hairline-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="display-title text-base">Today’s attendance picture</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Updates are saved to the school workspace and queued for guardian alerts.
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700">Live today</Badge>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${stats.roll ? Math.round((stats.present / stats.roll) * 100) : 0}%` }}
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
        </div>
      </section>
      <section className="hairline-card overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="display-title text-base">Register</h2>
        </div>
        <div className="divide-y divide-border">
          {visible.map((student) => (
            <div key={student.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{student.name}</p>
                <p className="text-xs text-muted-foreground">
                  {student.id} · {student.cls}
                </p>
              </div>
              <Badge variant="outline" className={tone[student.status]}>
                {student.status}
              </Badge>
              <div className="flex flex-wrap gap-1">
                {statuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={student.status === status ? "secondary" : "ghost"}
                    className="text-xs"
                    onClick={() => void update(student.id, status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {!visible.length ? (
            <p className="p-6 text-sm text-muted-foreground">
              No students are assigned to this class yet.
            </p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
