import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { requireRoles } from "@/lib/route-guards";
import { Pencil, Plus, Search, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNaira } from "@/lib/format";
import { useSchoolStore, type AttendanceStatus, type Student } from "@/lib/school-store";
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
  const { state, addStudent, updateStudent } = useSchoolStore();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const studentProfile = matchRoute({ to: "/students/$studentCode", fuzzy: false });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      const schoolId = state.school?.id;
      if (!user.user || !schoolId) {
        if (active) setCanManage(false);
        return;
      }
      const { data: membership } = await supabase
        .from("school_memberships")
        .select("role")
        .eq("user_id", user.user.id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (active) setCanManage(membership?.role === "admin");
    })();
    return () => {
      active = false;
    };
  }, [state.school?.id]);
  const filtered = useMemo(
    () =>
      state.students.filter((s) =>
        `${s.name} ${s.id} ${s.cls}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [state.students, q],
  );
  const saveStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const input = {
        name: String(f.get("name")),
        id: String(f.get("id")),
        cls: String(f.get("cls")),
        guardian: String(f.get("guardian")),
        guardianEmail: String(f.get("guardianEmail") || ""),
        guardianPhone: String(f.get("guardianPhone") || ""),
      };
      if (editingStudent) {
        await updateStudent({ ...input, studentDbId: editingStudent.dbId });
        setCodeNotice(`${input.name}'s details were updated.`);
      } else {
        const result = await addStudent(input);
        setCodeNotice(
          `Registration code: ${result.registrationCode}. Valid until ${new Date(result.expiresAt).toLocaleString()}. Share it privately with the family.`,
        );
      }
      setEditingStudent(null);
      setOpen(false);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save student");
    }
  };

  if (studentProfile) return <Outlet />;

  return (
    <AppShell
      title="Students"
      subtitle={`${state.students.length} active students`}
      actions={
        canManage ? (
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditingStudent(null);
              setError("");
              setOpen(true);
            }}
          >
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
                  {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
                    onClick={() =>
                      void navigate({ to: "/students/$studentCode", params: { studentCode: s.id } })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void navigate({
                          to: "/students/$studentCode",
                          params: { studentCode: s.id },
                        });
                      }
                    }}
                  >
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
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingStudent(s);
                            setError("");
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      </td>
                    ) : null}
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
            key={editingStudent?.dbId ?? "new-student"}
            onSubmit={saveStudent}
            className="hairline-card w-full max-w-lg space-y-4 bg-card p-6 shadow-lift"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  {editingStudent ? "Student details" : "Student register"}
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {editingStudent ? `Edit ${editingStudent.name}` : "Add a student"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingStudent(null);
                  setOpen(false);
                }}
                aria-label="Close"
              >
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
                  defaultValue={
                    name === "name"
                      ? editingStudent?.name
                      : name === "id"
                        ? editingStudent?.id
                        : name === "cls"
                          ? editingStudent?.cls
                          : name === "guardian"
                            ? editingStudent?.guardian
                            : name === "guardianEmail"
                              ? (editingStudent?.guardianEmail ?? "")
                              : (editingStudent?.guardianPhone ?? "")
                  }
                />
              </label>
            ))}
            {error ? <p className="clay-shake text-sm text-danger">{error}</p> : null}
            <Button className="w-full gap-2">
              {editingStudent ? <Pencil className="size-4" /> : <UserPlus className="size-4" />}
              {editingStudent ? "Save changes" : "Save student"}
            </Button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
