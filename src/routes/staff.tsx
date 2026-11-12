import { createFileRoute } from "@tanstack/react-router";
import { requireRoles } from "@/lib/route-guards";
import { Plus, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSchoolStore } from "@/lib/school-store";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/staff")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "principal"]),
  component: StaffPage,
});
function StaffPage() {
  const { state, addStaff } = useSchoolStore();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
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
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await addStaff({
        name: String(f.get("name")),
        role: String(f.get("role")),
        dept: String(f.get("dept")),
        email: String(f.get("email") || ""),
        phone: String(f.get("phone") || ""),
      });
      setOpen(false);
      e.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save staff member");
    }
  };
  return (
    <AppShell
      title="Staff"
      subtitle={`${state.staff.length} members in this school workspace`}
      actions={
        canManage ? (
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add staff
          </Button>
        ) : null
      }
    >
      <div className="hairline-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3 text-right">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.staff.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-normal">
                      {s.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.dept}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{s.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.staff.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No staff members have been added yet.
            </p>
          ) : null}
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
                  Team directory
                </p>
                <h2 className="mt-1 text-xl font-bold">Add staff member</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            {[
              ["name", "Full name"],
              ["role", "Role"],
              ["dept", "Department"],
              ["email", "Email"],
              ["phone", "Phone"],
            ].map(([name, label]) => (
              <label key={name} className="block space-y-1 text-sm font-medium">
                {label}
                <Input
                  required={name !== "email" && name !== "phone"}
                  name={name}
                  type={name === "email" ? "email" : "text"}
                  placeholder={label}
                />
              </label>
            ))}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button className="w-full gap-2">
              <UserPlus className="size-4" /> Save staff member
            </Button>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
