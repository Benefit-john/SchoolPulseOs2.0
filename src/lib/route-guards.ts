import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { roleHome, type AppRole } from "@/lib/auth-client";

export async function requireRoles(allowed: AppRole[]) {
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw redirect({ to: "/sign-in" });
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userResult.user.id);
  if (error) throw error;
  const assignedRoles = (roles ?? []).map((row) => row.role as AppRole);
  if (!assignedRoles.some((role) => allowed.includes(role))) {
    if (assignedRoles[0]) throw redirect(roleHome(assignedRoles[0]));
    throw redirect({ to: "/welcome" });
  }
  return { user: userResult.user, roles: assignedRoles };
}
