import { createFileRoute } from "@tanstack/react-router";
import { requireRoles } from "@/lib/route-guards";
import { Plus, Search, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/format";
import { useSchoolStore, type AttendanceStatus } from "@/lib/school-store";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/students")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "principal", "teacher"]),
  component: StudentsPage,
});
const tone: Record<AttendanceStatus, string> = {
  Present: "border-success/40 text-success clay-live",
  Late: "border-warning/40 text-warning",
  Absent: "border-danger/40 text-danger",
  "Checked out": "border-border text-muted-foreground",
  Unmarked: "border-border border-dashed text-muted-foreground",
};
function StudentsPage() {
  const { state, addStudent } = useSchoolStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id);
      if (active) setCanManage((roles ?? []).some((row) => row.role === "admin"));
    })();
    return () => {
      active = false;
    };
  }, []);
  const filtered = useMemo(
    () =>
      state.students.filter((s) =>
        `${s.name} ${s.id} ${s.cls}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [state.students, q],
  );
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await addStudent({
        name: String(f.get("name")),
        id: String(f.get("id")),
        cls: String(f.get("cls")),
        guardian: String(f.get("guardian")),
        guardianEmail: String(f.get("guardianEmail") || ""),
        guardianPhone: String(f.get("guardianPhone") || ""),
      });
      setCodeNotice(
        `Registration code: ${result.registrationCode}. Valid until ${new Date(result.expiresAt).toLocaleString()}. Share it privately with the family.`,
      );
      setOpen(false);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save student");
    }
  };
  return (
    <AppShell
      title="Students"
      subtitle={`${state.students.length} active students`}
      actions={
        canManage ? (
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add student
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        {codeNotice ? (
          <div
            className="clay-success-pop rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
            role="status"
          >
            <strong>New self-registration code</strong>
            <p className="mt-1">{codeNotice}</p>
            <button
              className="mt-2 text-xs font-semibold text-primary underline"
              onClick={() => setCodeNotice("")}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="hairline-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
                placeholder="Search name or admission number"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Admission no.</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Guardian</th>
                  <th className="px-4 py-3">Today</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="numeric px-4 py-3 text-muted-foreground">{s.id}</td>
                    <td className="px-4 py-3">{s.cls}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.guardian}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`font-normal ${tone[s.status]}`}>
                        {s.status}
                      </Badge>
                    </td>
                    <td
                      className={`numeric px-4 py-3 text-right ${s.balance ? "text-danger" : "text-muted-foreground"}`}
                    >
                      {formatNaira(s.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4">
          <form
            onSubmit={add}
            className="hairline-card w-full max-w-lg space-y-4 bg-card p-6 shadow-lift"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  Student register
                </p>
                <h2 className="mt-1 text-xl font-bold">Add a student</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {[
              ["name", "Full name"],
              ["id", "Admission number"],
              ["cls", "Class"],
              ["guardian", "Guardian name"],
              ["guardianEmail", "Guardian email"],
              ["guardianPhone", "Guardian phone"],
            ].map(([name, label]) => (
              <label key={name} className="block space-y-1 text-sm font-medium">
                {label}
                <Input
                  required={name !== "guardianEmail" && name !== "guardianPhone"}
                  name={name}
                  placeholder={label}
                />
              </label>
            ))}
            {error ? <p className="clay-shake text-sm text-danger">{error}</p> : null}
            <Button className="w-full gap-2">
              <UserPlus className="size-4" /> Save student
            </Button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
