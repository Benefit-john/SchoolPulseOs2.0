import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useSchoolStore } from "@/lib/school-store";
import { requireRoles } from "@/lib/route-guards";

const Scanner = lazy(() => import("@/components/scanner"));

export const Route = createFileRoute("/scanner")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "teacher"]),
  component: ScannerPage,
});

function ScannerPage() {
  const { state, scanStudent } = useSchoolStore();
  const recent = state.activity
    .filter(
      (activity) =>
        activity.text.includes("checked") ||
        activity.text.includes("present") ||
        activity.text.includes("out"),
    )
    .slice(0, 5);

  const handleScan = async (value: string) => {
    const student = state.students.find(
      (item) => item.id.toLowerCase() === value.trim().toLowerCase(),
    );
    if (!student) throw new Error("Student not registered.");

    try {
      await scanStudent(value);
      return student.name;
    } catch (error) {
      if (error instanceof Error && error.message === "Student not found") {
        throw new Error("Student not registered.");
      }
      throw new Error("Could not verify this student. Check the ID and try again.");
    }
  };

  return (
    <AppShell
      title="Gate scanner"
      subtitle="Main Gate · camera check-in/check-out with manual fallback"
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Suspense
            fallback={
              <div
                className="clay-card hairline-card min-h-72 animate-pulse p-5"
                role="status"
                aria-label="Loading scanner"
              />
            }
          >
            <Scanner onScan={handleScan} />
          </Suspense>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <div className="hairline-card clay-card p-5">
            <h2 className="display-title text-base">Recent gate activity</h2>
            <ul className="mt-4 space-y-3">
              {recent.map((activity) => (
                <li
                  key={activity.id}
                  className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    ID
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{activity.text}</p>
                    <p className="numeric text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    Saved
                  </Badge>
                </li>
              ))}
              {recent.length === 0 ? (
                <li className="py-3 text-sm text-muted-foreground">
                  No gate activity has been recorded yet.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

