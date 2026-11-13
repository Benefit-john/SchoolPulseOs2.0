import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { roleHome, type AppRole } from "@/lib/auth-client";

let cachedUserId: string | null = null;
let cachedRoles: AppRole[] | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid !== cachedUserId) {
    cachedUserId = uid;
    cachedRoles = null;
  }
});

export function getCachedRoles(): AppRole[] {
  return cachedRoles ?? [];
}

export async function requireRoles(allowed: AppRole[]) {
  const { data: sessionResult } = await supabase.auth.getSession();
  const user = sessionResult.session?.user;
  if (!user) throw redirect({ to: "/sign-in" });

  if (cachedUserId === user.id && cachedRoles) {
    if (!cachedRoles.some((role) => allowed.includes(role))) {
      if (cachedRoles[0]) throw redirect(roleHome(cachedRoles[0]));
      throw redirect({ to: "/welcome" });
    }
    return { user, roles: cachedRoles };
  }

  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (error) throw error;
  const assignedRoles = (roles ?? []).map((row) => row.role as AppRole);
  cachedUserId = user.id;
  cachedRoles = assignedRoles;
  if (!assignedRoles.some((role) => allowed.includes(role))) {
    if (assignedRoles[0]) throw redirect(roleHome(assignedRoles[0]));
    throw redirect({ to: "/welcome" });
  }
  return { user, roles: assignedRoles };
}
